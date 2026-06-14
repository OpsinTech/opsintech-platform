"""Cache for MCP tools to avoid repeated loading.

Uses a time-based TTL and a filesystem-based version file for cross-process
cache invalidation between the Gateway and LangGraph Server processes.
"""

import asyncio
import logging
import os
import time

from langchain_core.tools import BaseTool

from deerflow.config.tenant_context import get_current_tenant_id, get_current_user_id

logger = logging.getLogger(__name__)

_MCP_CACHE_TTL_SECONDS = int(os.getenv("MCP_CACHE_TTL_SECONDS", "300"))

_mcp_tools_cache: dict[str, list[BaseTool]] = {}
_cache_initialized: dict[str, float] = {}
_initialization_lock = asyncio.Lock()
_last_cache_version: int = 0


def _cache_version_file() -> str:
    from deerflow.config.paths import get_paths
    return str(get_paths().base_dir / ".mcp_cache_version")


def _read_cache_version() -> int:
    try:
        with open(_cache_version_file(), "r") as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return 0


def _bump_cache_version() -> None:
    new_version = int(time.time() * 1000)
    with open(_cache_version_file(), "w") as f:
        f.write(str(new_version))


def _make_cache_key(tenant_id: str | None, user_id: str | None) -> str:
    return f"{tenant_id or '__no_tenant__'}:{user_id or '__no_user__'}"


def _is_cache_valid(cache_key: str) -> bool:
    if cache_key not in _cache_initialized:
        return False
    elapsed = time.time() - _cache_initialized[cache_key]
    return elapsed < _MCP_CACHE_TTL_SECONDS


def _check_cross_process_invalidation() -> None:
    global _last_cache_version
    current_version = _read_cache_version()
    if current_version > _last_cache_version:
        _last_cache_version = current_version
        _mcp_tools_cache.clear()
        _cache_initialized.clear()
        logger.info(
            "MCP tools cache cleared via version file (version %d → %d)",
            _last_cache_version, current_version,
        )


async def initialize_mcp_tools(tenant_id: str | None = None, user_id: str | None = None) -> list[BaseTool]:
    """Initialize and cache MCP tools for a specific tenant+user.

    Returns:
        List of LangChain tools from all enabled MCP servers.
    """
    cache_key = _make_cache_key(tenant_id, user_id)

    async with _initialization_lock:
        if _is_cache_valid(cache_key):
            return _mcp_tools_cache.get(cache_key, [])

        from deerflow.mcp.tools import get_mcp_tools

        logger.info(f"Initializing MCP tools for cache key: {cache_key}")
        tools = await get_mcp_tools(user_id=user_id, tenant_id=tenant_id)
        _mcp_tools_cache[cache_key] = tools
        _cache_initialized[cache_key] = time.time()
        logger.info(f"MCP tools initialized for {cache_key}: {len(tools)} tool(s) loaded")

        return tools


def _lazy_init_tools(tenant_id: str | None, user_id: str | None) -> None:
    """Run async initialization from sync context."""
    cache_key = _make_cache_key(tenant_id, user_id)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run, initialize_mcp_tools(tenant_id, user_id)
                )
                future.result()
        else:
            loop.run_until_complete(initialize_mcp_tools(tenant_id, user_id))
    except RuntimeError:
        asyncio.run(initialize_mcp_tools(tenant_id, user_id))
    except Exception as e:
        logger.error(f"Failed to lazy-initialize MCP tools for {cache_key}: {e}", exc_info=True)
        _cache_initialized[cache_key] = time.time()
        _mcp_tools_cache[cache_key] = []


def get_cached_mcp_tools() -> list[BaseTool]:
    """Get cached MCP tools with lazy initialization, scoped to current tenant+user.

    Cache entries expire after _MCP_CACHE_TTL_SECONDS (default 300s). When expired,
    the next request triggers a fresh load from the database. Cross-process
    invalidation is supported via a version file in the shared OPSINTECH_HOME
    directory — when the Gateway process writes a new version after MCP config
    changes, the LangGraph Server picks it up on the next request.
    """
    tenant_id = get_current_tenant_id()
    user_id = get_current_user_id()
    cache_key = _make_cache_key(tenant_id, user_id)

    _check_cross_process_invalidation()

    if not _is_cache_valid(cache_key):
        logger.info(f"MCP tools cache expired or not initialized for {cache_key}, performing lazy initialization...")
        _lazy_init_tools(tenant_id, user_id)

    return _mcp_tools_cache.get(cache_key, [])


def reset_mcp_tools_cache() -> None:
    """Reset the MCP tools cache for ALL tenants.

    Must be called after MCP configuration is modified (e.g. by API write operations),
    so the next get_cached_mcp_tools() call triggers a fresh load from the database.

    Also bumps the cache version file on disk so that the LangGraph Server process
    (which runs in a separate process) can detect the change and invalidate its own
    copy of the cache.
    """
    _mcp_tools_cache.clear()
    _cache_initialized.clear()
    _bump_cache_version()
    logger.info("MCP tools cache reset (all tenants, version file bumped)")
