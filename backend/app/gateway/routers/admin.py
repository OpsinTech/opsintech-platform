import asyncio
import logging
import os
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import delete, select

from app.gateway.audit import read_audit_events, record_audit_event
from app.gateway.auth_repository import AuthUserRepository
from app.gateway.authorization import require_admin_base, require_platform_admin, require_tenant_admin
from deerflow.config.paths import get_paths
from deerflow.database.models import Tenant, TenantMcpServer, TenantMembership, TenantModelConfig, TenantSkill, UserConfig
from deerflow.database.secrets_crypto import decrypt_app_payload, decrypt_model_settings, encrypt_app_payload
from deerflow.database.session import get_session_factory
from deerflow.database.tenant_service import (
    add_tenant_member,
    create_tenant,
    normalize_tenant_role,
    tenant_role_has_admin_capability,
    update_tenant_member_role,
)
from deerflow.database.user_config_service import (
    PLATFORM_MODEL_OWNER_ID,
    assign_platform_model_to_tenant,
    create_user_model,
    delete_global_model_with_assignments,
    delete_user_model,
    list_platform_assigned_models_for_tenant,
    list_platform_global_models,
    unassign_platform_model_from_tenant,
    update_user_model,
)
from deerflow.models.factory import _maybe_patch_openai_model_class
from deerflow.reflection.resolvers import resolve_class

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminMeResponse(BaseModel):
    user_id: str
    role: str


class AdminUser(BaseModel):
    id: str
    email: str | None = None
    name: str | None = None
    role: str = "user"
    status: str | None = None
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    must_change_password: bool | None = Field(default=None, alias="mustChangePassword")
    is_bootstrap_admin: bool | None = Field(default=None, alias="isBootstrapAdmin")


class AdminUsersResponse(BaseModel):
    users: list[AdminUser]


class AdminCreateUserRequest(BaseModel):
    email: str
    name: str
    password: str
    role: str = "user"
    status: str = "active"
    must_change_password: bool = True

class AdminUserStatusUpdateRequest(BaseModel):
    status: Literal["active", "suspended"]


class AdminResetUserPasswordRequest(BaseModel):
    new_password: str
    must_change_password: bool = True


class AdminDeleteUserResponse(BaseModel):
    user_id: str
    deleted_sessions: int
    deleted_accounts: int
    deleted_files: int
    deleted_bytes: int
    deleted_user_data_dir: bool


class AdminUserUsage(BaseModel):
    user_id: str
    thread_count: int
    upload_file_count: int
    upload_bytes_total: int
    thread_soft_limit: int | None = None
    upload_bytes_soft_limit: int | None = None
    thread_over_soft_limit: bool = False
    upload_bytes_over_soft_limit: bool = False


class AdminUsersUsageResponse(BaseModel):
    users: list[AdminUserUsage]


class AdminOverviewResponse(BaseModel):
    total_users: int
    active_users: int
    suspended_users: int
    total_threads: int
    total_files: int
    total_bytes: int
    total_tenants: int
    active_tenants: int
    platform_model_template_count: int
    assigned_model_count: int
    bootstrap_admin_users: int
    must_change_password_users: int
    recent_new_users_7d: int


class AdminAuditEvent(BaseModel):
    ts: str
    event_type: str
    severity: str
    actor_id: str | None = None
    target_user_id: str | None = None
    tenant_id: str | None = None
    scope: str | None = None
    metadata: dict = Field(default_factory=dict)


class AdminAuditLogsResponse(BaseModel):
    events: list[AdminAuditEvent]


class TenantAuditLogsResponse(BaseModel):
    tenant_id: str
    events: list[AdminAuditEvent]


def _get_auth_repo() -> AuthUserRepository:
    return AuthUserRepository()



def _safe_iterdir(path: Path) -> list[Path]:
    if not path.exists() or not path.is_dir():
        return []
    return [p for p in path.iterdir()]


def _collect_user_usage(user_id: str, tenant_id: str | None = None) -> AdminUserUsage:
    paths = get_paths()
    if tenant_id:
        users_root_items = [paths.base_dir / "tenants" / tenant_id / "users" / user_id]
    else:
        users_root_items = []
        tenants_dir = paths.base_dir / "tenants"
        if tenants_dir.exists():
            for tenant_path in filter(lambda p: p.is_dir(), tenants_dir.iterdir()):
                user_path = tenant_path / "users" / user_id
                if user_path.exists():
                    users_root_items.append(user_path)
        legacy_path = paths.base_dir / "users" / user_id
        if legacy_path.exists():
            users_root_items.append(legacy_path)
    
    thread_count = 0
    upload_file_count = 0
    upload_bytes_total = 0
    
    for users_root in users_root_items:
        threads_root = users_root / "threads"
        thread_dirs = [p for p in _safe_iterdir(threads_root) if p.is_dir()]
        thread_count += len(thread_dirs)

        for thread_dir in thread_dirs:
            uploads_dir = thread_dir / "user-data" / "uploads"
            if not uploads_dir.exists() or not uploads_dir.is_dir():
                continue
            for entry in uploads_dir.rglob("*"):
                if entry.is_file():
                    upload_file_count += 1
                    try:
                        upload_bytes_total += entry.stat().st_size
                    except OSError:
                        continue

    thread_soft_limit = _parse_positive_int_env("ADMIN_THREAD_SOFT_LIMIT")
    upload_bytes_soft_limit = _parse_positive_int_env("ADMIN_UPLOAD_BYTES_SOFT_LIMIT")

    return AdminUserUsage(
        user_id=user_id,
        thread_count=thread_count,
        upload_file_count=upload_file_count,
        upload_bytes_total=upload_bytes_total,
        thread_soft_limit=thread_soft_limit,
        upload_bytes_soft_limit=upload_bytes_soft_limit,
        thread_over_soft_limit=thread_soft_limit is not None and thread_count > thread_soft_limit,
        upload_bytes_over_soft_limit=upload_bytes_soft_limit is not None and upload_bytes_total > upload_bytes_soft_limit,
    )


