import logging
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.gateway.auth_db import (
    auth_connection,
    column_exists,
    _row_to_dict,
)
from deerflow.config.tenant_context import reset_tenant_context, set_tenant_context
from deerflow.database.tenant_service import ensure_default_tenant_for_user, get_membership, list_user_tenants, normalize_tenant_role
from deerflow.database.user_config_service import get_current_tenant_id, set_current_tenant_id

logger = logging.getLogger(__name__)


def _parse_iso_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _resolve_user_from_auth_db(token: str) -> tuple[str, str, bool] | None:
    """Fallback token validation by reading Better Auth tables directly."""
    try:
        with auth_connection() as conn:
            try:
                result = conn.execute(
                    text(
                        "SELECT u.id AS user_id, u.role AS user_role, s.\"expiresAt\" AS expires_at, u.\"mustChangePassword\" "
                        "FROM session s "
                        "JOIN \"user\" u ON u.id = s.\"userId\" "
                        "WHERE s.token = :token "
                        "LIMIT 1"
                    ),
                    {"token": token},
                )
                row = result.fetchone()
            except Exception:
                result = conn.execute(
                    text(
                        "SELECT u.id AS user_id, u.role AS user_role, s.\"expiresAt\" AS expires_at "
                        "FROM session s "
                        "JOIN \"user\" u ON u.id = s.\"userId\" "
                        "WHERE s.token = :token "
                        "LIMIT 1"
                    ),
                    {"token": token},
                )
                row = result.fetchone()
    except Exception as exc:
        logger.warning("Failed to resolve user from auth db: %s", exc)
        return None

    if row is None:
        return None

    row_dict = _row_to_dict(row)
    expires_at = _parse_iso_datetime(row_dict.get("expires_at"))
    if expires_at is not None and expires_at <= datetime.now(UTC):
        return None

    must_change = False
    try:
        if "mustChangePassword" in row_dict:
            must_change = bool(row_dict["mustChangePassword"])
    except Exception:
        pass

    return str(row_dict["user_id"]), str(row_dict.get("user_role") or "user"), must_change


def _resolve_user_status_from_auth_db(user_id: str) -> str | None:
    """Resolve user status from auth db when the status column is available.

    Returns None when db/table/column is unavailable so existing deployments
    without status migration continue to work.
    """
    try:
        with auth_connection() as conn:
            if not column_exists(conn, "user", "status"):
                return None

            result = conn.execute(
                text(
                    "SELECT status FROM \"user\" WHERE id = :uid LIMIT 1"
                ),
                {"uid": user_id},
            )
            row = result.fetchone()
    except Exception as exc:
        logger.warning("Failed to resolve user status from auth db: %s", exc)
        return None

    if row is None:
        return None
    row_dict = _row_to_dict(row)
    status = row_dict.get("status")
    if status is None:
        return None
    return str(status)


def _get_tenant_id_from_header(request: Request) -> str | None:
    """Extract tenant id from request header if present."""
    tenant_id = request.headers.get("X-Tenant-Id")
    if tenant_id is None:
        return None
    normalized = tenant_id.strip()
    return normalized or None


async def _resolve_tenant_id(user_id: str, requested_tenant_id: str | None) -> str:
    """Resolve tenant id for request with membership guard and safe fallback.

    When tenant tables are not yet migrated in a running environment, fallback to
    a deterministic personal tenant id to avoid hard downtime during rollout.
    """
    if requested_tenant_id:
        membership = await get_membership(user_id=user_id, tenant_id=requested_tenant_id)
        if membership is None:
            raise PermissionError("User is not a member of the requested tenant")
        return requested_tenant_id

    persisted_tenant_id = await get_current_tenant_id(user_id)
    if persisted_tenant_id:
        membership = await get_membership(user_id=user_id, tenant_id=persisted_tenant_id)
        if membership is not None:
            return persisted_tenant_id

    rows = await list_user_tenants(user_id)
    if not rows:
        raise PermissionError("NO_TENANT_ASSIGNED")

    tenant_id = rows[0][0].id
    await set_current_tenant_id(user_id, tenant_id)
    return tenant_id


