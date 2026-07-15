"""Local filesystem storage driver.

Implements the StorageProvider protocol using the local filesystem.
This is the default driver for development, containerized deployments
using volume mounts, and early production before migrating to MinIO.

Files are stored under ``{base_dir}/{local_root_path}/`` with a content-addressed
layout: ``{tenant_id}/objects/{ab}/{cd}/{uuid}.dat`` to avoid flat-directory
performance issues and to enable seamless migration to S3 later.
"""

import hashlib
import logging
import os
import uuid
from pathlib import Path

from deerflow.config.paths import get_paths
from deerflow.storage.provider import StorageProviderConfig

logger = logging.getLogger(__name__)


class LocalStorageDriver:
    """Local filesystem implementation of the StorageProvider protocol.

    Uses a content-addressed layout to avoid flat-directory bottlenecks
    and to make migration to object storage straightforward.
    """

    def __init__(self, config: StorageProviderConfig | None = None) -> None:
        """Initialize the local storage driver.

        Args:
            config: Storage configuration. If None, defaults are used.
        """
        self._config = config or StorageProviderConfig()
        self._root = self._resolve_root()

    def _resolve_root(self) -> Path:
        """Resolve the absolute root path for local file storage."""
        root_path = self._config.local_root_path
        p = Path(root_path)
        if not p.is_absolute():
            p = get_paths().base_dir / root_path
        return p.resolve()

    @property
    def root_path(self) -> Path:
        """The absolute root directory for local file storage."""
        return self._root

    def _object_path(self, object_key: str) -> Path:
        """Resolve an object_key to its absolute filesystem path.

        Performs path-traversal validation to prevent escaping the root.
        """
        # Normalize: strip leading slash, resolve relative segments
        normalized = object_key.lstrip("/")
        # Reject obvious traversal attempts
        if ".." in Path(normalized).parts:
            raise ValueError(f"Invalid object_key (path traversal): {object_key!r}")

        target = (self._root / normalized).resolve()
        try:
            target.relative_to(self._root)
        except ValueError:
            raise ValueError(f"Object key escapes storage root: {object_key!r}")
        return target

    @staticmethod
    def _compute_object_key(tenant_id: str, file_id: str) -> str:
        """Compute a deterministic content-addressed object key.

        Layout: ``{tenant_id}/objects/{ab}/{cd}/{file_id}.dat``
        where ``ab`` and ``cd`` are derived from a hash of file_id
        to distribute files across subdirectories.
        """
        digest = hashlib.sha256(file_id.encode("utf-8")).hexdigest()
        return f"{tenant_id}/objects/{digest[:2]}/{digest[2:4]}/{file_id}.dat"

    # ---- StorageProvider implementation ----

    async def put_object(
        self,
        object_key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Store file content on the local filesystem.

        Args:
            object_key: The storage key (relative path within root).
            content: Raw bytes to store.
            content_type: MIME type (noted but unused by local driver).

        Returns:
            The object_key.
        """
        file_path = self._object_path(object_key)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)
        logger.debug("Stored local object: %s (%d bytes)", object_key, len(content))
        return object_key

    async def get_object(self, object_key: str) -> bytes:
        """Read file content from the local filesystem.

        Args:
            object_key: The storage key.

        Returns:
            Raw bytes of the file.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        file_path = self._object_path(object_key)
        if not file_path.is_file():
            raise FileNotFoundError(f"Object not found: {object_key}")
        return file_path.read_bytes()

    async def delete_object(self, object_key: str) -> bool:
        """Delete a file from the local filesystem.

        Args:
            object_key: The storage key.

        Returns:
            True if deleted, False if it didn't exist.
        """
        file_path = self._object_path(object_key)
        if not file_path.is_file():
            return False
        file_path.unlink()
        logger.debug("Deleted local object: %s", object_key)

        # Clean up empty parent directories (walk up to root)
        parent = file_path.parent
        while parent != self._root:
            try:
                if not any(parent.iterdir()):
                    parent.rmdir()
                    parent = parent.parent
                else:
                    break
            except OSError:
                break

        return True

    async def object_exists(self, object_key: str) -> bool:
        """Check if a file exists."""
        file_path = self._object_path(object_key)
        return file_path.is_file()

    async def get_object_size(self, object_key: str) -> int:
        """Get file size in bytes.

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        file_path = self._object_path(object_key)
        if not file_path.is_file():
            raise FileNotFoundError(f"Object not found: {object_key}")
        return file_path.stat().st_size

    async def generate_download_url(
        self, object_key: str, expires_in: int = 3600
    ) -> str:
        """Generate a download URL for local files.

        For local storage, this returns a relative API path (not a presigned URL).
        The actual download is served by the API gateway.

        Args:
            object_key: The storage key.
            expires_in: Ignored for local storage (no expiration).

        Returns:
            An API path like ``/api/files/download/{object_key}``.
        """
        # URL-encode the object key for safety
        from urllib.parse import quote

        return f"/api/files/download/{quote(object_key, safe='')}"


# ---- Factory function ----

_storage_driver: "LocalStorageDriver | None" = None


def get_storage_driver() -> "LocalStorageDriver":
    """Return the configured storage driver (factory with singleton caching).

    Reads the ``storage`` section from ``config.yaml`` (or defaults) to
    determine which backend to use:

    - ``backend: local`` → ``LocalStorageDriver`` (default)
    - ``backend: s3`` → ``S3StorageDriver`` (MinIO / AWS S3)
    - ``backend: juicefs`` → ``JuiceFSStorageDriver`` (JuiceFS POSIX mount)

    The driver instance is cached as a singleton. Call ``reset_storage_driver()``
    to force re-initialization (useful for testing).
    """
    global _storage_driver

    if _storage_driver is not None:
        return _storage_driver

    # Resolve config — try AppConfig first, fall back to defaults
    config = _load_storage_config()

    backend = config.backend.lower()
    if backend == "s3":
        from deerflow.storage.s3 import S3StorageDriver

        _storage_driver = S3StorageDriver(config)
        logger.info("Initialized S3StorageDriver (bucket=%s)", config.s3_bucket_name)
    elif backend == "juicefs":
        from deerflow.storage.juicefs import JuiceFSStorageDriver

        _storage_driver = JuiceFSStorageDriver(config)
        logger.info("Initialized JuiceFSStorageDriver at %s", _storage_driver.root_path)
    else:
        _storage_driver = LocalStorageDriver(config)
        logger.info("Initialized LocalStorageDriver at %s", _storage_driver.root_path)

    return _storage_driver


def _load_storage_config() -> StorageProviderConfig:
    """Load storage configuration from AppConfig or environment.

    Priority:
    1. ``storage`` section in ``config.yaml`` (via AppConfig extra fields)
    2. Environment variables: ``OPSINTECH_STORAGE_BACKEND``, etc.
    3. Built-in defaults from ``StorageProviderConfig``
    """
    import os

    # Check environment variables first (highest priority for container deployments)
    env_backend = os.getenv("OPSINTECH_STORAGE_BACKEND")
    if env_backend:
        return StorageProviderConfig(
            backend=env_backend,
            local_root_path=os.getenv("OPSINTECH_STORAGE_LOCAL_ROOT", "data/storage"),
            s3_endpoint_url=os.getenv("OPSINTECH_STORAGE_S3_ENDPOINT", "http://localhost:9000"),
            s3_access_key=os.getenv("OPSINTECH_STORAGE_S3_ACCESS_KEY", "minioadmin"),
            s3_secret_key=os.getenv("OPSINTECH_STORAGE_S3_SECRET_KEY", "minioadmin"),
            s3_bucket_name=os.getenv("OPSINTECH_STORAGE_S3_BUCKET", "opsintech-files"),
            s3_region_name=os.getenv("OPSINTECH_STORAGE_S3_REGION", "us-east-1"),
            s3_use_ssl=os.getenv("OPSINTECH_STORAGE_S3_USE_SSL", "false").lower() == "true",
            juicefs_mount_path=os.getenv("OPSINTECH_STORAGE_JUICEFS_MOUNT", "/mnt/juicefs"),
            juicefs_subdir=os.getenv("OPSINTECH_STORAGE_JUICEFS_SUBDIR", "opsintech-files"),
        )

    # Try to read from AppConfig (config.yaml's `storage:` section)
    try:
        from deerflow.config.app_config import get_app_config

        app_config = get_app_config()
        storage_raw = getattr(app_config, "storage", None)
        if storage_raw is not None:
            if isinstance(storage_raw, dict):
                return StorageProviderConfig(**storage_raw)
            if isinstance(storage_raw, StorageProviderConfig):
                return storage_raw
    except Exception:
        logger.debug("Could not load storage config from AppConfig, using defaults")

    return StorageProviderConfig()


def reset_storage_driver() -> None:
    """Reset the storage driver singleton (useful for testing)."""
    global _storage_driver
    _storage_driver = None
