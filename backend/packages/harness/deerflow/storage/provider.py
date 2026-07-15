"""Storage provider protocol and configuration.

Defines the abstract interface that all storage backends (local, MinIO/S3, etc.)
must implement, along with a configuration model for storage settings.
"""

from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


class StorageProviderConfig(BaseModel):
    """Configuration for the storage provider.

    Environment variables take precedence over config file values.
    """

    backend: str = Field(
        default="local",
        description="Storage backend type: 'local', 's3' (MinIO-compatible), or 'juicefs'",
    )
    # Local storage settings
    local_root_path: str = Field(
        default="data/storage",
        description="Root directory for local file storage (relative to base_dir)",
    )
    # S3 / MinIO settings
    s3_endpoint_url: str = Field(
        default="http://localhost:9000",
        description="S3-compatible endpoint URL (e.g., MinIO)",
    )
    s3_access_key: str = Field(default="minioadmin", description="S3 access key")
    s3_secret_key: str = Field(default="minioadmin", description="S3 secret key")
    s3_bucket_name: str = Field(
        default="opsintech-files", description="S3 bucket name for file storage"
    )
    s3_region_name: str = Field(default="us-east-1", description="S3 region name")
    s3_use_ssl: bool = Field(default=False, description="Whether to use SSL for S3 connections")
    # JuiceFS settings
    juicefs_mount_path: str = Field(
        default="/mnt/juicefs",
        description="Mount path for JuiceFS volume (POSIX-compatible)",
    )
    juicefs_subdir: str = Field(
        default="opsintech-files",
        description="Subdirectory within the JuiceFS mount for this application's files",
    )


@runtime_checkable
class StorageProvider(Protocol):
    """Protocol defining the storage provider interface.

    All storage backends (local, MinIO/S3, etc.) must implement these methods.
    The interface is intentionally kept simple for V0.1 — it covers the core
    CRUD operations needed for file management.

    All methods are async to support both synchronous local I/O (via aiofiles)
    and async S3 SDK calls uniformly.
    """

    async def put_object(
        self, object_key: str, content: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        """Store an object and return its storage key.

        Args:
            object_key: Unique key/path identifying the object in storage.
            content: Raw bytes of the file content.
            content_type: MIME type of the content.

        Returns:
            The object_key (same as input, for chaining).
        """
        ...

    async def get_object(self, object_key: str) -> bytes:
        """Retrieve an object's content by its storage key.

        Args:
            object_key: The storage key returned by put_object.

        Returns:
            Raw bytes of the stored file content.

        Raises:
            FileNotFoundError: If the object does not exist.
        """
        ...

    async def delete_object(self, object_key: str) -> bool:
        """Delete an object from storage.

        Args:
            object_key: The storage key of the object to delete.

        Returns:
            True if the object was deleted, False if it didn't exist.
        """
        ...

    async def object_exists(self, object_key: str) -> bool:
        """Check whether an object exists in storage.

        Args:
            object_key: The storage key to check.

        Returns:
            True if the object exists, False otherwise.
        """
        ...

    async def get_object_size(self, object_key: str) -> int:
        """Get the size in bytes of a stored object.

        Args:
            object_key: The storage key.

        Returns:
            Size in bytes.

        Raises:
            FileNotFoundError: If the object does not exist.
        """
        ...

    async def generate_download_url(
        self, object_key: str, expires_in: int = 3600
    ) -> str:
        """Generate a time-limited download URL for an object.

        For local storage, this returns a relative API path.
        For S3/MinIO, this returns a presigned URL.

        Args:
            object_key: The storage key.
            expires_in: URL validity duration in seconds (default 1 hour).

        Returns:
            A URL string that can be used to download the file.
        """
        ...
