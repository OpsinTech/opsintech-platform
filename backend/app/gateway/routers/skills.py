import json as _json
import logging
import re
import shutil
import tempfile
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.gateway.authorization import require_tenant_admin, require_tenant_context
from app.gateway.path_utils import resolve_thread_virtual_path
from deerflow.database.user_config_service import (
    create_tenant_shared_skill,
    create_tenant_personal_skill,
    delete_tenant_shared_skill,
    get_available_skills,
    get_tenant_shared_skill_settings,
    list_tenant_shared_skills,
    set_tenant_shared_skill_enabled,
    update_tenant_shared_skill,
    update_tenant_personal_skill,
    update_tenant_shared_skill_settings,
    update_tenant_personal_skill_settings,
    delete_tenant_personal_skill,
)
from deerflow.skills import Skill, get_skills_root_path, load_skills
from deerflow.skills.installer import SkillAlreadyExistsError, install_skill_from_archive

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["skills"])
_SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")


class SkillResponse(BaseModel):
    """Response model for skill information."""

    name: str = Field(..., description="Name of the skill")
    description: str = Field(..., description="Description of what the skill does")
    license: str | None = Field(None, description="License information")
    category: str = Field(..., description="Category of the skill (public or custom)")
    enabled: bool = Field(default=True, description="Whether this skill is enabled")
    bound_tools: list[str] = Field(default_factory=list, description="Bound tool names")
    prompt_template: str | None = Field(None, description="Prompt template for this skill")
    strategy: str | None = Field(None, description="Execution strategy for this skill")
    instructions: str | None = Field(None, description="Skill instructions from SKILL.md body")
    created_by: str | None = Field(None, description="User ID who created the skill")
    version: int = Field(default=1, description="Skill version number")
    changelog: str | None = Field(None, description="Latest change description")
    usage_count: int = Field(default=0, description="Number of times this skill has been used")
    references: dict[str, str] | None = Field(None, description="Reference documents loaded on demand (Tier 3)")


class SkillsListResponse(BaseModel):
    """Response model for listing all skills."""

    skills: list[SkillResponse]


class AvailableSkillResponse(SkillResponse):
    scope: str = Field(..., description="Resource scope: global or tenant")
    source: str = Field(..., description="Skill source classification")
    managed_by_current_user: bool = Field(..., description="Whether current user can manage this skill")
    effective_permissions: list[str] = Field(default_factory=list, description="Effective permissions for current user")


class AvailableSkillsListResponse(BaseModel):
    skills: list[AvailableSkillResponse]


class SkillUpdateRequest(BaseModel):
    """Request model for updating a skill."""

    enabled: bool = Field(..., description="Whether to enable or disable the skill")


class TenantSkillCreateRequest(BaseModel):
    name: str = Field(..., description="Skill name")
    description: str = Field(..., description="Skill description")
    instructions: str | None = Field(default=None, description="Skill instructions")
    enabled: bool = Field(default=True, description="Whether skill is enabled")
    category: str | None = Field(default=None, description="Skill category")
    bound_tools: list[str] | None = Field(default=None, description="Bound tools")
    prompt_template: str | None = Field(default=None, description="Prompt template")
    strategy: str | None = Field(default=None, description="Execution strategy")
    changelog: str | None = Field(default=None, description="Change description")


class TenantSkillPatchRequest(BaseModel):
    description: str | None = Field(default=None, description="Skill description")
    instructions: str | None = Field(default=None, description="Skill instructions")
    enabled: bool | None = Field(default=None, description="Whether skill is enabled")
    category: str | None = Field(default=None, description="Skill category")
    bound_tools: list[str] | None = Field(default=None, description="Bound tools")
    prompt_template: str | None = Field(default=None, description="Prompt template")
    strategy: str | None = Field(default=None, description="Execution strategy")
    changelog: str | None = Field(default=None, description="Change description")


class GenerateInstructionsRequest(BaseModel):
    """Request model for AI-generated instructions."""
    prompt: str = Field(..., description="Natural language description of desired skill behavior")


class GenerateInstructionsResponse(BaseModel):
    """Response with AI-generated instructions."""
    instructions: str = Field(..., description="Generated instructions text")


class SkillDetailResponse(SkillResponse):
    """Extended response for skill detail view."""
    references: dict[str, str] | None = Field(None, description="Reference documents (Tier 3)")


class ToolCallSummary(BaseModel):
    tool: str = Field(..., description="Tool name")
    description: str = Field(default="", description="Brief description of what the tool did")