def _collect_user_storage_stats(user_id: str, tenant_id: str | None = None) -> tuple[Path, int, int]:
    paths = get_paths()
    if tenant_id:
        user_root = paths.base_dir / "tenants" / tenant_id / "users" / user_id
    else:
        user_root = paths.base_dir / "users" / user_id
        if not user_root.exists():
            tenants_dir = paths.base_dir / "tenants"
            if tenants_dir.exists():
                for tenant_path in filter(lambda p: p.is_dir(), tenants_dir.iterdir()):
                    potential_user_path = tenant_path / "users" / user_id
                    if potential_user_path.exists():
                        user_root = potential_user_path
                        break
    
    if not user_root.exists() or not user_root.is_dir():
        return user_root, 0, 0

    file_count = 0
    total_bytes = 0
    for entry in user_root.rglob("*"):
        if entry.is_file():
            file_count += 1
            try:
                total_bytes += entry.stat().st_size
            except OSError:
                continue
    return user_root, file_count, total_bytes


def _parse_positive_int_env(name: str) -> int | None:
    value = os.getenv(name)
    if value is None or not value.strip():
        return None
    try:
        parsed = int(value)
    except ValueError:
        logger.warning("Invalid integer env for %s: %r", name, value)
        return None
    if parsed <= 0:
        logger.warning("Expected positive integer env for %s, got: %r", name, value)
        return None
    return parsed


def _list_all_auth_users(repo: AuthUserRepository, batch_size: int = 500) -> list[dict[str, Any]]:
    users: list[dict[str, Any]] = []
    offset = 0
    safe_batch_size = max(1, batch_size)
    while True:
        batch = repo.list_users(limit=safe_batch_size, offset=offset)
        if not batch:
            break
        users.extend(batch)
        if len(batch) < safe_batch_size:
            break
        offset += safe_batch_size
    return users


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


@router.get("/me", response_model=AdminMeResponse, dependencies=[Depends(require_platform_admin)])
async def get_admin_me(request: Request) -> AdminMeResponse:
    user_id = getattr(request.state, "user_id", None)
    role = getattr(request.state, "tenant_role", None) or getattr(request.state, "user_role", None)
    if not user_id or not role:
        raise HTTPException(status_code=401, detail="Missing user context")
    return AdminMeResponse(user_id=user_id, role=role)