async def _resolve_tenant_role(user_id: str, tenant_id: str) -> str | None:
    """Resolve active membership role for the current user+tenant pair."""
    try:
        membership = await get_membership(user_id=user_id, tenant_id=tenant_id)
    except Exception as exc:
        logger.warning("Tenant role resolution failed for user %s tenant %s: %s", user_id, tenant_id, exc)
        return None

    if membership is None:
        return None

    role = str(getattr(membership, "role", "") or "").strip()
    if not role:
        return None
    try:
        return normalize_tenant_role(role)
    except ValueError:
        logger.warning("Invalid tenant role value '%s' for user %s tenant %s", role, user_id, tenant_id)
        return None


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, exclude_paths: list[str] = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or [
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/api/auth/bootstrap-status",
            "/api/auth/setup-bootstrap-admin",
            "/api/auth/login",
            "/api/auth/signup",
            "/api/auth/session",
            "/api/auth/logout",
            "/api/alerts/ingest/",  # source-level token auth
            "/api/changes/ingest/",  # source-level token auth (CI/CD webhooks)
        ]

    async def dispatch(self, request: Request, call_next):
        tenant_token = None
        # Exclude unauthenticated endpoints
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        # Allow preflight cors requests unconditionally
        if request.method == "OPTIONS":
            return await call_next(request)

        # Get token from header, cookie, or query param
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

        # Query param token takes priority over cookie (for new-tab artifact links)
        if not token and "token" in request.query_params:
            token = request.query_params.get("token")

        if not token:
            token = request.cookies.get(
                "better-auth.session_token"
            ) or request.cookies.get("__Secure-better-auth.session_token")

        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid authorization header"},
            )
        
        requested_tenant_id = _get_tenant_id_from_header(request)

        try:
            db_user = _resolve_user_from_auth_db(token)
            if db_user is None:
                return JSONResponse(status_code=401, content={"detail": "Invalid session token"})

            user_id, user_role, must_change_password = db_user

            user_status = _resolve_user_status_from_auth_db(user_id)
            if isinstance(user_status, str) and user_status.lower() == "suspended":
                return JSONResponse(status_code=403, content={"detail": "User account suspended"})

            # Store user info in request state for downstream routers
            request.state.user_id = user_id
            request.state.user_role = user_role
            request.state.must_change_password = must_change_password
            
            is_platform_admin_route = request.url.path.startswith("/api/admin/")
            
            try:
                request.state.tenant_id = await _resolve_tenant_id(
                    user_id=user_id, 
                    requested_tenant_id=requested_tenant_id,
                )
            except PermissionError as exc:
                normalized_user_role = str(user_role or "").strip().lower()
                is_platform_admin_user = normalized_user_role in {"admin", "platform_admin"}
                if is_platform_admin_route and is_platform_admin_user:
                    request.state.tenant_id = None
                else:
                    detail = str(exc)
                    if detail == "NO_TENANT_ASSIGNED":
                        try:
                            await ensure_default_tenant_for_user(user_id)
                            request.state.tenant_id = await _resolve_tenant_id(
                                user_id=user_id,
                                requested_tenant_id=requested_tenant_id,
                            )
                            logger.info("Auto-created default tenant for user %s", user_id)
                        except Exception as auto_create_error:
                            logger.error("Failed to auto-create tenant for user %s: %s", user_id, auto_create_error)
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "当前账号未加入任何租户，请联系管理员将你加入租户后再登录。"},
                            )
                    elif not detail:
                        detail = "Tenant access denied"
                        return JSONResponse(status_code=403, content={"detail": detail})
                    else:
                        return JSONResponse(status_code=403, content={"detail": detail})

            if request.state.tenant_id is not None:
                request.state.tenant_role = await _resolve_tenant_role(
                    user_id=request.state.user_id,
                    tenant_id=request.state.tenant_id,
                )
            else:
                request.state.tenant_role = None

            tenant_token = set_tenant_context(
                request.state.user_id,
                request.state.user_role,
                request.state.tenant_id or "global_admin",
            )

        except Exception as e:
            logger.error(f"Auth verification failed: {e}")
            return JSONResponse(status_code=500, content={"detail": "Internal server error during authentication"})

        try:
            return await call_next(request)
        finally:
            if tenant_token is not None:
                reset_tenant_context(tenant_token)