class SummarizeDiagnosisRequest(BaseModel):
    """Request model for summarizing diagnosis into structured skill instructions."""

    incident_title: str | None = Field(None, description="Alert title")
    incident_service: str | None = Field(None, description="Affected service")
    incident_severity: str = Field(default="warning", description="Severity level")
    incident_environment: str | None = Field(None, description="Environment (production/staging)")
    diagnosis_result: str = Field(..., min_length=1, description="Full diagnosis conclusion text")
    diagnosis_steps: list[str] = Field(default_factory=list, description="SOP step labels executed during diagnosis")
    tool_calls_summary: list[ToolCallSummary] = Field(default_factory=list, description="Tools used during diagnosis")
    user_notes: str | None = Field(None, description="Optional user notes to guide refinement")


class SummarizeDiagnosisResponse(BaseModel):
    """Response with AI-refined skill instructions from diagnosis."""

    suggested_name: str = Field(..., description="Suggested skill name")
    suggested_description: str = Field(..., description="Suggested skill description")
    instructions: str = Field(..., description="Refined structured SOP instructions in Markdown")
    suggested_tools: list[str] = Field(default_factory=list, description="Suggested bound tools")
    suggested_category: str = Field(default="custom", description="Suggested skill category")


def _is_platform_admin(request: Request) -> bool:
    role = getattr(request.state, "user_role", None)
    return isinstance(role, str) and role.lower() in {"platform_admin", "admin"}


def _is_tenant_admin(request: Request) -> bool:
    role = getattr(request.state, "tenant_role", None)
    return isinstance(role, str) and role.lower() == "tenant_admin"


class SkillInstallRequest(BaseModel):
    """Request model for installing a skill from a .skill or .zip file."""

    thread_id: str = Field(..., description="The thread ID where the archive file is located")
    path: str = Field(..., description="Virtual path to the .skill or .zip file (e.g., mnt/user-data/outputs/my-skill.skill)")


class SkillInstallResponse(BaseModel):
    """Response model for skill installation."""

    success: bool = Field(..., description="Whether the installation was successful")
    skill_name: str = Field(..., description="Name of the installed skill")
    message: str = Field(..., description="Installation result message")


def _skill_to_response(skill: Skill) -> SkillResponse:
    """Convert a Skill object to a SkillResponse."""
    frontmatter, instructions = _read_skill_file_payload(skill.skill_dir)
    return SkillResponse(
        name=skill.name,
        description=skill.description,
        license=skill.license,
        category=skill.category,
        enabled=skill.enabled,
        bound_tools=[],
        prompt_template=None,
        strategy=None,
        instructions=instructions,
        created_by=frontmatter.get("created_by"),
        version=int(frontmatter.get("version", 1)),
        changelog=frontmatter.get("changelog"),
        usage_count=int(frontmatter.get("usage_count", 0)),
        references=frontmatter.get("references"),
    )


def _validate_manual_skill_name(skill_name: str) -> str:
    name = skill_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Skill name is required")
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Skill name contains unsafe path characters")
    if not _SKILL_NAME_PATTERN.fullmatch(name):
        raise HTTPException(
            status_code=400,
            detail="Skill name must be hyphen-case using lowercase letters, digits, and hyphens only",
        )
    if name.startswith("-") or name.endswith("-") or "--" in name or len(name) > 64:
        raise HTTPException(status_code=400, detail="Skill name is not a valid skill identifier")
    return name


def _normalize_skill_description(description: str) -> str:
    text = description.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Skill description is required")
    if "<" in text or ">" in text:
        raise HTTPException(status_code=400, detail="Skill description cannot contain angle brackets")
    return " ".join(text.splitlines())


def _tenant_skill_relative_path(tenant_id: str, skill_name: str) -> str:
    return (Path(tenant_id) / skill_name).as_posix()


def _tenant_skill_dir(tenant_id: str, skill_name: str) -> Path:
    return get_skills_root_path() / "custom" / tenant_id / skill_name


def _split_skill_markdown(content: str) -> tuple[dict[str, object], str]:
    match = re.match(r"^---\n(.*?)\n---\s*\n?(.*)$", content, re.DOTALL)
    if not match:
        return {}, ""
    try:
        frontmatter = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        frontmatter = {}
    if not isinstance(frontmatter, dict):
        frontmatter = {}
    return frontmatter, match.group(2).strip()


def _read_skill_file_payload(skill_dir: Path) -> tuple[str | None, str | None]:
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        return None, None
    frontmatter, instructions = _split_skill_markdown(skill_file.read_text(encoding="utf-8"))
    description = frontmatter.get("description")
    description_text = str(description).strip() if isinstance(description, str) and description.strip() else None
    return description_text, instructions or None


def _read_skill_instructions(skill_dir: Path) -> str | None:
    _, instructions = _read_skill_file_payload(skill_dir)
    return instructions


