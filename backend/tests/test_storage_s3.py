"""Unit tests for the S3StorageDriver (uses moto for S3 mocking)."""

import pytest

from deerflow.storage.provider import StorageProviderConfig

pytestmark = pytest.mark.anyio

# aioboto3 is optional — skip all tests if not installed
try:
    import aioboto3
    from moto import mock_aws

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False

pytestmark = pytest.mark.skipif(
    not HAS_DEPS,
    reason="aioboto3 and moto are required for S3 tests",
)


@pytest.fixture
def s3_config():
    """Create a StorageProviderConfig for S3 (MinIO-compatible)."""
    return StorageProviderConfig(
        backend="s3",
        s3_endpoint_url="http://localhost:9000",
        s3_access_key="test-access-key",
        s3_secret_key="test-secret-key",
        s3_bucket_name="opsintech-test",
        s3_region_name="us-east-1",
    )


@pytest.fixture
async def driver(s3_config):
    """Create an S3StorageDriver with moto-mocked S3."""
    from deerflow.storage.s3 import S3StorageDriver

    driver = S3StorageDriver(config=s3_config)
    # Ensure the test bucket exists
    await driver._ensure_bucket()
    return driver


@pytest.fixture(autouse=True)
def aws_mock():
    """Automatically mock AWS for all tests in this module."""
    with mock_aws():
        yield


async def test_s3_put_and_get_object(driver):
    """Test storing and retrieving an object in S3."""
    content = b"S3 test content"
    key = "test-tenant/objects/ab/cd/test-file.dat"

    result_key = await driver.put_object(key, content, "text/plain")
    assert result_key == key

    retrieved = await driver.get_object(key)
    assert retrieved == content


async def test_s3_object_exists(driver):
    """Test existence checks in S3."""
    key = "test-tenant/objects/ab/cd/exists-test.dat"

    assert not await driver.object_exists(key)
    await driver.put_object(key, b"test")
    assert await driver.object_exists(key)


async def test_s3_delete_object(driver):
    """Test deleting an object from S3."""
    key = "test-tenant/objects/ab/cd/delete-test.dat"
    await driver.put_object(key, b"test")

    deleted = await driver.delete_object(key)
    assert deleted is True
    assert not await driver.object_exists(key)

    # Deleting non-existent returns False
    deleted_again = await driver.delete_object(key)
    assert deleted_again is False


async def test_s3_get_object_size(driver):
    """Test getting object size from S3."""
    content = b"Size test"
    key = "test-tenant/objects/ab/cd/size-test.dat"
    await driver.put_object(key, content)

    size = await driver.get_object_size(key)
    assert size == len(content)


async def test_s3_get_object_not_found(driver):
    """Test that retrieving a non-existent S3 object raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        await driver.get_object("nonexistent/key.dat")


async def test_s3_generate_download_url(driver):
    """Test presigned URL generation."""
    key = "test-tenant/objects/ab/cd/test.dat"
    await driver.put_object(key, b"test")
    url = await driver.generate_download_url(key, expires_in=3600)
    assert url.startswith("http")
    assert "test.dat" in url
