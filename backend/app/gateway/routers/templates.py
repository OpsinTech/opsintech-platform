"""User PPT template upload and management (per-thread workspace storage)."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter(prefix="/api/templates", tags=["templates"])

ALLOWED_EXTENSIONS = {".pptx", ".ppt"}


class TemplateInfo(BaseModel):
    name: str
    path: str
    kind: str = "pptx"


def _templates_dir(user_id: str, thread_id: str, tenant_id: str | None = None) -> Path:
    from deerflow.config.paths import get_paths
    paths = get_paths()
    d = paths.sandbox_work_dir(user_id, thread_id, tenant_id=tenant_id) / "templates"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("", response_model=list[TemplateInfo])
async def list_templates(
    request: Request,
    thread_id: str = Query(..., description="Thread ID"),
) -> list[TemplateInfo]:
    """List templates in the thread's workspace."""
    user_id: str = getattr(request.state, "user_id", "anonymous")
    tenant_id: str | None = getattr(request.state, "tenant_id", None)

    templates_dir = _templates_dir(user_id, thread_id, tenant_id)

    result: list[TemplateInfo] = []
    for entry in sorted(templates_dir.iterdir()):
        if entry.is_dir() and (entry / "design_spec.md").exists():
            kind = "deck"
        elif entry.is_dir():
            kind = "raw"
        elif entry.suffix.lower() in ALLOWED_EXTENSIONS:
            kind = "pptx"
        else:
            continue
        result.append(
            TemplateInfo(
                name=entry.stem,
                path=f"/mnt/user-data/workspace/templates/{entry.name}",
                kind=kind,
            )
        )
    return result


@router.post("/upload", response_model=TemplateInfo)
async def upload_template(
    request: Request,
    file: UploadFile = File(...),
    thread_id: str = Query(..., description="Thread ID"),
    name: str = Form(""),
) -> TemplateInfo:
    """Upload a PPTX file as a template into the thread's workspace."""
    user_id: str = getattr(request.state, "user_id", "anonymous")
    tenant_id: str | None = getattr(request.state, "tenant_id", None)

    ext = Path(file.filename or "template.pptx").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"只允许上传 PPTX/PPT 文件，不支持 {ext}")

    templates_dir = _templates_dir(user_id, thread_id, tenant_id)

    base_name = (name or Path(file.filename or "template").stem).strip() or "untitled"
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in base_name)
    file_path = templates_dir / f"{safe_name}.pptx"

    contents = await file.read()
    file_path.write_bytes(contents)

    return TemplateInfo(
        name=safe_name,
        path=f"/mnt/user-data/workspace/templates/{safe_name}.pptx",
        kind="pptx",
    )


@router.delete("")
async def delete_template(
    request: Request,
    thread_id: str = Query(..., description="Thread ID"),
    name: str = Query(..., description="Template file name (without extension)"),
) -> dict:
    """Delete a template from the thread's workspace."""
    user_id: str = getattr(request.state, "user_id", "anonymous")
    tenant_id: str | None = getattr(request.state, "tenant_id", None)

    templates_dir = _templates_dir(user_id, thread_id, tenant_id)

    # Try .pptx first, then .ppt
    for ext in ALLOWED_EXTENSIONS:
        file_path = templates_dir / f"{name}{ext}"
        if file_path.exists():
            file_path.unlink()
            return {"status": "deleted", "name": name}
        # Also check for directory (deck templates)
        dir_path = templates_dir / name
        if dir_path.is_dir():
            import shutil
            shutil.rmtree(dir_path)
            return {"status": "deleted", "name": name}

    raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
