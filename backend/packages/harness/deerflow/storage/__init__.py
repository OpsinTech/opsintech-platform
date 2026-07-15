"""Storage abstraction layer for OpsinTech file management.

Provides a unified interface for file storage operations, allowing
the platform to switch between local filesystem storage (dev/container),
object storage backends like MinIO (production), and distributed POSIX
filesystems like JuiceFS without changing business logic.
"""

from deerflow.storage.provider import StorageProvider, StorageProviderConfig
from deerflow.storage.local import LocalStorageDriver
from deerflow.storage.s3 import S3StorageDriver
from deerflow.storage.juicefs import JuiceFSStorageDriver

__all__ = [
    "StorageProvider",
    "StorageProviderConfig",
    "LocalStorageDriver",
    "S3StorageDriver",
    "JuiceFSStorageDriver",
]
