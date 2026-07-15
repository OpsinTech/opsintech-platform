"""File Center API — unified file and folder management for the platform.

Provides CRUD endpoints for virtual folders and files, backed by the
StorageProvider abstraction (LocalStorageDriver for V0.1) and DB models
for metadata, permissions, and multi-tenant isolation.

All endpoints require tenant context and enforce visibility rules:
- ``visibility=private``: only the owning user can access
- ``visibility=tenant``: all users within the tenant can access
"""

import hashlib
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select as sa_select, and_, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from app.gateway.authorization import require_tenant_context
from app.models.files import FileFolder, FileObject
from deerflow.database.session import get_session
from deerflow.storage.local import get_storage_driver

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------

class FolderCreate(BaseModel):
    """Request model for creating a folder."""
    display_name: str = Field(..., min_length=1, max_length=255)
    parent_id: str | None = Field(default=None, description="Parent folder ID; null = root level")
    visibility: str = Field(default="private", description="'private' or 'tenant'")


class FolderResponse(BaseModel):
    """Response model for folder data."""
    id: str
    tenant_id: str
    owner_user_id: str
    visibility: str
    parent_id: str | None
    display_name: str
    path_cache: str | None
    created_by: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class FileObjectResponse(BaseModel):
    """Response model for file metadata."""
    id: str
    tenant_id: str
    owner_user_id: str
    visibility: str
    parent_folder_id: str | None
    display_name: str
    original_filename: str
    mime_type: str
    extension: str
    size_bytes: int
    checksum: str
    description: str | None
    storage_backend: str
    source_type: str
    business_type: str | None
    business_id: str | None
    created_by: str
    created_by_role: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class FileUploadResponse(BaseModel):
    """Response after a successful file upload."""
    success: bool
    file: FileObjectResponse
    message: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_datetime(dt: Any) -> str:
    """Convert datetime to ISO string, or return empty string if None."""
    if dt is None:
        return ""
    return dt.isoformat()


def _folder_to_response(folder: FileFolder) -> FolderResponse:
    return FolderResponse(
        id=folder.id,
        tenant_id=folder.tenant_id,
        owner_user_id=folder.owner_user_id,
        visibility=folder.visibility,
        parent_id=folder.parent_id,
        display_name=folder.display_name,
        path_cache=folder.path_cache,
        created_by=folder.created_by,
        created_at=_serialize_datetime(folder.created_at),
        updated_at=_serialize_datetime(folder.updated_at),
    )


def _file_to_response(fobj: FileObject) -> FileObjectResponse:
    return FileObjectResponse(
        id=fobj.id,
        tenant_id=fobj.tenant_id,
        owner_user_id=fobj.owner_user_id,
        visibility=fobj.visibility,
        parent_folder_id=fobj.parent_folder_id,
        display_name=fobj.display_name,
        original_filename=fobj.original_filename,
        mime_type=fobj.mime_type,
        extension=fobj.extension,
        size_bytes=fobj.size_bytes,
        checksum=fobj.checksum,
        description=fobj.description,
        storage_backend=fobj.storage_backend,
        source_type=fobj.source_type,
        business_type=fobj.business_type,
        business_id=fobj.business_id,
        created_by=fobj.created_by,
        created_by_role=fobj.created_by_role,
        created_at=_serialize_datetime(fobj.created_at),
        updated_at=_serialize_datetime(fobj.updated_at),
    )


# ---------------------------------------------------------------------------
# Folder endpoints
# ---------------------------------------------------------------------------

