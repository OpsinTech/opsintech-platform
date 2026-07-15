"""Unit tests for the JuiceFSStorageDriver."""

import tempfile
from pathlib import Path

import pytest

from deerflow.storage.juicefs import JuiceFSStorageDriver
from deerflow.storage.provider import StorageProviderConfig

pytestmark = pytest.mark.anyio


@pytest.fixture
def juicefs_config(tmp_path: Path):
    """Create a StorageProviderConfig pointing to a temp dir as the JuiceFS mount.

    In real deployments, this would be ``/mnt/juicefs``, but for testing we
    use a temporary directory to simulate a mounted JuiceFS volume.
    """
    return StorageProviderConfig(
        backend="juicefs",
        juicefs_mount_path=str(tmp_path),
        juicefs_subdir="opsintech-files",
    )


@pytest.fixture
def driver(juicefs_config: StorageProviderConfig):
    """Create a JuiceFSStorageDriver backed by a temp directory."""
    driver = JuiceFSStorageDriver(config=juicefs_config)
    yield driver


async def test_juicefs_put_and_get_object(driver: JuiceFSStorageDriver):
    """Test storing and retrieving an object via JuiceFS."""
    content = b"JuiceFS test content"
    key = "test-tenant/objects/ab/cd/test-file.dat"

    result_key = await driver.put_object(key, content)
    assert result_key == key

    retrieved = await driver.get_object(key)
    assert retrieved == content


async def test_juicefs_root_is_subdir(juicefs_config: StorageProviderConfig):
    """Verify the root path includes the subdir."""
    driver = JuiceFSStorageDriver(config=juicefs_config)
    assert driver.root_path.name == "opsintech-files"
    assert str(juicefs_config.juicefs_mount_path) in str(driver.root_path)


async def test_juicefs_object_exists(driver: JuiceFSStorageDriver):
    """Test existence checks via JuiceFS."""
    key = "test-tenant/objects/ab/cd/exists-test.dat"

    assert not await driver.object_exists(key)
    await driver.put_object(key, b"test")
    assert await driver.object_exists(key)


async def test_juicefs_delete_object(driver: JuiceFSStorageDriver):
    """Test deleting an object via JuiceFS."""
    key = "test-tenant/objects/ab/cd/delete-test.dat"
    await driver.put_object(key, b"test")

    deleted = await driver.delete_object(key)
    assert deleted is True
    assert not await driver.object_exists(key)


async def test_juicefs_get_object_size(driver: JuiceFSStorageDriver):
    """Test getting object size via JuiceFS."""
    content = b"Size test"
    key = "test-tenant/objects/ab/cd/size-test.dat"
    await driver.put_object(key, content)

    size = await driver.get_object_size(key)
    assert size == len(content)


async def test_juicefs_mount_not_found():
    """Test that a non-existent mount path raises FileNotFoundError."""
    config = StorageProviderConfig(
        backend="juicefs",
        juicefs_mount_path="/nonexistent/juicefs/mount",
        juicefs_subdir="test",
    )
    with pytest.raises(FileNotFoundError, match="JuiceFS mount path does not exist"):
        JuiceFSStorageDriver(config=config)


async def test_juicefs_relative_mount_rejected():
    """Test that a relative mount path raises ValueError."""
    config = StorageProviderConfig(
        backend="juicefs",
        juicefs_mount_path="relative/path",
        juicefs_subdir="test",
    )
    with pytest.raises(ValueError, match="juicefs_mount_path must be an absolute path"):
        JuiceFSStorageDriver(config=config)


async def test_juicefs_compute_object_key(tmp_path: Path):
    """Verify compute_object_key is inherited from LocalStorageDriver."""
    config = StorageProviderConfig(
        backend="juicefs",
        juicefs_mount_path=str(tmp_path),
        juicefs_subdir="test",
    )
    driver = JuiceFSStorageDriver(config=config)
    key = driver._compute_object_key("tenant-xyz", "file-999")
    assert key.startswith("tenant-xyz/objects/")
    assert key.endswith("/file-999.dat")
