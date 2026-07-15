"""JuiceFS storage driver.

JuiceFS is a distributed POSIX-compatible filesystem built on top of
object storage (S3, MinIO, etc.) and a metadata engine (Redis, TiKV, etc.).
When mounted, it appears as a standard local directory, which means we can
reuse the LocalStorageDriver implementation with JuiceFS-specific path
configuration.

Key design decisions:
- JuiceFS is treated as a **POSIX filesystem** — we write to it exactly like
  a local disk, leveraging JuiceFS's built-in caching, chunking, and replication.
- This driver is a thin wrapper around LocalStorageDriver that enforces the
  JuiceFS mount path and subdirectory layout.
- For applications that use JuiceFS **without** mounting (via S3 gateway),
  use the S3StorageDriver instead.

The JuiceFS mount must be pre-configured by operations (e.g., via
``juicefs mount`` or Kubernetes CSI driver). This driver does NOT manage
the mount lifecycle.
"""

import logging
from pathlib import Path

from deerflow.storage.local import LocalStorageDriver
from deerflow.storage.provider import StorageProviderConfig

logger = logging.getLogger(__name__)


class JuiceFSStorageDriver(LocalStorageDriver):
    """JuiceFS storage driver — POSIX filesystem backed by JuiceFS.

    Inherits all functionality from LocalStorageDriver and overrides only
    the root path resolution to point to the JuiceFS mount.

    The JuiceFS volume must already be mounted at the configured mount path.
    The driver will operate within ``{mount_path}/{subdir}/``.

    Example config.yaml::

        storage:
            backend: juicefs
            juicefs_mount_path: /mnt/juicefs
            juicefs_subdir: opsintech-files

    This produces files at::

        /mnt/juicefs/opsintech-files/{tenant_id}/objects/{ab}/{cd}/{uuid}.dat
    """

    def __init__(self, config: StorageProviderConfig | None = None) -> None:
        """Initialize the JuiceFS storage driver.

        Args:
            config: Storage configuration with juicefs_* fields populated.

        Raises:
            FileNotFoundError: If the JuiceFS mount path does not exist.
            PermissionError: If the mount path is not writable.
        """
        self._config = config or StorageProviderConfig()
        self._root = self._resolve_root()
        self._verify_mount()

    def _resolve_root(self) -> Path:
        """Resolve the JuiceFS root path: ``{mount_path}/{subdir}/``."""
        mount = Path(self._config.juicefs_mount_path)
        if not mount.is_absolute():
            raise ValueError(
                "juicefs_mount_path must be an absolute path, "
                f"got: {self._config.juicefs_mount_path!r}"
            )
        subdir = self._config.juicefs_subdir.strip("/")
        return (mount / subdir).resolve()

    def _verify_mount(self) -> None:
        """Verify that the JuiceFS volume is mounted and writable.

        Checks:
        1. The mount parent path exists (the JuiceFS mount point itself)
        2. The subdirectory is writable (create it if needed)
        """
        mount_parent = Path(self._config.juicefs_mount_path)
        if not mount_parent.exists():
            raise FileNotFoundError(
                f"JuiceFS mount path does not exist: {mount_parent}. "
                "Ensure JuiceFS is mounted before starting the application."
            )

        # Create the subdirectory if it doesn't exist yet
        self._root.mkdir(parents=True, exist_ok=True)

        # Write a small probe file to verify writability
        probe = self._root / ".opsintech_write_probe"
        try:
            probe.write_text("ok")
            probe.unlink()
        except (OSError, PermissionError) as e:
            raise PermissionError(
                f"JuiceFS mount path is not writable: {self._root}. {e}"
            )

        logger.info(
            "JuiceFSStorageDriver initialized: mount=%s, subdir=%s",
            self._config.juicefs_mount_path,
            self._config.juicefs_subdir,
        )
