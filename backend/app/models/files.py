"""File Center domain models — DB-backed file and folder management.

All tables carry tenant_id for multi-tenant isolation and follow the
conventions established in deerflow.database.models and app.models.

These models power the platform's unified File Center, which serves:
- User-uploaded files (private by default)
- AI-generated artifacts (PRDs, reports, etc.)
- Tenant public files
- Business module attachments
"""

from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class FileFolder(SQLModel, table=True):
    """Virtual folder node in the File Center directory tree.

    Folders are logical groupings — they do NOT map to filesystem directories.
    The virtual tree is maintained via parent_id references, enabling:
    - Fast listing via database indexes (no filesystem scan)
    - Unified permission checks
    - Seamless migration between storage backends
    - Soft delete / recycle bin support (via deleted_at)
    """

    __tablename__ = "file_folders"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "owner_user_id", "parent_id", "display_name",
            name="uq_file_folders_tenant_user_parent_name",
        ),
    )

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    owner_user_id: str = Field(index=True)
    visibility: str = Field(
        default="private",
        index=True,
        description="Visibility scope: 'private' or 'tenant'",
    )
    parent_id: str | None = Field(
        default=None,
        index=True,
        foreign_key="file_folders.id",
        description="Parent folder ID; NULL for root-level folders",
    )
    display_name: str = Field(description="User-visible folder name")
    path_cache: str | None = Field(
        default=None,
        description="Denormalized full path for fast display (e.g. '/我的文件/需求文档')",
    )
    created_by: str = Field(index=True, description="User ID who created this folder")
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(
            DateTime(timezone=True), nullable=False,
            server_default=func.now(), onupdate=func.now(),
        ),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="Soft-delete timestamp; NULL means active",
    )


class FileObject(SQLModel, table=True):
    """A file stored in the File Center.

    Each FileObject records:
    - Business metadata (who owns it, where it lives in the virtual tree)
    - Storage metadata (which backend, what key to use)
    - Origin info (was it uploaded, AI-generated, or a business attachment?)

    The actual binary content lives in the storage backend (local disk or MinIO),
    keyed by ``storage_backend`` + ``object_key``.
    """

    __tablename__ = "file_objects"
    __table_args__ = (
        UniqueConstraint("object_key", name="uq_file_objects_object_key"),
    )

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    owner_user_id: str = Field(index=True)
    visibility: str = Field(
        default="private",
        index=True,
        description="Visibility scope: 'private' or 'tenant'",
    )
    parent_folder_id: str | None = Field(
        default=None,
        index=True,
        foreign_key="file_folders.id",
        description="Virtual folder this file belongs to",
    )

    # Display / business metadata
    display_name: str = Field(description="User-visible filename")
    original_filename: str = Field(
        default="",
        description="Original filename as provided during upload",
    )
    mime_type: str = Field(
        default="application/octet-stream",
        description="MIME type (e.g., 'application/pdf', 'image/png')",
    )
    extension: str = Field(
        default="",
        description="File extension including dot (e.g., '.pdf', '.md')",
    )
    size_bytes: int = Field(default=0, description="File size in bytes")
    checksum: str = Field(
        default="",
        description="SHA-256 hex digest of file content for integrity verification",
    )
    description: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Optional human-readable description of the file",
    )

    # Storage backend metadata
    storage_backend: str = Field(
        default="local",
        index=True,
        description="Storage backend identifier: 'local' or 's3'",
    )
    object_key: str = Field(
        description="Unique key/path used by the storage backend to locate the file",
    )

    # Origin / source tracking
    source_type: str = Field(
        default="upload",
        index=True,
        description="How the file was created: 'upload', 'ai_generated', or 'business_attachment'",
    )
    business_type: str | None = Field(
        default=None,
        index=True,
        description="If source_type='business_attachment', the business domain (e.g., 'alert', 'ticket')",
    )
    business_id: str | None = Field(
        default=None,
        index=True,
        description="If source_type='business_attachment', the specific business object ID",
    )

    # Audit fields
    created_by: str = Field(index=True, description="User ID who created/uploaded this file")
    created_by_role: str = Field(
        default="user",
        description="Role of creator: 'user', 'tenant_admin', or 'platform_admin'",
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(
            DateTime(timezone=True), nullable=False,
            server_default=func.now(), onupdate=func.now(),
        ),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="Soft-delete timestamp; NULL means active",
    )
