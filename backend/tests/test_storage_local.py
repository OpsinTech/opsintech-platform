"""Unit tests for the LocalStorageDriver."""

import tempfile

import pytest

from deerflow.storage.local import LocalStorageDriver
from deerflow.storage.provider import StorageProviderConfig

pytestmark = pytest.mark.anyio


@pytest.fixture
def driver():
    """Create a LocalStorageDriver backed by a temporary directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        config = StorageProviderConfig(local_root_path=tmpdir)
        yield LocalStorageDriver(config=config)


async def test_put_and_get_object(driver: LocalStorageDriver):
    """Test storing and retrieving an object."""
    content = b"Hello, File Center!"
    key = "test-tenant/objects/ab/cd/test-file.dat"

    result_key = await driver.put_object(key, content, "text/plain")
    assert result_key == key

    retrieved = await driver.get_object(key)
    assert retrieved == content


async def test_object_exists(driver: LocalStorageDriver):
    """Test existence checks."""
    key = "test-tenant/objects/ab/cd/exists-test.dat"

    assert not await driver.object_exists(key)

    await driver.put_object(key, b"test", "text/plain")
    assert await driver.object_exists(key)


async def test_delete_object(driver: LocalStorageDriver):
    """Test deleting an object."""
    key = "test-tenant/objects/ab/cd/delete-test.dat"
    await driver.put_object(key, b"test", "text/plain")

    assert await driver.object_exists(key)
    deleted = await driver.delete_object(key)
    assert deleted is True
    assert not await driver.object_exists(key)

    # Deleting a non-existent object returns False
    deleted_again = await driver.delete_object(key)
    assert deleted_again is False


async def test_get_object_size(driver: LocalStorageDriver):
    """Test getting object size."""
    content = b"Size test content"
    key = "test-tenant/objects/ab/cd/size-test.dat"
    await driver.put_object(key, content)

    size = await driver.get_object_size(key)
    assert size == len(content)


async def test_get_object_not_found(driver: LocalStorageDriver):
    """Test that retrieving a non-existent object raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        await driver.get_object("nonexistent/key.dat")


async def test_path_traversal_rejected(driver: LocalStorageDriver):
    """Test that path traversal attempts are rejected."""
    with pytest.raises(ValueError, match="Invalid object_key"):
        await driver.put_object("../escape.dat", b"bad")

    with pytest.raises(ValueError, match="Invalid object_key"):
        await driver.get_object("subdir/../../escape.dat")


async def test_compute_object_key():
    """Test the deterministic object key computation."""
    driver = LocalStorageDriver()
    key = driver._compute_object_key("tenant-abc", "file-123")

    assert key.startswith("tenant-abc/objects/")
    assert key.endswith("/file-123.dat")

    # Same inputs produce the same key
    key2 = driver._compute_object_key("tenant-abc", "file-123")
    assert key == key2

    # Different file_id produces different key
    key3 = driver._compute_object_key("tenant-abc", "file-456")
    assert key != key3


async def test_generate_download_url(driver: LocalStorageDriver):
    """Test download URL generation."""
    key = "tenant-abc/objects/ab/cd/test.dat"
    url = await driver.generate_download_url(key)

    assert url.startswith("/api/files/download/")
    assert "tenant-abc" in url