@router.get("/users", response_model=AdminUsersResponse, dependencies=[Depends(require_platform_admin)])
async def list_users(keyword: str | None = None, limit: int = 50, offset: int = 0) -> AdminUsersResponse:
    try:
        repo = _get_auth_repo()
        rows = repo.list_users(keyword=keyword, limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query users: {exc}") from exc

    users = [
        AdminUser(
            id=str(row["id"]),
            email=row["email"],
            name=row["name"],
            role=row["role"] or "user",
            status=row.get("status"),
            createdAt=row["createdAt"],
            updatedAt=row["updatedAt"],
            mustChangePassword=bool(row.get("mustChangePassword", False)),
            isBootstrapAdmin=bool(row.get("isBootstrapAdmin", False)),
        )
        for row in rows
    ]
    return AdminUsersResponse(users=users)


@router.post("/users", response_model=AdminUser, dependencies=[Depends(require_platform_admin)])
async def create_user(request: AdminCreateUserRequest) -> AdminUser:
    try:
        repo = _get_auth_repo()
        new_user = repo.create_user(
            email=request.email,
            name=request.name,
            password=request.password,
            role=request.role,
            status=request.status,
            must_change_password=request.must_change_password
        )
        return AdminUser(
            id=new_user["id"],
            email=new_user["email"],
            name=new_user["name"],
            role=new_user["role"],
            status=new_user["status"],
            createdAt=new_user["createdAt"],
            updatedAt=new_user["updatedAt"],
            mustChangePassword=new_user["mustChangePassword"],
            isBootstrapAdmin=new_user["isBootstrapAdmin"]
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create user: {exc}") from exc

@router.patch(
    "/users/{target_user_id}/status",
    response_model=AdminUser,
    dependencies=[Depends(require_platform_admin)],
)
async def update_user_status(
    req: Request,
    target_user_id: str,
    request: AdminUserStatusUpdateRequest,
) -> AdminUser:
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    try:
        repo = _get_auth_repo()
        row = repo.update_user_status(target_user_id, request.status, now)
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="User status column not available")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update user status: {exc}") from exc

    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    record_audit_event(
        "admin.user.status.updated",
        actor_id=req.state.user_id,
        target_user_id=target_user_id,
        severity="warning" if request.status == "suspended" else "info",
        metadata={"status": request.status},
    )

    return AdminUser(
        id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        role=row["role"] or "user",
        status=row["status"],
        createdAt=row["createdAt"],
        updatedAt=row["updatedAt"],
    )


@router.put(
    "/users/{target_user_id}/password",
    dependencies=[Depends(require_platform_admin)],
)
async def admin_reset_user_password(
    req: Request,
    target_user_id: str,
    body: AdminResetUserPasswordRequest,
):
    if not body.new_password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty")

    repo = _get_auth_repo()
    target_user = repo.get_user_by_id(target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    success = repo.update_user_password(
        target_user_id,
        body.new_password,
        must_change_password=body.must_change_password,
    )
    if not success:
        raise HTTPException(status_code=404, detail="User credential account not found")

    record_audit_event(
        "admin.user.password.reset",
        actor_id=req.state.user_id,
        target_user_id=target_user_id,
        severity="warning",
        metadata={"must_change_password": body.must_change_password},
    )

    return {"status": "success", "message": "User password updated"}


@router.delete(
    "/users/{target_user_id}",
    response_model=AdminDeleteUserResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_delete_user(req: Request, target_user_id: str) -> AdminDeleteUserResponse:
    actor_id = getattr(req.state, "user_id", None)
    if actor_id == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot delete current admin account")

    repo = _get_auth_repo()
    target_user = repo.get_user_by_id(target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if bool(target_user.get("isBootstrapAdmin", False)):
        raise HTTPException(status_code=400, detail="Cannot delete bootstrap admin")

    user_root, file_count, total_bytes = _collect_user_storage_stats(target_user_id, tenant_id=getattr(req.state, "tenant_id", None))
    deleted_user_data_dir = False

    if user_root.exists() and user_root.is_dir():
        try:
            shutil.rmtree(user_root)
            deleted_user_data_dir = True
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to delete user files: {exc}") from exc

    result = repo.delete_user_cascade(target_user_id)
    if not result["deleted"]:
        raise HTTPException(status_code=404, detail="User not found")

    record_audit_event(
        "admin.user.deleted",
        actor_id=actor_id,
        target_user_id=target_user_id,
        severity="critical",
        metadata={
            "deleted_sessions": result["counts"]["sessions"],
            "deleted_accounts": result["counts"]["accounts"],
            "deleted_files": file_count,
            "deleted_bytes": total_bytes,
        },
    )

    return AdminDeleteUserResponse(
        user_id=target_user_id,
        deleted_sessions=result["counts"]["sessions"],
        deleted_accounts=result["counts"]["accounts"],
        deleted_files=file_count,
        deleted_bytes=total_bytes,
        deleted_user_data_dir=deleted_user_data_dir,
    )


@router.get("/users/usage", response_model=AdminUsersUsageResponse, dependencies=[Depends(require_platform_admin)])
async def list_users_usage(request: Request) -> AdminUsersUsageResponse:
    try:
        repo = _get_auth_repo()
        rows = _list_all_auth_users(repo)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query users: {exc}") from exc

    usage_rows = [_collect_user_usage(str(row["id"])) for row in rows]
    return AdminUsersUsageResponse(users=usage_rows)


@router.get("/overview", response_model=AdminOverviewResponse, dependencies=[Depends(require_platform_admin)])
async def get_admin_overview() -> AdminOverviewResponse:
    try:
        repo = _get_auth_repo()
        users = _list_all_auth_users(repo)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query users: {exc}") from exc

    total_users = len(users)
    suspended_users = sum(1 for user in users if str(user.get("status", "")).strip().lower() == "suspended")
    active_users = total_users - suspended_users
    bootstrap_admin_users = sum(1 for user in users if bool(user.get("isBootstrapAdmin", False)))
    must_change_password_users = sum(1 for user in users if bool(user.get("mustChangePassword", False)))

    now_utc = datetime.now(UTC)
    recent_new_users_7d = 0
    for user in users:
        created_at = _parse_iso_datetime(user.get("createdAt"))
        if created_at is None:
            continue
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        if created_at >= now_utc - timedelta(days=7):
            recent_new_users_7d += 1

    total_threads = 0
    total_files = 0
    total_bytes = 0
    for user in users:
        usage = _collect_user_usage(str(user["id"]))
        total_threads += usage.thread_count
        total_files += usage.upload_file_count
        total_bytes += usage.upload_bytes_total

    session_factory = get_session_factory()
    async with session_factory() as session:
        tenants = (await session.execute(select(Tenant))).scalars().all()
        assigned_models = (
            await session.execute(
                select(TenantModelConfig).where(
                    TenantModelConfig.tenant_id.is_not(None),
                )
            )
        ).scalars().all()

    total_tenants = len(tenants)
    active_tenants = sum(1 for tenant in tenants if str(getattr(tenant, "status", "")).strip().lower() == "active")

    platform_model_template_count = len(await list_platform_global_models())

    return AdminOverviewResponse(
        total_users=total_users,
        active_users=active_users,
        suspended_users=suspended_users,
        total_threads=total_threads,
        total_files=total_files,
        total_bytes=total_bytes,
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        platform_model_template_count=platform_model_template_count,
        assigned_model_count=len(assigned_models),
        bootstrap_admin_users=bootstrap_admin_users,
        must_change_password_users=must_change_password_users,
        recent_new_users_7d=recent_new_users_7d,
    )


@router.get("/audit/logs", response_model=AdminAuditLogsResponse, dependencies=[Depends(require_platform_admin)])
async def get_audit_logs(
    limit: int = 100,
    tenant_id: str | None = None,
    scope: Literal["platform", "tenant", "user"] | None = None,
) -> AdminAuditLogsResponse:
    safe_limit = max(1, min(limit, 1000))
    rows = read_audit_events(limit=safe_limit, tenant_id=tenant_id, scope=scope)
    rows = rows[:safe_limit]
    return AdminAuditLogsResponse(events=[AdminAuditEvent(**row) for row in rows])


@router.get("/tenant-audit/logs", response_model=TenantAuditLogsResponse, dependencies=[Depends(require_tenant_admin)])
async def get_tenant_audit_logs(
    request: Request,
    limit: int = 100,
    scope: Literal["tenant", "user"] | None = None,
) -> TenantAuditLogsResponse:
    tenant_id = str(getattr(request.state, "tenant_id", "") or "").strip()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context is required")

    safe_limit = max(1, min(limit, 1000))
    rows = read_audit_events(limit=safe_limit, tenant_id=tenant_id, scope=scope)
    rows = [row for row in rows if row.get("scope") != "platform"]
    return TenantAuditLogsResponse(
        tenant_id=tenant_id,
        events=[AdminAuditEvent(**row) for row in rows],
    )

class BootstrapStatusResponse(BaseModel):
    is_bootstrap_admin: bool
    must_change_password: bool

class ChangePasswordRequest(BaseModel):
    new_password: str

@router.get("/bootstrap-status", response_model=BootstrapStatusResponse, dependencies=[Depends(require_admin_base)])
async def get_bootstrap_status(request: Request) -> BootstrapStatusResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    repo = _get_auth_repo()
    user = repo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return BootstrapStatusResponse(
        is_bootstrap_admin=bool(user.get("isBootstrapAdmin", False)),
        must_change_password=bool(user.get("mustChangePassword", False))
    )

@router.post("/change-initial-password", dependencies=[Depends(require_admin_base)])
async def change_initial_password(request: Request, body: ChangePasswordRequest):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    # Verify user actually needs to change password
    if not getattr(request.state, "must_change_password", False):
        raise HTTPException(status_code=400, detail="User does not need to change initial password")
        
    repo = _get_auth_repo()
    
    success = repo.update_user_password(user_id, body.new_password, must_change_password=False)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update password")
    
    # Record audit event
    record_audit_event(
        event_type="password_changed",
        severity="info",
        actor_id=user_id,
        target_user_id=user_id,
        metadata={"is_initial": True}
    )
    
    return {"status": "success", "message": "Initial password changed successfully"}

@router.post("/change-password", dependencies=[Depends(require_platform_admin)])
async def change_password(request: Request, body: ChangePasswordRequest):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    repo = _get_auth_repo()
    
    success = repo.update_user_password(user_id, body.new_password, must_change_password=False)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update password")
        
    record_audit_event(
        event_type="password_changed",
        severity="info",
        actor_id=user_id,
        target_user_id=user_id,
        metadata={"is_initial": False}
    )
    
    return {"status": "success", "message": "Password changed successfully"}

class AdminTenantMemberSummary(BaseModel):
    user_id: str
    user_name: str | None = None
    role: str


class AdminTenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    status: str
    created_at: datetime
    member_count: int
    member_summaries: list[AdminTenantMemberSummary] = Field(default_factory=list)

class AdminTenantsListResponse(BaseModel):
    tenants: list[AdminTenantResponse]

class AdminCreateTenantRequest(BaseModel):
    name: str
    slug: str | None = None
    owner_user_id: str
    owner_role: Literal["tenant_admin"] = "tenant_admin"

@router.get("/tenants", response_model=AdminTenantsListResponse, dependencies=[Depends(require_platform_admin)])
async def list_all_tenants():
    session_factory = get_session_factory()
    repo = _get_auth_repo()
    async with session_factory() as session:
        tenants = (await session.execute(select(Tenant))).scalars().all()
        
        result = []
        for t in tenants:
            members = (
                await session.execute(
                    select(TenantMembership).where(
                        TenantMembership.tenant_id == t.id,
                        TenantMembership.status == "active",
                    )
                )
            ).scalars().all()

            member_summaries: list[AdminTenantMemberSummary] = []
            for member in members:
                user = repo.get_user_by_id(member.user_id)
                user_name = None
                if user is not None:
                    user_name = user.get("name") or user.get("email")
                member_summaries.append(
                    AdminTenantMemberSummary(
                        user_id=member.user_id,
                        user_name=user_name,
                        role=normalize_tenant_role(member.role),
                    )
                )

            result.append(AdminTenantResponse(
                id=t.id,
                name=t.name,
                slug=t.slug,
                status=t.status,
                created_at=t.created_at,
                member_count=len(members),
                member_summaries=member_summaries,
            ))
        return AdminTenantsListResponse(tenants=result)

@router.post("/tenants", dependencies=[Depends(require_platform_admin)])
async def admin_create_tenant(req: Request, body: AdminCreateTenantRequest):
    repo = _get_auth_repo()
    owner_user_id = str(body.owner_user_id or "").strip()
    if not owner_user_id:
        raise HTTPException(status_code=422, detail="owner_user_id is required")

    owner = repo.get_user_by_id(owner_user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="owner_user_id not found")
    if str(owner.get("role") or "").strip().lower() == "admin":
        raise HTTPException(status_code=400, detail="平台 admin 用户不能作为租户初始用户")

    tenant = await create_tenant(name=body.name, owner_user_id=owner_user_id, slug=body.slug)

    record_audit_event(
        "platform.tenant.created",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant.id,
        scope="platform",
        severity="info",
        metadata={
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "owner_user_id": owner_user_id,
            "owner_role": "tenant_admin",
        },
    )
    return {
        "status": "success",
        "tenant_id": tenant.id,
        "initial_user_id": owner_user_id,
        "initial_user_role": "tenant_admin",
        "initial_tenant_admin_user_id": owner_user_id,
    }

@router.delete("/tenants/{tenant_id}", dependencies=[Depends(require_platform_admin)])
async def admin_delete_tenant(req: Request, tenant_id: str):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        # For safety we just mark inactive instead of hard delete
        tenant.status = "inactive"
        session.add(tenant)
        await session.commit()
    
    record_audit_event(
        "platform.tenant.deactivated",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={"tenant_id": tenant_id},
    )
    return {"status": "success"}


@router.post("/tenants/{tenant_id}/restore", dependencies=[Depends(require_platform_admin)])
async def admin_restore_tenant(req: Request, tenant_id: str):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tenant.status = "active"
        session.add(tenant)
        await session.commit()

    record_audit_event(
        "platform.tenant.restored",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="info",
        metadata={"tenant_id": tenant_id},
    )
    return {"status": "success", "tenant_id": tenant_id, "tenant_status": "active"}


@router.delete("/tenants/{tenant_id}/purge", dependencies=[Depends(require_platform_admin)])
async def admin_purge_tenant(req: Request, tenant_id: str):
    session_factory = get_session_factory()
    tenant_data_dir = get_paths().base_dir / "tenants" / tenant_id
    deleted_tenant_data_dir = False

    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        if str(tenant.status).lower() != "inactive":
            raise HTTPException(status_code=409, detail="Tenant must be inactive before hard delete")

        membership_result = await session.execute(delete(TenantMembership).where(TenantMembership.tenant_id == tenant_id))
        user_config_result = await session.execute(delete(UserConfig).where(UserConfig.tenant_id == tenant_id))
        model_result = await session.execute(delete(TenantModelConfig).where(TenantModelConfig.tenant_id == tenant_id))
        mcp_result = await session.execute(delete(TenantMcpServer).where(TenantMcpServer.tenant_id == tenant_id))
        skill_result = await session.execute(delete(TenantSkill).where(TenantSkill.tenant_id == tenant_id))

        global_configs = (
            await session.execute(select(UserConfig).where(UserConfig.tenant_id.is_(None)))
        ).scalars().all()
        cleared_current_tenant_refs = 0
        for config in global_configs:
            app_payload = decrypt_app_payload(dict(config.app_config or {}))
            if app_payload.get("current_tenant_id") != tenant_id:
                continue
            app_payload.pop("current_tenant_id", None)
            config.app_config = encrypt_app_payload(app_payload)
            session.add(config)
            cleared_current_tenant_refs += 1

        await session.delete(tenant)
        await session.commit()

    if tenant_data_dir.exists():
        try:
            shutil.rmtree(tenant_data_dir)
            deleted_tenant_data_dir = True
        except OSError as exc:
            logger.warning("failed to remove tenant data directory %s: %s", tenant_data_dir, exc)

    record_audit_event(
        "platform.tenant.purged",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={
            "tenant_id": tenant_id,
            "deleted_memberships": int(membership_result.rowcount or 0),
            "deleted_user_configs": int(user_config_result.rowcount or 0),
            "deleted_model_configs": int(model_result.rowcount or 0),
            "deleted_mcp_servers": int(mcp_result.rowcount or 0),
            "deleted_skills": int(skill_result.rowcount or 0),
            "cleared_current_tenant_refs": cleared_current_tenant_refs,
            "deleted_tenant_data_dir": deleted_tenant_data_dir,
        },
    )

    return {
        "status": "success",
        "tenant_id": tenant_id,
        "deleted_memberships": int(membership_result.rowcount or 0),
        "deleted_user_configs": int(user_config_result.rowcount or 0),
        "deleted_model_configs": int(model_result.rowcount or 0),
        "deleted_mcp_servers": int(mcp_result.rowcount or 0),
        "deleted_skills": int(skill_result.rowcount or 0),
        "cleared_current_tenant_refs": cleared_current_tenant_refs,
        "deleted_tenant_data_dir": deleted_tenant_data_dir,
    }


@router.post("/tenants/{tenant_id}/freeze", dependencies=[Depends(require_platform_admin)])
async def admin_freeze_tenant(req: Request, tenant_id: str):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tenant.status = "frozen"
        session.add(tenant)
        await session.commit()

    record_audit_event(
        "platform.tenant.frozen",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={"tenant_id": tenant_id},
    )
    return {"status": "success", "tenant_id": tenant_id, "tenant_status": "frozen"}


@router.post("/tenants/{tenant_id}/unfreeze", dependencies=[Depends(require_platform_admin)])
async def admin_unfreeze_tenant(req: Request, tenant_id: str):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tenant.status = "active"
        session.add(tenant)
        await session.commit()

    record_audit_event(
        "platform.tenant.unfrozen",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="info",
        metadata={"tenant_id": tenant_id},
    )
    return {"status": "success", "tenant_id": tenant_id, "tenant_status": "active"}

class AdminTenantMemberResponse(BaseModel):
    user_id: str
    role: str
    status: str

class AdminTenantMembersListResponse(BaseModel):
    members: list[AdminTenantMemberResponse]

class AdminAddTenantMemberRequest(BaseModel):
    user_id: str
    role: Literal["tenant_admin", "tenant_member"] = "tenant_member"

class AdminUpdateTenantMemberRequest(BaseModel):
    role: Literal["tenant_admin", "tenant_member"]

class AdminInitializeTenantAdminRequest(BaseModel):
    user_id: str


class AdminResetTenantAdminRequest(BaseModel):
    user_id: str
    demote_other_active_admins: bool = False


@router.post("/tenants/{tenant_id}/members/initialize-admin", dependencies=[Depends(require_platform_admin)])
async def admin_initialize_tenant_admin(req: Request, tenant_id: str, body: AdminInitializeTenantAdminRequest):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant not found")

        active_members = (
            await session.execute(
                select(TenantMembership).where(
                    TenantMembership.tenant_id == tenant_id,
                    TenantMembership.status == "active",
                )
            )
        ).scalars().all()

    if active_members:
        raise HTTPException(
            status_code=409,
            detail="Tenant already has active members; use tenant governance for daily operations",
        )

    repo = _get_auth_repo()
    target_user = repo.get_user_by_id(body.user_id)
    if target_user is None:
        raise HTTPException(status_code=404, detail="user_id not found")

    membership = await add_tenant_member(tenant_id, body.user_id, "tenant_admin")
    record_audit_event(
        "platform.tenant.admin.initialized",
        actor_id=getattr(req.state, "user_id", "system"),
        target_user_id=body.user_id,
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={"tenant_id": tenant_id, "user_id": body.user_id, "role": normalize_tenant_role(membership.role)},
    )
    return {"status": "success", "tenant_id": tenant_id, "user_id": body.user_id, "role": "tenant_admin"}


@router.post("/tenants/{tenant_id}/members/reset-admin", dependencies=[Depends(require_platform_admin)])
async def admin_reset_tenant_admin(req: Request, tenant_id: str, body: AdminResetTenantAdminRequest):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant not found")

        active_members = (
            await session.execute(
                select(TenantMembership).where(
                    TenantMembership.tenant_id == tenant_id,
                    TenantMembership.status == "active",
                )
            )
        ).scalars().all()

    repo = _get_auth_repo()
    target_user = repo.get_user_by_id(body.user_id)
    if target_user is None:
        raise HTTPException(status_code=404, detail="user_id not found")
    if str(target_user.get("role") or "").strip().lower() == "admin":
        raise HTTPException(status_code=400, detail="平台 admin 用户不能作为租户管理员")

    prior_active_admin_user_ids = [
        member.user_id
        for member in active_members
        if tenant_role_has_admin_capability(member.role)
    ]

    membership = await add_tenant_member(tenant_id, body.user_id, "tenant_admin")

    demoted_user_ids: list[str] = []
    if body.demote_other_active_admins:
        for admin_user_id in prior_active_admin_user_ids:
            if admin_user_id == body.user_id:
                continue
            updated = await update_tenant_member_role(tenant_id, admin_user_id, "tenant_member")
            if updated is not None:
                demoted_user_ids.append(admin_user_id)

    record_audit_event(
        "platform.tenant.admin.reset",
        actor_id=getattr(req.state, "user_id", "system"),
        target_user_id=body.user_id,
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={
            "tenant_id": tenant_id,
            "user_id": body.user_id,
            "role": normalize_tenant_role(membership.role),
            "prior_active_admin_user_ids": prior_active_admin_user_ids,
            "demote_other_active_admins": body.demote_other_active_admins,
            "demoted_user_ids": demoted_user_ids,
        },
    )

    return {
        "status": "success",
        "tenant_id": tenant_id,
        "user_id": body.user_id,
        "role": "tenant_admin",
        "prior_active_admin_user_ids": prior_active_admin_user_ids,
        "demoted_user_ids": demoted_user_ids,
    }

class AdminUpdateTenantRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    status: str | None = None


class AdminGlobalModelResponse(BaseModel):
    name: str
    model: str
    use: str | None = None
    display_name: str | None = None
    description: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    supports_thinking: bool = False
    supports_reasoning_effort: bool = False
    supports_vision: bool = False
    supports_text2image: bool = False
    use_responses_api: bool | None = None
    output_version: str | None = None
    max_tokens: int | None = None
    max_input_tokens: int | None = None
    enabled: bool = True
    verify_ssl: bool = False
    model_type: str | None = None


class AdminGlobalModelsListResponse(BaseModel):
    models: list[AdminGlobalModelResponse]


class AdminAssignTenantModelRequest(BaseModel):
    model_name: str
    enabled: bool = True


class AdminGlobalModelCreateRequest(BaseModel):
    name: str
    model: str
    use: str = "langchain_openai.ChatOpenAI"
    display_name: str | None = None
    description: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    max_tokens: int | None = None
    use_responses_api: bool | None = None
    output_version: str | None = None
    supports_thinking: bool = False
    supports_reasoning_effort: bool = False
    supports_vision: bool = False
    supports_text2image: bool = False
    enabled: bool = True
    verify_ssl: bool = False
    max_input_tokens: int | None = None
    model_type: str | None = None


class AdminGlobalModelUpdateRequest(BaseModel):
    model: str | None = None
    use: str | None = None
    display_name: str | None = None
    description: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    max_tokens: int | None = None
    use_responses_api: bool | None = None
    output_version: str | None = None
    supports_thinking: bool | None = None
    supports_reasoning_effort: bool | None = None
    supports_vision: bool | None = None
    supports_text2image: bool | None = None
    enabled: bool | None = None
    verify_ssl: bool | None = None
    max_input_tokens: int | None = None
    model_type: str | None = None


class AdminTenantAssignedModelsResponse(BaseModel):
    tenant_id: str
    models: list[AdminGlobalModelResponse]

@router.put("/tenants/{tenant_id}", dependencies=[Depends(require_platform_admin)])
async def admin_update_tenant(tenant_id: str, body: AdminUpdateTenantRequest):
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        if body.name is not None:
            tenant.name = body.name
        if body.slug is not None:
            tenant.slug = body.slug
        if body.status is not None:
            tenant.status = body.status
            
        session.add(tenant)
        await session.commit()
    return {"status": "success"}


@router.get("/models/global", response_model=AdminGlobalModelsListResponse, dependencies=[Depends(require_platform_admin)])
async def list_global_models_for_platform_admin():
    rows = await list_platform_global_models()
    unique_rows = {row.name: row for row in rows}
    models = []
    for row in unique_rows.values():
        settings = decrypt_model_settings(dict(row.settings)) if isinstance(row.settings, dict) else {}
        models.append(
            AdminGlobalModelResponse(
                name=row.name,
                model=row.model,
                use=getattr(row, "use", None),
                display_name=getattr(row, "display_name", None),
                description=getattr(row, "description", None),
                api_key=settings.get("api_key"),
                base_url=settings.get("base_url"),
                supports_thinking=bool(getattr(row, "supports_thinking", False)),
                supports_reasoning_effort=bool(getattr(row, "supports_reasoning_effort", False)),
                supports_vision=bool(getattr(row, "supports_vision", False)),
                supports_text2image=bool(getattr(row, "supports_text2image", False)),
                use_responses_api=settings.get("use_responses_api"),
                output_version=settings.get("output_version"),
                max_tokens=settings.get("max_tokens"),
                enabled=bool(settings.get("enabled", True)),
                verify_ssl=bool(settings.get("verify_ssl", False)),
                max_input_tokens=getattr(row, "max_input_tokens", None),
                model_type=getattr(row, "model_type", None),
            )
        )
    return AdminGlobalModelsListResponse(models=models)


@router.post("/models/global", response_model=AdminGlobalModelResponse, dependencies=[Depends(require_platform_admin)])
async def create_global_model_for_platform_admin(req: Request, body: AdminGlobalModelCreateRequest):
    try:
        row = await create_user_model(PLATFORM_MODEL_OWNER_ID, body.model_dump(), tenant_id=None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    record_audit_event(
        "platform.model.global.created",
        actor_id=getattr(req.state, "user_id", "system"),
        scope="platform",
        severity="info",
        metadata={"model_name": row.name},
    )
    settings = decrypt_model_settings(dict(row.settings)) if isinstance(row.settings, dict) else {}
    return AdminGlobalModelResponse(
        name=row.name,
        model=row.model,
        use=getattr(row, "use", None),
        display_name=getattr(row, "display_name", None),
        description=getattr(row, "description", None),
        api_key=settings.get("api_key"),
        base_url=settings.get("base_url"),
        supports_thinking=bool(getattr(row, "supports_thinking", False)),
        supports_reasoning_effort=bool(getattr(row, "supports_reasoning_effort", False)),
        supports_vision=bool(getattr(row, "supports_vision", False)),
        supports_text2image=bool(getattr(row, "supports_text2image", False)),
        use_responses_api=settings.get("use_responses_api"),
        output_version=settings.get("output_version"),
        max_tokens=settings.get("max_tokens"),
        enabled=bool(settings.get("enabled", True)),
        verify_ssl=bool(settings.get("verify_ssl", True)),
        max_input_tokens=getattr(row, "max_input_tokens", None),
        model_type=getattr(row, "model_type", None),
    )


@router.put("/models/global/{model_name:path}", response_model=AdminGlobalModelResponse, dependencies=[Depends(require_platform_admin)])
async def update_global_model_for_platform_admin(req: Request, model_name: str, body: AdminGlobalModelUpdateRequest):
    try:
        row = await update_user_model(
            PLATFORM_MODEL_OWNER_ID,
            model_name,
            body.model_dump(exclude_unset=True),
            tenant_id=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    record_audit_event(
        "platform.model.global.updated",
        actor_id=getattr(req.state, "user_id", "system"),
        scope="platform",
        severity="info",
        metadata={"model_name": model_name},
    )
    settings = decrypt_model_settings(dict(row.settings)) if isinstance(row.settings, dict) else {}
    return AdminGlobalModelResponse(
        name=row.name,
        model=row.model,
        use=getattr(row, "use", None),
        display_name=getattr(row, "display_name", None),
        description=getattr(row, "description", None),
        api_key=settings.get("api_key"),
        base_url=settings.get("base_url"),
        supports_thinking=bool(getattr(row, "supports_thinking", False)),
        supports_reasoning_effort=bool(getattr(row, "supports_reasoning_effort", False)),
        supports_vision=bool(getattr(row, "supports_vision", False)),
        supports_text2image=bool(getattr(row, "supports_text2image", False)),
        use_responses_api=settings.get("use_responses_api"),
        output_version=settings.get("output_version"),
        max_tokens=settings.get("max_tokens"),
        enabled=bool(settings.get("enabled", True)),
        verify_ssl=bool(settings.get("verify_ssl", True)),
        max_input_tokens=getattr(row, "max_input_tokens", None),
        model_type=getattr(row, "model_type", None),
    )


@router.delete("/models/global/{model_name:path}", dependencies=[Depends(require_platform_admin)])
async def delete_global_model_for_platform_admin(req: Request, model_name: str):
    try:
        affected_tenants = await delete_global_model_with_assignments(model_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    record_audit_event(
        "platform.model.global.deleted",
        actor_id=getattr(req.state, "user_id", "system"),
        scope="platform",
        severity="warning",
        metadata={
            "model_name": model_name,
            "affected_tenants": affected_tenants,
            "deleted_count": len(affected_tenants),
        },
    )
    return {"status": "success", "model_name": model_name, "affected_tenants": affected_tenants}


@router.post("/tenants/{tenant_id}/models/assign", dependencies=[Depends(require_platform_admin)])
async def assign_global_model_to_tenant(req: Request, tenant_id: str, body: AdminAssignTenantModelRequest):
    try:
        row = await assign_platform_model_to_tenant(tenant_id, body.model_name, enabled=body.enabled)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    record_audit_event(
        "platform.tenant.model.assigned",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="info",
        metadata={"tenant_id": tenant_id, "model_name": body.model_name, "enabled": body.enabled},
    )
    return {"status": "success", "tenant_id": tenant_id, "model_name": row.name, "enabled": body.enabled}


@router.get(
    "/tenants/{tenant_id}/models/assigned",
    response_model=AdminTenantAssignedModelsResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def list_assigned_models_for_tenant(tenant_id: str):
    rows = await list_platform_assigned_models_for_tenant(tenant_id)
    models = []
    for row in rows:
        settings = decrypt_model_settings(dict(row.settings)) if isinstance(row.settings, dict) else {}
        models.append(
            AdminGlobalModelResponse(
                name=row.name,
                model=row.model,
                use=getattr(row, "use", None),
                display_name=getattr(row, "display_name", None),
                description=getattr(row, "description", None),
                api_key=settings.get("api_key"),
                base_url=settings.get("base_url"),
                supports_thinking=bool(getattr(row, "supports_thinking", False)),
                supports_reasoning_effort=bool(getattr(row, "supports_reasoning_effort", False)),
                supports_vision=bool(getattr(row, "supports_vision", False)),
                use_responses_api=settings.get("use_responses_api"),
                output_version=settings.get("output_version"),
                max_tokens=settings.get("max_tokens"),
                enabled=bool(settings.get("enabled", True)),
            )
        )
    return AdminTenantAssignedModelsResponse(tenant_id=tenant_id, models=models)


@router.delete("/tenants/{tenant_id}/models/{model_name:path}/assign", dependencies=[Depends(require_platform_admin)])
async def unassign_global_model_from_tenant(req: Request, tenant_id: str, model_name: str):
    try:
        await unassign_platform_model_from_tenant(tenant_id, model_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    record_audit_event(
        "platform.tenant.model.unassigned",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={"tenant_id": tenant_id, "model_name": model_name},
    )
    return {"status": "success", "tenant_id": tenant_id, "model_name": model_name}


@router.delete("/tenants/{tenant_id}/models/orphaned", dependencies=[Depends(require_platform_admin)])
async def delete_orphaned_tenant_models(req: Request, tenant_id: str, model_name: str | None = None):
    """Delete orphaned tenant model configs that no longer have a corresponding global model."""
    from deerflow.database.user_config_service import delete_orphaned_tenant_model

    try:
        deleted = await delete_orphaned_tenant_model(tenant_id, model_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    record_audit_event(
        "platform.tenant.model.orphaned.deleted",
        actor_id=getattr(req.state, "user_id", "system"),
        tenant_id=tenant_id,
        scope="platform",
        severity="warning",
        metadata={"tenant_id": tenant_id, "model_name": model_name, "deleted": deleted},
    )
    return {"status": "success", "tenant_id": tenant_id, "deleted": deleted}


class AdminTestModelConnectionRequest(BaseModel):
    model: str = Field(..., description="The actual provider model identifier to test")
    use: str = Field(default="langchain_openai.ChatOpenAI", description="Provider class path")
    base_url: str | None = Field(default=None, description="Optional provider base URL")
    api_key: str | None = Field(default=None, description="Optional provider API key")
    max_tokens: int = Field(default=32, description="Max tokens for the test call")
    verify_ssl: bool = Field(default=False, description="Verify SSL certificate when connecting")


class AdminTestModelConnectionResponse(BaseModel):
    success: bool
    message: str


@router.post(
    "/models/test-connection",
    response_model=AdminTestModelConnectionResponse,
    dependencies=[Depends(require_platform_admin)],
    summary="Test Model Connection (Platform Admin)",
    description="Test connectivity to a model provider by sending a minimal chat completion request.",
)
async def test_model_connection_for_platform_admin(body: AdminTestModelConnectionRequest) -> AdminTestModelConnectionResponse:
    try:
        model_class = resolve_class(body.use)
        model_class = _maybe_patch_openai_model_class(body.use, model_class)
    except Exception as exc:
        return AdminTestModelConnectionResponse(
            success=False,
            message=f"Invalid provider class '{body.use}': {exc}",
        )

    kwargs: dict = {
        "model": body.model,
        "temperature": 0,
        "request_timeout": 15,
    }
    if body.base_url:
        kwargs["base_url"] = body.base_url.rstrip("/")
    if body.api_key:
        kwargs["api_key"] = body.api_key
    if not body.verify_ssl:
        import httpx
        kwargs["http_client"] = httpx.Client(verify=False, trust_env=False)
        kwargs["http_async_client"] = httpx.AsyncClient(verify=False, trust_env=False)
    if "api_key" not in kwargs:
        kwargs["api_key"] = "not-needed"
    # Map generic api_key to provider-specific parameter names
    if body.use.startswith("langchain_anthropic"):
        kwargs["anthropic_api_key"] = kwargs.pop("api_key")
    elif body.use.startswith("langchain_google_genai"):
        kwargs["google_api_key"] = kwargs.pop("api_key")

    try:
        instance = model_class(**kwargs)
        result = await asyncio.wait_for(
            asyncio.to_thread(instance.invoke, "Reply with exactly: ok"),
            timeout=15,
        )
        content = result.content if hasattr(result, "content") else str(result)
        preview = str(content)[:300]
        return AdminTestModelConnectionResponse(
            success=True,
            message=f"Connection successful. Model response: {preview}",
        )
    except asyncio.TimeoutError:
        return AdminTestModelConnectionResponse(
            success=False,
            message="Connection timed out after 15 seconds. Check the base URL and API key, or try again.",
        )
    except Exception as exc:
        err_msg = str(exc)
        if len(err_msg) > 500:
            err_msg = err_msg[:500] + "..."
        return AdminTestModelConnectionResponse(
            success=False,
            message=f"Connection failed: {err_msg}",
        )