@router.get("/folders", response_model=list[FolderResponse])
async def list_folders(
    request: Request,
    parent_id: str | None = Query(default=None, description="Filter by parent folder; null = root level"),
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """List folders visible to the current user.

    Returns folders where:
    - visibility='tenant' (public within the tenant), OR
    - visibility='private' AND owner_user_id matches the current user
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    conditions = [
        FileFolder.tenant_id == tenant_id,
        FileFolder.deleted_at.is_(None),
        or_(
            FileFolder.visibility == "tenant",
            and_(
                FileFolder.visibility == "private",
                FileFolder.owner_user_id == user_id,
            ),
        ),
    ]
    if parent_id is not None:
        conditions.append(FileFolder.parent_id == parent_id)
    else:
        conditions.append(FileFolder.parent_id.is_(None))

    query = sa_select(FileFolder).where(and_(*conditions)).order_by(FileFolder.display_name)
    result = await db.execute(query)
    folders = result.scalars().all()
    return [_folder_to_response(f) for f in folders]


@router.post("/folders", response_model=FolderResponse, status_code=201)
async def create_folder(
    req: FolderCreate,
    request: Request,
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Create a new virtual folder."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    if req.visibility not in ("private", "tenant"):
        raise HTTPException(status_code=400, detail="visibility must be 'private' or 'tenant'")

    # If parent_id is provided, verify it exists and is accessible
    if req.parent_id:
        parent_query = sa_select(FileFolder).where(
            FileFolder.id == req.parent_id,
            FileFolder.tenant_id == tenant_id,
            FileFolder.deleted_at.is_(None),
        )
        parent_result = await db.execute(parent_query)
        if not parent_result.scalars().first():
            raise HTTPException(status_code=404, detail="Parent folder not found")

    folder = FileFolder(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        owner_user_id=user_id,
        visibility=req.visibility,
        parent_id=req.parent_id,
        display_name=req.display_name,
        created_by=user_id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    logger.info("Created folder: %s (id=%s) by user=%s", folder.display_name, folder.id, user_id)
    return _folder_to_response(folder)


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Soft-delete a folder. Only the owner (or tenant admin) can delete."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    query = sa_select(FileFolder).where(
        FileFolder.id == folder_id,
        FileFolder.tenant_id == tenant_id,
        FileFolder.deleted_at.is_(None),
    )
    result = await db.execute(query)
    folder = result.scalars().first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Only owner can delete for now (tenant admin can be added later)
    if folder.owner_user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the folder owner can delete it")

    # Soft-delete
    from datetime import UTC, datetime
    folder.deleted_at = datetime.now(UTC)
    await db.commit()
    return {"status": "ok", "message": f"Folder '{folder.display_name}' deleted"}


# ---------------------------------------------------------------------------
# File endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[FileObjectResponse])
async def list_files(
    request: Request,
    parent_folder_id: str | None = Query(default=None, description="Filter by parent folder"),
    source_type: str | None = Query(default=None, description="Filter by source type"),
    business_id: str | None = Query(default=None, description="Filter by business ID"),
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """List files visible to the current user."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    conditions = [
        FileObject.tenant_id == tenant_id,
        FileObject.deleted_at.is_(None),
        or_(
            FileObject.visibility == "tenant",
            and_(
                FileObject.visibility == "private",
                FileObject.owner_user_id == user_id,
            ),
        ),
    ]
    if parent_folder_id is not None:
        conditions.append(FileObject.parent_folder_id == parent_folder_id)
    if source_type is not None:
        conditions.append(FileObject.source_type == source_type)
    if business_id is not None:
        conditions.append(FileObject.business_id == business_id)

    query = sa_select(FileObject).where(and_(*conditions)).order_by(FileObject.created_at.desc())
    result = await db.execute(query)
    files = result.scalars().all()
    return [_file_to_response(f) for f in files]


@router.post("/upload", response_model=FileUploadResponse, status_code=201)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    parent_folder_id: str | None = Query(default=None, description="Target folder ID"),
    visibility: str = Query(default="private", description="'private' or 'tenant'"),
    source_type: str = Query(default="upload", description="'upload', 'ai_generated', or 'business_attachment'"),
    description: str | None = Query(default=None, description="Optional description"),
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Upload a single file to the File Center.

    The file is stored in the configured storage backend (local disk for V0.1)
    and its metadata is recorded in the database.

    Limits: max 50 MB per file for V0.1.
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    if visibility not in ("private", "tenant"):
        raise HTTPException(status_code=400, detail="visibility must be 'private' or 'tenant'")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Read file content (with size limit)
    MAX_SIZE = 50 * 1024 * 1024  # 50 MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"File exceeds maximum size of {MAX_SIZE // (1024*1024)} MB")

    # Compute checksum and determine extension
    checksum = hashlib.sha256(content).hexdigest()
    extension = ""
    if "." in file.filename:
        extension = "." + file.filename.rsplit(".", 1)[-1].lower()

    content_type = file.content_type or "application/octet-stream"

    # Generate a unique file ID and compute the storage object key
    file_id = str(uuid.uuid4())
    storage = get_storage_driver()
    object_key = storage._compute_object_key(tenant_id, file_id)

    # Store the file in the storage backend
    await storage.put_object(object_key, content, content_type)

    # Determine the actual backend name from the driver
    backend_name = storage._config.backend

    # Create the database record
    file_obj = FileObject(
        id=file_id,
        tenant_id=tenant_id,
        owner_user_id=user_id,
        visibility=visibility,
        parent_folder_id=parent_folder_id,
        display_name=file.filename,
        original_filename=file.filename,
        mime_type=content_type,
        extension=extension,
        size_bytes=len(content),
        checksum=checksum,
        description=description,
        storage_backend=backend_name,
        object_key=object_key,
        source_type=source_type,
        created_by=user_id,
        created_by_role="user",
    )
    db.add(file_obj)
    await db.commit()
    await db.refresh(file_obj)

    logger.info(
        "Uploaded file: %s (id=%s, size=%d) by user=%s in tenant=%s",
        file.filename, file_id, len(content), user_id, tenant_id,
    )

    return FileUploadResponse(
        success=True,
        file=_file_to_response(file_obj),
        message=f"File '{file.filename}' uploaded successfully",
    )


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Download a file by its ID.

    Returns the raw file content with appropriate Content-Type and
    Content-Disposition headers.
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    query = sa_select(FileObject).where(
        FileObject.id == file_id,
        FileObject.tenant_id == tenant_id,
        FileObject.deleted_at.is_(None),
    )
    result = await db.execute(query)
    file_obj = result.scalars().first()

    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    # Check visibility
    if file_obj.visibility == "private" and file_obj.owner_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Retrieve from storage
    storage = get_storage_driver()
    try:
        content = await storage.get_object(file_obj.object_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content not found in storage")

    # Determine the download filename (use original_filename or display_name)
    download_name = file_obj.original_filename or file_obj.display_name

    return Response(
        content=content,
        media_type=file_obj.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
            "Content-Length": str(len(content)),
        },
    )


