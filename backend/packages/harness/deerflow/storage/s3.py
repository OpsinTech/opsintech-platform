"""S3-compatible storage driver (MinIO, AWS S3, etc.).

Implements the StorageProvider protocol using aioboto3 for async S3 operations.
Works with any S3-compatible service including:
- MinIO (self-hosted or cloud)
- AWS S3
- Cloudflare R2
- Backblaze B2
- JuiceFS with S3 gateway

Requires ``aioboto3`` to be installed: ``pip install aioboto3``
"""

import logging
from typing import Any

from deerflow.storage.provider import StorageProviderConfig

logger = logging.getLogger(__name__)

# aioboto3 is optional — only import when the S3 driver is actually used
try:
    import aioboto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:  # pragma: no cover
    HAS_BOTO3 = False
    aioboto3 = None  # type: ignore[assignment]


class S3StorageDriver:
    """S3-compatible storage driver using aioboto3 for async operations.

    This driver works with any S3-compatible service. It uses aioboto3's
    async session/context manager pattern for non-blocking I/O.

    Usage::

        config = StorageProviderConfig(
            backend="s3",
            s3_endpoint_url="http://localhost:9000",
            s3_access_key="minioadmin",
            s3_secret_key="minioadmin",
            s3_bucket_name="opsintech-files",
        )
        driver = S3StorageDriver(config)
        await driver.put_object("key", b"content", "text/plain")
    """

    def __init__(self, config: StorageProviderConfig | None = None) -> None:
        """Initialize the S3 storage driver.

        Args:
            config: Storage configuration. If None, defaults are used.

        Raises:
            ImportError: If aioboto3 is not installed.
        """
        if not HAS_BOTO3:
            raise ImportError(
                "aioboto3 is required for S3 storage. "
                "Install it with: pip install aioboto3"
            )
        self._config = config or StorageProviderConfig()
        self._bucket = self._config.s3_bucket_name

    def _get_session(self) -> Any:
        """Create an aioboto3 session with the configured credentials."""
        return aioboto3.Session(
            aws_access_key_id=self._config.s3_access_key,
            aws_secret_access_key=self._config.s3_secret_key,
            region_name=self._config.s3_region_name,
        )

    def _get_client_kwargs(self) -> dict[str, Any]:
        """Build kwargs for creating an S3 client."""
        kwargs: dict[str, Any] = {}
        if self._config.s3_endpoint_url:
            kwargs["endpoint_url"] = self._config.s3_endpoint_url
            kwargs["use_ssl"] = self._config.s3_use_ssl
            # MinIO requires path-style addressing
            kwargs["config"] = aioboto3.Config(
                s3={"addressing_style": "path"},
                signature_version="s3v4",
            )
        return kwargs

    async def _ensure_bucket(self) -> None:
        """Create the bucket if it doesn't exist."""
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            try:
                await s3.head_bucket(Bucket=self._bucket)
            except ClientError as e:
                error_code = e.response["Error"]["Code"]  # type: ignore[index]
                if error_code in ("404", "NoSuchBucket"):
                    # Create the bucket
                    if self._config.s3_region_name and self._config.s3_region_name != "us-east-1":
                        await s3.create_bucket(
                            Bucket=self._bucket,
                            CreateBucketConfiguration={
                                "LocationConstraint": self._config.s3_region_name
                            },
                        )
                    else:
                        await s3.create_bucket(Bucket=self._bucket)
                    logger.info("Created S3 bucket: %s", self._bucket)
                else:
                    raise

    # ---- StorageProvider implementation ----

    async def put_object(
        self,
        object_key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Store an object in S3.

        Args:
            object_key: The S3 object key.
            content: Raw bytes to store.
            content_type: MIME type for the Content-Type header.

        Returns:
            The object_key.
        """
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=object_key,
                Body=content,
                ContentType=content_type,
            )
        logger.debug("Stored S3 object: %s (%d bytes)", object_key, len(content))
        return object_key

    async def get_object(self, object_key: str) -> bytes:
        """Retrieve an object from S3.

        Args:
            object_key: The S3 object key.

        Returns:
            Raw bytes of the stored content.

        Raises:
            FileNotFoundError: If the object does not exist.
        """
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            try:
                response = await s3.get_object(Bucket=self._bucket, Key=object_key)
                body = await response["Body"].read()
                return body
            except ClientError as e:
                error_code = e.response["Error"]["Code"]  # type: ignore[index]
                if error_code == "NoSuchKey":
                    raise FileNotFoundError(f"Object not found: {object_key}")
                raise

    async def delete_object(self, object_key: str) -> bool:
        """Delete an object from S3.

        Args:
            object_key: The S3 object key.

        Returns:
            True if the object was deleted, False if it didn't exist.
        """
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            try:
                await s3.head_object(Bucket=self._bucket, Key=object_key)
            except ClientError as e:
                error_code = e.response["Error"]["Code"]  # type: ignore[index]
                if error_code == "404":
                    return False
                raise

            await s3.delete_object(Bucket=self._bucket, Key=object_key)
            logger.debug("Deleted S3 object: %s", object_key)
            return True

    async def object_exists(self, object_key: str) -> bool:
        """Check whether an object exists in S3.

        Args:
            object_key: The S3 object key.

        Returns:
            True if the object exists, False otherwise.
        """
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            try:
                await s3.head_object(Bucket=self._bucket, Key=object_key)
                return True
            except ClientError:
                return False

    async def get_object_size(self, object_key: str) -> int:
        """Get the size of an S3 object in bytes.

        Args:
            object_key: The S3 object key.

        Returns:
            Size in bytes.

        Raises:
            FileNotFoundError: If the object does not exist.
        """
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            try:
                response = await s3.head_object(Bucket=self._bucket, Key=object_key)
                return response["ContentLength"]
            except ClientError as e:
                error_code = e.response["Error"]["Code"]  # type: ignore[index]
                if error_code == "404":
                    raise FileNotFoundError(f"Object not found: {object_key}")
                raise

    async def generate_download_url(
        self, object_key: str, expires_in: int = 3600
    ) -> str:
        """Generate a presigned URL for downloading an S3 object.

        Args:
            object_key: The S3 object key.
            expires_in: URL validity duration in seconds (default 1 hour).

        Returns:
            A presigned URL that can be used to download the file directly.
        """
        session = self._get_session()
        client_kwargs = self._get_client_kwargs()
        async with session.client("s3", **client_kwargs) as s3:
            url = await s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self._bucket, "Key": object_key},
                ExpiresIn=expires_in,
            )
            return url