def _render_skill_markdown(
    name: str,
    description: str,
    instructions: str | None,
    *,
    created_by: str | None = None,
    version: int = 1,
    changelog: str | None = None,
    usage_count: int = 0,
    references: dict[str, str] | None = None,
) -> str:
    body = (instructions or "").strip() or f"# {name}\n"
    frontmatter_lines = [
        f"name: {name}",
        f"description: {description}",
    ]
    if created_by:
        frontmatter_lines.append(f"created_by: {created_by}")
    frontmatter_lines.append(f"version: {version}")
    if changelog:
        frontmatter_lines.append(f"changelog: {changelog}")
    frontmatter_lines.append(f"usage_count: {usage_count}")
    if references:
        refs_yaml = yaml.dump(references, default_flow_style=False).strip()
        frontmatter_lines.append(f"references:\n{_indent(refs_yaml)}")
    fm = "\n".join(frontmatter_lines)
    return f"---\n{fm}\n---\n\n{body}\n"


def _indent(text: str, prefix: str = "  ") -> str:
    return "\n".join(prefix + line if line.strip() else line for line in text.splitlines())


def _write_skill_markdown(
    skill_dir: Path,
    *,
    name: str,
    description: str,
    instructions: str | None,
    created_by: str | None = None,
    version: int = 1,
    changelog: str | None = None,
    usage_count: int = 0,
    references: dict[str, str] | None = None,
) -> None:
    skill_dir.mkdir(parents=True, exist_ok=True)
    content = _render_skill_markdown(
        name, description, instructions,
        created_by=created_by,
        version=version,
        changelog=changelog,
        usage_count=usage_count,
        references=references,
    )
    (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")


def _resolve_skill_runtime_dir(tenant_id: str, row_name: str, install_dir: str | None, relative_path: str | None) -> Path:
    if isinstance(install_dir, str) and install_dir.strip():
        return Path(install_dir)
    if isinstance(relative_path, str) and relative_path.strip():
        return get_skills_root_path() / "custom" / relative_path.strip()
    return _tenant_skill_dir(tenant_id, row_name)


def _build_skill_response(
    *,
    tenant_id: str,
    row_name: str,
    category: str,
    enabled: bool,
    settings: dict[str, object] | None = None,
    install_dir: str | None = None,
    relative_path: str | None = None,
) -> SkillResponse:
    resolved = next((s for s in load_skills(enabled_only=False) if s.name == row_name), None)
    skill_dir = _resolve_skill_runtime_dir(tenant_id, row_name, install_dir, relative_path)
    frontmatter, instructions = _read_skill_file_payload(skill_dir)
    file_description = frontmatter.get("description") or ""
    if isinstance(file_description, str) and file_description.strip():
        pass
    else:
        file_description = None
    settings = settings or {}
    return SkillResponse(
        name=row_name,
        description=(resolved.description if resolved is not None else file_description) or "",
        license=resolved.license if resolved is not None else None,
        category=category,
        enabled=enabled,
        bound_tools=settings.get("bound_tools") or [],
        prompt_template=settings.get("prompt_template"),
        strategy=settings.get("strategy"),
        instructions=instructions,
        created_by=frontmatter.get("created_by"),
        version=int(frontmatter.get("version", 1)),
        changelog=frontmatter.get("changelog"),
        usage_count=int(frontmatter.get("usage_count", 0)),
        references=frontmatter.get("references"),
    )


@router.get(
    "/skills",
    response_model=SkillsListResponse,
    summary="List All Skills",
    description="Retrieve a list of all available skills from both public and custom directories.",
)
async def list_skills(request: Request) -> SkillsListResponse:
    require_tenant_context(request)
    try:
        skills = load_skills(enabled_only=False)
        return SkillsListResponse(skills=[_skill_to_response(skill) for skill in skills])
    except Exception as e:
        logger.error(f"Failed to load skills: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load skills: {str(e)}")


@router.get(
    "/skills/available",
    response_model=AvailableSkillsListResponse,
    summary="List Available Skills",
    description="Return platform built-in and tenant-shared skills for current tenant context.",
)
async def list_available_skills(request: Request) -> AvailableSkillsListResponse:
    tenant_id = require_tenant_context(request)
    try:
        rows = await get_available_skills(
            request.state.user_id,
            tenant_id,
            is_tenant_admin=_is_tenant_admin(request),
            is_platform_admin=_is_platform_admin(request),
        )
        enriched_rows = []
        for row in rows:
            if row.get("scope") == "tenant":
                description, instructions = _read_skill_file_payload(
                    _resolve_skill_runtime_dir(
                        tenant_id,
                        str(row.get("name") or ""),
                        row.get("install_dir"),
                        row.get("relative_path"),
                    )
                )
                if description:
                    row["description"] = description
                row["instructions"] = instructions
            enriched_rows.append(row)
        return AvailableSkillsListResponse(skills=[AvailableSkillResponse.model_validate(row) for row in enriched_rows])
    except Exception as e:
        logger.error(f"Failed to load available skills: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load available skills: {str(e)}")


@router.get(
    "/tenants/skills",
    response_model=SkillsListResponse,
    summary="List Tenant Shared Skills",
    dependencies=[Depends(require_tenant_admin)],
)
async def list_tenant_skills(request: Request) -> SkillsListResponse:
    tenant_id = require_tenant_context(request)
    rows = await list_tenant_shared_skills(tenant_id)
    settings_by_name = await get_tenant_shared_skill_settings(tenant_id)
    skills = []
    for row in rows:
        settings = settings_by_name.get(row.name) or {}
        skills.append(
            _build_skill_response(
                tenant_id=tenant_id,
                row_name=row.name,
                category=row.category,
                enabled=row.enabled,
                settings=settings,
                install_dir=getattr(row, "install_dir", None),
                relative_path=getattr(row, "relative_path", None),
            )
        )
    return SkillsListResponse(skills=skills)


@router.post(
    "/tenants/skills",
    response_model=SkillResponse,
    status_code=201,
    summary="Create Tenant Shared Skill",
)
async def create_tenant_skill(request: Request, body: TenantSkillCreateRequest) -> SkillResponse:
    tenant_id = require_tenant_context(request)
    user_id: str = getattr(request.state, "user_id", "")
    normalized_name = _validate_manual_skill_name(body.name)
    normalized_description = _normalize_skill_description(body.description)
    relative_path = _tenant_skill_relative_path(tenant_id, normalized_name)
    install_dir = str(_tenant_skill_dir(tenant_id, normalized_name))
    try:
        row = await create_tenant_shared_skill(
            tenant_id,
            skill_name=normalized_name,
            enabled=body.enabled,
            category=body.category,
            relative_path=relative_path,
            install_dir=install_dir,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    try:
        _write_skill_markdown(
            _tenant_skill_dir(tenant_id, row.name),
            name=row.name,
            description=normalized_description,
            instructions=body.instructions,
            created_by=user_id,
            version=1,
            changelog=body.changelog or "Initial creation",
        )
        settings = await update_tenant_shared_skill_settings(
            tenant_id,
            row.name,
            bound_tools=body.bound_tools,
            prompt_template=body.prompt_template,
            strategy=body.strategy,
        )
    except Exception:
        await delete_tenant_shared_skill(tenant_id, row.name)
        raise

    return _build_skill_response(
        tenant_id=tenant_id,
        row_name=row.name,
        category=row.category,
        enabled=row.enabled,
        settings=settings,
        install_dir=getattr(row, "install_dir", None),
        relative_path=getattr(row, "relative_path", None),
    )


@router.put(
    "/tenants/skills/{skill_name}",
    response_model=SkillResponse,
    summary="Update Tenant Shared Skill",
    dependencies=[Depends(require_tenant_admin)],
)
async def update_tenant_skill(skill_name: str, request: SkillUpdateRequest, api_request: Request) -> SkillResponse:
    tenant_id = require_tenant_context(api_request)
    row = await set_tenant_shared_skill_enabled(tenant_id, skill_name, request.enabled)
    settings_by_name = await get_tenant_shared_skill_settings(tenant_id)
    settings = settings_by_name.get(row.name) or {}
    return _build_skill_response(
        tenant_id=tenant_id,
        row_name=row.name,
        category=row.category,
        enabled=row.enabled,
        settings=settings,
        install_dir=getattr(row, "install_dir", None),
        relative_path=getattr(row, "relative_path", None),
    )


@router.patch(
    "/tenants/skills/{skill_name}",
    response_model=SkillResponse,
    summary="Patch Tenant Shared Skill",
)
async def patch_tenant_skill(skill_name: str, request: TenantSkillPatchRequest, api_request: Request) -> SkillResponse:
    tenant_id = require_tenant_context(api_request)
    user_id: str = getattr(api_request.state, "user_id", "")
    is_admin = _is_tenant_admin(api_request)

    try:
        row = await update_tenant_shared_skill(
            tenant_id,
            skill_name,
            enabled=request.enabled,
            category=request.category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    skill_dir = _resolve_skill_runtime_dir(
        tenant_id,
        row.name,
        getattr(row, "install_dir", None),
        getattr(row, "relative_path", None),
    )
    frontmatter, current_instructions = _read_skill_file_payload(skill_dir)
    creator = frontmatter.get("created_by")
    if not is_admin and creator and creator != user_id:
        raise HTTPException(status_code=403, detail="You can only edit skills you created")

    settings = await update_tenant_shared_skill_settings(
        tenant_id,
        row.name,
        bound_tools=request.bound_tools,
        prompt_template=request.prompt_template,
        strategy=request.strategy,
    )

    if request.description is not None or request.instructions is not None:
        current_description = frontmatter.get("description") or row.name
        description_to_write = (
            _normalize_skill_description(request.description)
            if request.description is not None
            else (current_description if isinstance(current_description, str) and current_description.strip() else row.name)
        )
        instructions_to_write = request.instructions if request.instructions is not None else current_instructions
        new_version = int(frontmatter.get("version", 1)) + 1
        _write_skill_markdown(
            skill_dir,
            name=row.name,
            description=description_to_write,
            instructions=instructions_to_write,
            created_by=creator,
            version=new_version,
            changelog=request.changelog or f"Updated (v{new_version})",
            usage_count=int(frontmatter.get("usage_count", 0)),
            references=frontmatter.get("references"),
        )

    return _build_skill_response(
        tenant_id=tenant_id,
        row_name=row.name,
        category=row.category,
        enabled=row.enabled,
        settings=settings,
        install_dir=getattr(row, "install_dir", None),
        relative_path=getattr(row, "relative_path", None),
    )


@router.delete(
    "/tenants/skills/{skill_name}",
    status_code=204,
    summary="Delete Tenant Shared Skill",
    dependencies=[Depends(require_tenant_admin)],
)
async def delete_tenant_skill(skill_name: str, request: Request):
    tenant_id = require_tenant_context(request)
    skill_dir = _tenant_skill_dir(tenant_id, skill_name)
    try:
        await delete_tenant_shared_skill(tenant_id, skill_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if skill_dir.exists():
        shutil.rmtree(skill_dir, ignore_errors=True)


@router.post(
    "/skills/personal",
    response_model=SkillResponse,
    status_code=201,
    summary="Create Personal Skill",
)
async def create_personal_skill(request: Request, body: TenantSkillCreateRequest) -> SkillResponse:
    tenant_id = require_tenant_context(request)
    user_id: str = getattr(request.state, "user_id", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID is required for personal skills")

    normalized_name = _validate_manual_skill_name(body.name)
    normalized_description = _normalize_skill_description(body.description)
    relative_path = f"{user_id}/{normalized_name}"
    install_dir = str(get_skills_root_path() / "custom" / tenant_id / user_id / normalized_name)

    try:
        row = await create_tenant_personal_skill(
            tenant_id,
            user_id,
            skill_name=normalized_name,
            enabled=body.enabled,
            category="personal",
            relative_path=relative_path,
            install_dir=install_dir,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    try:
        _write_skill_markdown(
            Path(install_dir),
            name=row.name,
            description=normalized_description,
            instructions=body.instructions,
            created_by=user_id,
            version=1,
            changelog=body.changelog or "Initial creation",
        )
        settings = await update_tenant_personal_skill_settings(
            tenant_id,
            user_id,
            row.name,
            bound_tools=body.bound_tools,
            prompt_template=body.prompt_template,
            strategy=body.strategy,
        )
    except Exception:
        await delete_tenant_personal_skill(tenant_id, user_id, row.name)
        raise

    return _build_skill_response(
        tenant_id=tenant_id,
        row_name=row.name,
        category=row.category,
        enabled=row.enabled,
        settings=settings,
        install_dir=install_dir,
        relative_path=relative_path,
    )


@router.patch(
    "/skills/personal/{skill_name}",
    response_model=SkillResponse,
    summary="Patch Personal Skill",
)
async def patch_personal_skill(skill_name: str, request: TenantSkillPatchRequest, api_request: Request) -> SkillResponse:
    tenant_id = require_tenant_context(api_request)
    user_id: str = getattr(api_request.state, "user_id", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID is required")

    try:
        row = await update_tenant_personal_skill(
            tenant_id,
            user_id,
            skill_name,
            enabled=request.enabled,
            category=request.category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    skill_dir = _resolve_skill_runtime_dir(
        tenant_id,
        row.name,
        getattr(row, "install_dir", None),
        getattr(row, "relative_path", None),
    )
    frontmatter, current_instructions = _read_skill_file_payload(skill_dir)

    settings = await update_tenant_personal_skill_settings(
        tenant_id,
        user_id,
        row.name,
        bound_tools=request.bound_tools,
        prompt_template=request.prompt_template,
        strategy=request.strategy,
    )

    if request.description is not None or request.instructions is not None:
        current_description = frontmatter.get("description") or row.name
        description_to_write = (
            _normalize_skill_description(request.description)
            if request.description is not None
            else (current_description if isinstance(current_description, str) and current_description.strip() else row.name)
        )
        instructions_to_write = request.instructions if request.instructions is not None else current_instructions
        new_version = int(frontmatter.get("version", 1)) + 1
        _write_skill_markdown(
            skill_dir,
            name=row.name,
            description=description_to_write,
            instructions=instructions_to_write,
            created_by=user_id,
            version=new_version,
            changelog=request.changelog or f"Updated (v{new_version})",
            usage_count=int(frontmatter.get("usage_count", 0)),
            references=frontmatter.get("references"),
        )

    return _build_skill_response(
        tenant_id=tenant_id,
        row_name=row.name,
        category=row.category,
        enabled=row.enabled,
        settings=settings,
        install_dir=getattr(row, "install_dir", None),
        relative_path=getattr(row, "relative_path", None),
    )


@router.delete(
    "/skills/personal/{skill_name}",
    status_code=204,
    summary="Delete Personal Skill",
)
async def delete_personal_skill(skill_name: str, request: Request):
    tenant_id = require_tenant_context(request)
    user_id: str = getattr(request.state, "user_id", "")
    skill_dir = get_skills_root_path() / "custom" / tenant_id / user_id / skill_name
    try:
        await delete_tenant_personal_skill(tenant_id, user_id, skill_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if skill_dir.exists():
        shutil.rmtree(skill_dir, ignore_errors=True)


@router.post(
    "/skills/personal/import",
    response_model=SkillResponse,
    status_code=201,
    summary="Import Personal Skill",
)
async def import_personal_skill(request: Request, archive: UploadFile = File(...)) -> SkillResponse:
    tenant_id = require_tenant_context(request)
    user_id: str = getattr(request.state, "user_id", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID is required")

    filename = archive.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in {".skill", ".zip"}:
        raise HTTPException(status_code=400, detail="File must have .skill or .zip extension")

    temp_path: Path | None = None
    installed_dir: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_path = Path(temp_file.name)
            while chunk := await archive.read(1024 * 1024):
                temp_file.write(chunk)

        target_rel = f"{user_id}"
        result = install_skill_from_archive(
            temp_path,
            target_relative_path=target_rel,
            is_custom=True,
            tenant_id=tenant_id,
        )
        skill_name = str(result.get("skill_name") or "").strip()
        installed_dir = Path(str(result.get("install_dir") or str(get_skills_root_path() / "custom" / tenant_id / user_id / skill_name)))
        row = await create_tenant_personal_skill(
            tenant_id,
            user_id,
            enabled=True,
            skill_name=skill_name,
            category=str(result.get("category") or "personal"),
            relative_path=str(result.get("relative_path") or f"{user_id}/{skill_name}"),
            install_dir=str(installed_dir),
        )
        return _build_skill_response(
            tenant_id=tenant_id,
            row_name=row.name,
            category=row.category,
            enabled=row.enabled,
            settings={},
            install_dir=getattr(row, "install_dir", None),
            relative_path=getattr(row, "relative_path", None),
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SkillAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except RuntimeError as e:
        if installed_dir is not None:
            shutil.rmtree(installed_dir, ignore_errors=True)
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        if installed_dir is not None:
            shutil.rmtree(installed_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if installed_dir is not None:
            shutil.rmtree(installed_dir, ignore_errors=True)
        logger.error("Failed to import personal skill: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to import skill: {str(e)}")
    finally:
        await archive.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.post(
    "/tenants/skills/import",
    response_model=SkillResponse,
    status_code=201,
    summary="Import Tenant Shared Skill",
    dependencies=[Depends(require_tenant_admin)],
)
async def import_tenant_skill(request: Request, archive: UploadFile = File(...)) -> SkillResponse:
    tenant_id = require_tenant_context(request)
    filename = archive.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in {".skill", ".zip"}:
        raise HTTPException(status_code=400, detail="File must have .skill or .zip extension")

    temp_path: Path | None = None
    installed_dir: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_path = Path(temp_file.name)
            while chunk := await archive.read(1024 * 1024):
                temp_file.write(chunk)

        result = install_skill_from_archive(
            temp_path,
            target_relative_path=tenant_id,
        )
        skill_name = str(result.get("skill_name") or "").strip()
        installed_dir = Path(str(result.get("install_dir") or _tenant_skill_dir(tenant_id, skill_name)))
        row = await create_tenant_shared_skill(
            tenant_id,
            enabled=True,
            skill_name=skill_name,
            category=str(result.get("category") or "custom"),
            relative_path=str(result.get("relative_path") or _tenant_skill_relative_path(tenant_id, skill_name)),
            install_dir=str(installed_dir),
        )
        settings = await get_tenant_shared_skill_settings(tenant_id)
        return _build_skill_response(
            tenant_id=tenant_id,
            row_name=row.name,
            category=row.category,
            enabled=row.enabled,
            settings=settings.get(row.name) or {},
            install_dir=getattr(row, "install_dir", None),
            relative_path=getattr(row, "relative_path", None),
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SkillAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except RuntimeError as e:
        if installed_dir is not None:
            shutil.rmtree(installed_dir, ignore_errors=True)
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        if installed_dir is not None:
            shutil.rmtree(installed_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if installed_dir is not None:
            shutil.rmtree(installed_dir, ignore_errors=True)
        logger.error("Failed to import tenant skill: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to import skill: {str(e)}")
    finally:
        await archive.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.get(
    "/skills/{skill_name}",
    response_model=SkillResponse,
    summary="Get Skill Details",
    description="Retrieve detailed information about a specific skill by its name.",
)
async def get_skill(skill_name: str, request: Request) -> SkillResponse:
    require_tenant_context(request)
    try:
        skills = load_skills(enabled_only=False)
        skill = next((s for s in skills if s.name == skill_name), None)

        if skill is None:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

        return _skill_to_response(skill)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get skill {skill_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get skill: {str(e)}")


@router.post(
    "/skills/install",
    response_model=SkillInstallResponse,
    summary="Install Skill",
    description="Tenant admins install a .skill or .zip archive and register it as a tenant-shared skill.",
    dependencies=[Depends(require_tenant_admin)],
)
async def install_skill(request: SkillInstallRequest, api_request: Request) -> SkillInstallResponse:
    tenant_id = require_tenant_context(api_request)
    try:
        skill_file_path = resolve_thread_virtual_path(
            api_request.state.user_id,
            request.thread_id,
            request.path,
            tenant_id=getattr(api_request.state, "tenant_id", None),
        )
        target_relative_path = tenant_id
        result = install_skill_from_archive(
            skill_file_path,
            target_relative_path=target_relative_path,
        )
        skill_name = result.get("skill_name")
        if isinstance(skill_name, str) and skill_name:
            await create_tenant_shared_skill(
                tenant_id,
                enabled=True,
                skill_name=skill_name,
                category=str(result.get("category") or "custom"),
                relative_path=str(result.get("relative_path") or target_relative_path),
                install_dir=str(result.get("install_dir") or ""),
            )
        return SkillInstallResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SkillAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to install skill: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to install skill: {str(e)}")


@router.get(
    "/tenants/skills/{skill_name}/detail",
    response_model=SkillDetailResponse,
    summary="Get Tenant Skill Detail",
    description="Return full detail for a tenant shared skill including instructions and metadata.",
)
async def get_tenant_skill_detail(skill_name: str, request: Request) -> SkillDetailResponse:
    tenant_id = require_tenant_context(request)
    rows = await list_tenant_shared_skills(tenant_id)
    row = next((r for r in rows if r.name == skill_name), None)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

    settings_by_name = await get_tenant_shared_skill_settings(tenant_id)
    settings = settings_by_name.get(row.name) or {}
    skill_dir = _resolve_skill_runtime_dir(
        tenant_id, row.name,
        getattr(row, "install_dir", None),
        getattr(row, "relative_path", None),
    )
    frontmatter, instructions = _read_skill_file_payload(skill_dir)
    resolved = next((s for s in load_skills(enabled_only=False) if s.name == row.name), None)

    return SkillDetailResponse(
        name=row.name,
        description=(resolved.description if resolved is not None else frontmatter.get("description")) or "",
        license=resolved.license if resolved is not None else None,
        category=row.category,
        enabled=row.enabled,
        bound_tools=settings.get("bound_tools") or [],
        prompt_template=settings.get("prompt_template"),
        strategy=settings.get("strategy"),
        instructions=instructions,
        created_by=frontmatter.get("created_by"),
        version=int(frontmatter.get("version", 1)),
        changelog=frontmatter.get("changelog"),
        usage_count=int(frontmatter.get("usage_count", 0)),
        references=frontmatter.get("references"),
    )


@router.post(
    "/skills/generate-instructions",
    response_model=GenerateInstructionsResponse,
    summary="Generate Skill Instructions via AI",
    description="Use AI to auto-generate structured instructions from a natural language description.",
)
async def generate_skill_instructions(
    request: Request,
    body: GenerateInstructionsRequest,
) -> GenerateInstructionsResponse:
    require_tenant_context(request)
    try:
        from app.agent.agent_factory import make_lead_agent

        agent = await make_lead_agent(request)
        gen_prompt = f"""You are a skill instruction writer for an AI agent platform focused on operations (SRE/DevOps).

A user wants to create a new Skill. They described what they want the agent to be able to do:

"{body.prompt}"

Please write structured, professional Skill instructions in Chinese (Simplified).
Follow these guidelines:
1. Use clear Markdown headings (##, ###)
2. Include a diagnostic workflow with numbered steps
3. Include common failure patterns and how to identify them
4. Include recommended commands/tools to use at each step
5. Include what NOT to do (constraints)
6. Keep instructions between 500-1500 characters

Output ONLY the instructions text, no preamble or explanation."""

        result = await agent.ainvoke({"messages": [{"role": "human", "content": gen_prompt}]})
        output_text = ""
        if hasattr(result, "get") and isinstance(result.get("messages"), list):
            for msg in result["messages"]:
                if hasattr(msg, "content") and isinstance(msg.content, str):
                    output_text = msg.content

        if not output_text:
            output_text = str(result)

        return GenerateInstructionsResponse(instructions=output_text.strip())
    except Exception as e:
        logger.error(f"Failed to generate instructions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate instructions: {str(e)}")


@router.post(
    "/skills/summarize-diagnosis",
    response_model=SummarizeDiagnosisResponse,
    summary="Summarize Diagnosis into Skill",
    description="Use AI to refine an incident diagnosis conclusion into structured, reusable Skill instructions (SOP). Removes instance-specific details and extracts domain knowledge.",
)
async def summarize_diagnosis(
    request: Request,
    body: SummarizeDiagnosisRequest,
) -> SummarizeDiagnosisResponse:
    require_tenant_context(request)
    try:
        import os
        from langgraph_sdk import get_client

        langgraph_url = os.getenv("LANGGRAPH_API_URL", "http://localhost:2024")
        client = get_client(url=langgraph_url)

        steps_text = ""
        if body.diagnosis_steps:
            steps_text = "诊断执行步骤：\n" + "\n".join(f"- {s}" for s in body.diagnosis_steps)

        tools_text = ""
        if body.tool_calls_summary:
            tools_text = "使用的工具：\n" + "\n".join(
                f"- {t.tool}: {t.description}" for t in body.tool_calls_summary
            )

        user_notes_text = ""
        if body.user_notes:
            user_notes_text = f"\n用户补充说明：{body.user_notes}"

        gen_prompt = f"""你是运维 SRE 领域的 Skill 指令编写专家。用户完成了一次告警诊断，需要将诊断经验提炼为可复用的 Skill 指令。

## 告警信息
- 标题：{body.incident_title or '未知'}
- 服务：{body.incident_service or '未知'}
- 环境：{body.incident_environment or '未知'}
- 严重级别：{body.incident_severity}

## 诊断结论
{body.diagnosis_result[:3000]}

{steps_text}

{tools_text}
{user_notes_text}

## 任务要求

请将上述诊断过程提炼为结构化的 Skill 指令。**严格遵循**以下规则：

1. **去实例化**：移除所有具体 IP 地址、Pod 名称、节点名、时间戳、具体数值。用 `<pod-name>` 等占位符代替。
2. **提取通用 SOP**：从单次排查过程抽象出通用的排查流程，让其他运维人员可以复用。
3. **保留领域知识**：保留关键的检查命令、诊断思路、根因分类、阈值建议。
4. **中文输出**：所有内容使用简体中文。

## 输出格式（严格按此结构）

请返回 JSON，包含以下字段：
- suggested_name: 英文小写+下划线的短名称（如 k8s_pod_oom_killed）
- suggested_description: 一句话中文描述（如 "K8s Pod OOMKilled 内存溢出排查"）
- instructions: Markdown 格式的完整 Skill 指令，包含以下章节：
  * ## 适用场景
  * ## 排查步骤（带编号）
  * ## 关键检查点
  * ## 常见根因
  * ## 修复建议
  * ## 参考命令
- suggested_tools: 建议绑定的工具列表（英文工具名数组）
- suggested_category: 建议分类（如 k8s_troubleshooting, network, database, application, infra）

输出必须是合法的 JSON，不要包含额外说明文字。"""

        # Run prompt as a stateless run via LangGraph assistant
        thread = await client.threads.create()
        run = await client.runs.create(
            thread_id=thread["thread_id"],
            assistant_id="lead_agent",
            input={"messages": [{"role": "human", "content": gen_prompt}]},
        )

        # Wait for the run to finish
        final_messages = []
        async for event in client.runs.stream(thread["thread_id"], run["run_id"]):
            if event.get("event") == "messages":
                msgs = event.get("data", [])
                for msg in msgs:
                    if msg.get("role") == "assistant" and msg.get("content"):
                        final_messages.append(msg)

        if not final_messages:
            raise HTTPException(status_code=500, detail="AI 返回了空内容，请重试")

        output_text = str(final_messages[-1].get("content", ""))

        # Parse JSON from LLM response
        json_text = output_text.strip()
        # Strip markdown code fences if present
        if json_text.startswith("```"):
            lines = json_text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            json_text = "\n".join(lines)

        data = _json.loads(json_text)

        return SummarizeDiagnosisResponse(
            suggested_name=str(data.get("suggested_name", "diagnosis_skill")),
            suggested_description=str(data.get("suggested_description", "")),
            instructions=str(data.get("instructions", "")),
            suggested_tools=[str(t) for t in data.get("suggested_tools", [])],
            suggested_category=str(data.get("suggested_category", "custom")),
        )
    except _json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM JSON response: {e}\nRaw output: {output_text[:500] if 'output_text' in dir() else 'N/A'}")
        raise HTTPException(status_code=500, detail="AI 返回格式异常，请重试")
    except Exception as e:
        logger.error(f"Failed to summarize diagnosis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to summarize diagnosis: {str(e)}")