@router.get("/{file_id}/preview")
async def preview_file(
    file_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Preview a file inline in the browser.

    Returns the raw file content with Content-Disposition: inline
    for browser-native preview of images, PDFs, text, etc.
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    query = sa_select(FileObject).where(
        FileObject.id == file_id,
        FileObject.tenant_id == tenant_id,
        FileObject.deleted_at.is_(None),
    )
    result = await db.execute(query)
    file_obj = result.scalars().first()

    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    # Check visibility
    if file_obj.visibility == "private" and file_obj.owner_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Retrieve from storage
    storage = get_storage_driver()
    try:
        content = await storage.get_object(file_obj.object_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File content not found in storage")

    # Determine the filename (use original_filename or display_name)
    download_name = file_obj.original_filename or file_obj.display_name

    # Safely escape or quote filename for Content-Disposition inline header
    from urllib.parse import quote
    encoded_name = quote(download_name)

    return Response(
        content=content,
        media_type=file_obj.mime_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_name}",
            "Content-Length": str(len(content)),
        },
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Soft-delete a file. Only the owner can delete."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    query = sa_select(FileObject).where(
        FileObject.id == file_id,
        FileObject.tenant_id == tenant_id,
        FileObject.deleted_at.is_(None),
    )
    result = await db.execute(query)
    file_obj = result.scalars().first()

    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    if file_obj.owner_user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the file owner can delete it")

    # Soft-delete the database record
    from datetime import UTC, datetime
    file_obj.deleted_at = datetime.now(UTC)
    await db.commit()

    # Also delete from storage (hard delete for now; can add trash bin later)
    storage = get_storage_driver()
    await storage.delete_object(file_obj.object_key)

    logger.info("Deleted file: %s (id=%s) by user=%s", file_obj.display_name, file_id, user_id)
    return {"status": "ok", "message": f"File '{file_obj.display_name}' deleted"}


@router.patch("/{file_id}", response_model=FileObjectResponse)
async def update_file_metadata(
    file_id: str,
    request: Request,
    display_name: str | None = Query(default=None, description="New display name"),
    description: str | None = Query(default=None, description="New description"),
    parent_folder_id: str | None = Query(default=None, description="Move to folder"),
    visibility: str | None = Query(default=None, description="Change visibility"),
    db: AsyncSession = Depends(get_session),
    _ctx: Any = Depends(require_tenant_context),
):
    """Update file metadata (rename, move, change visibility, update description)."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    query = sa_select(FileObject).where(
        FileObject.id == file_id,
        FileObject.tenant_id == tenant_id,
        FileObject.deleted_at.is_(None),
    )
    result = await db.execute(query)
    file_obj = result.scalars().first()

    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    if file_obj.owner_user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the file owner can update metadata")

    if display_name is not None:
        file_obj.display_name = display_name
    if description is not None:
        file_obj.description = description
    if parent_folder_id is not None:
        # Verify target folder exists
        if parent_folder_id:
            folder_query = sa_select(FileFolder).where(
                FileFolder.id == parent_folder_id,
                FileFolder.tenant_id == tenant_id,
                FileFolder.deleted_at.is_(None),
            )
            folder_result = await db.execute(folder_query)
            if not folder_result.scalars().first():
                raise HTTPException(status_code=404, detail="Target folder not found")
        file_obj.parent_folder_id = parent_folder_id
    if visibility is not None:
        if visibility not in ("private", "tenant"):
            raise HTTPException(status_code=400, detail="visibility must be 'private' or 'tenant'")
        file_obj.visibility = visibility

    await db.commit()
    await db.refresh(file_obj)
    return _file_to_response(file_obj)
