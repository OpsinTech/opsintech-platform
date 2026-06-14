"""Configuration and loaders for custom agents — now DB-backed with filesystem fallback."""

import asyncio
import concurrent.futures
import functools
import logging
import re

import yaml
from pydantic import BaseModel
from sqlmodel import select

from deerflow.config.paths import get_paths
from deerflow.config.tenant_context import get_current_tenant_id, get_current_user_id
from deerflow.database.session import get_session_factory

logger = logging.getLogger(__name__)

SOUL_FILENAME = "SOUL.md"
AGENT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")


def _run_async(coro):
    """Run an async coroutine from sync code.

    Handles both the common case (no running event loop) and the edge case
    (called from within an already-running event loop, e.g. during tests).
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(asyncio.run, coro).result()


def _db_agent_to_config(agent) -> "AgentConfig":
    """Convert a CustomAgent DB row to an AgentConfig."""
    return AgentConfig(
        id=agent.id,
        name=agent.name,
        description=agent.description or "",
        model=agent.model,
        tool_groups=agent.tool_groups or None,
        system_prompt=agent.system_prompt or "",
        skills=agent.skills or [],
        enabled=agent.enabled,
        tags=agent.tags or [],
    )


class AgentConfig(BaseModel):
    """Configuration for a custom agent."""

    name: str
    description: str = ""
    model: str | None = None
    tool_groups: list[str] | None = None
    # New DB-backed fields
    id: str | None = None
    system_prompt: str = ""
    skills: list[str] | None = None
    enabled: bool = True
    tags: list[str] | None = None


async def _query_agent_config(name: str, user_id: str, tenant_id: str | None):
    """Async helper: query CustomAgent from DB."""
    from app.models.agents import CustomAgent

    session_factory = get_session_factory()
    async with session_factory() as session:
        stmt = select(CustomAgent).where(
            CustomAgent.tenant_id == tenant_id,
            CustomAgent.user_id.in_([user_id, "tenant-shared"]),
            CustomAgent.name == name,
        )
        result = await session.exec(stmt)
        agents = result.all()
        if not agents:
            return None
        for a in agents:
            if a.user_id == user_id:
                return a
        return agents[0]



async def _query_agent_list(user_id: str, tenant_id: str | None):
    """Async helper: query all CustomAgent rows for a user in a tenant."""
    from app.models.agents import CustomAgent

    session_factory = get_session_factory()
    async with session_factory() as session:
        stmt = select(CustomAgent).where(
            CustomAgent.tenant_id == tenant_id,
            CustomAgent.user_id == user_id,
        ).order_by(CustomAgent.name)
        result = await session.exec(stmt)
        return result.all()


@functools.lru_cache(maxsize=128)
def load_agent_config(
    name: str | None,
    user_id: str | None = None,
    tenant_id: str | None = None,
) -> "AgentConfig | None":
    """Load a custom agent's config — DB first, filesystem fallback.

    Args:
        name: The agent name. If None, returns None (default agent).
        user_id: The user ID. Resolved from context if not provided.
        tenant_id: The tenant ID. Resolved from context if not provided.

    Returns:
        AgentConfig if found and enabled, None otherwise.

    Raises:
        FileNotFoundError: If the agent is not found anywhere.
    """
    if name is None:
        return None

    if not AGENT_NAME_PATTERN.match(name):
        raise ValueError(
            f"Invalid agent name '{name}'. Must match pattern: {AGENT_NAME_PATTERN.pattern}"
        )

    resolved_user_id = user_id if user_id is not None else get_current_user_id()
    resolved_tenant_id = (
        tenant_id
        if tenant_id is not None
        else (get_current_tenant_id() if resolved_user_id is not None else None)
    )

    # Try DB first
    try:
        agent = _run_async(
            _query_agent_config(name, resolved_user_id, resolved_tenant_id)
        )
        if agent is not None:
            if not agent.enabled:
                logger.debug(f"Agent '{name}' is disabled, treating as not found.")
                return None
            return _db_agent_to_config(agent)
    except Exception:
        logger.error(f"DB lookup failed for agent '{name}', falling back to filesystem", exc_info=True)

    # Fall back to filesystem (Phase A backward compat)
    try:
        return _load_agent_config_from_filesystem(name, resolved_user_id, resolved_tenant_id)
    except FileNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Failed to load agent '{name}' from filesystem: {e}", exc_info=True)
        raise FileNotFoundError(f"Agent '{name}' not found")


def load_agent_soul(
    agent_name: str | None,
    user_id: str | None = None,
    tenant_id: str | None = None,
) -> str | None:
    """Read the agent soul (personality/guardrails) — DB first, filesystem fallback.

    Args:
        agent_name: The name of the agent, or None for the default agent.

    Returns:
        The soul content as a string, or None if not found.
    """
    resolved_user_id = user_id if user_id is not None else get_current_user_id()
    resolved_tenant_id = (
        tenant_id
        if tenant_id is not None
        else (get_current_tenant_id() if resolved_user_id is not None else None)
    )

    if agent_name:
        # Try DB first
        try:
            agent = _run_async(
                _query_agent_config(agent_name, resolved_user_id, resolved_tenant_id)
            )
            if agent is not None and agent.system_prompt:
                return agent.system_prompt
        except Exception:
            logger.error(
                f"DB lookup failed for agent soul '{agent_name}', falling back to filesystem", exc_info=True
            )

        # Fall back to filesystem
        agent_dir = get_paths().agent_dir(
            agent_name, user_id=resolved_user_id, tenant_id=resolved_tenant_id
        )
        soul_path = agent_dir / SOUL_FILENAME
        if soul_path.exists():
            logger.warning(
                f"Agent '{agent_name}' loaded from filesystem — this is deprecated. "
                "Run backfill_agents_to_db to migrate."
            )
            content = soul_path.read_text(encoding="utf-8").strip()
            return content or None
        return None

    # Default agent (agent_name is None): read global SOUL.md
    soul_path = get_paths().base_dir / SOUL_FILENAME
    if not soul_path.exists():
        return None
    content = soul_path.read_text(encoding="utf-8").strip()
    return content or None


def list_custom_agents(
    user_id: str | None = None,
    tenant_id: str | None = None,
) -> list["AgentConfig"]:
    """List all custom agents for a user — DB first, filesystem fallback.

    Returns:
        List of AgentConfig for each agent found.
    """
    resolved_user_id = user_id if user_id is not None else get_current_user_id()
    resolved_tenant_id = (
        tenant_id
        if tenant_id is not None
        else (get_current_tenant_id() if resolved_user_id is not None else None)
    )

    # Try DB first
    try:
        agents = _run_async(
            _query_agent_list(resolved_user_id, resolved_tenant_id)
        )
        if agents:
            return [_db_agent_to_config(a) for a in agents]
    except Exception:
        logger.error("DB lookup failed for agent list, falling back to filesystem", exc_info=True)

    # Fall back to filesystem scan
    logger.warning("Listing agents from filesystem — this is deprecated. Run backfill_agents_to_db to migrate.")
    return _list_custom_agents_from_filesystem(resolved_user_id, resolved_tenant_id)


# ---------------------------------------------------------------------------
# Filesystem fallback (Phase A backward compat — to be removed in Phase B)
# ---------------------------------------------------------------------------


def _load_agent_config_from_filesystem(
    name: str, user_id: str, tenant_id: str | None
) -> "AgentConfig":
    """Load agent config from config.yaml on disk (deprecated)."""
    agent_dir = get_paths().agent_dir(name, user_id=user_id, tenant_id=tenant_id)
    config_file = agent_dir / "config.yaml"

    if not agent_dir.exists():
        raise FileNotFoundError(f"Agent directory not found: {agent_dir}")
    if not config_file.exists():
        raise FileNotFoundError(f"Agent config not found: {config_file}")

    logger.warning(
        f"Agent '{name}' loaded from filesystem — this is deprecated. "
        "Run backfill_agents_to_db to migrate."
    )

    try:
        with open(config_file, encoding="utf-8") as f:
            data: dict = yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        raise ValueError(f"Failed to parse agent config {config_file}: {e}") from e

    if "name" not in data:
        data["name"] = name

    # Read SOUL.md for system_prompt
    soul_path = agent_dir / SOUL_FILENAME
    if soul_path.exists():
        data["system_prompt"] = soul_path.read_text(encoding="utf-8").strip()

    # Strip unknown fields
    known_fields = set(AgentConfig.model_fields.keys())
    data = {k: v for k, v in data.items() if k in known_fields}

    return AgentConfig(**data)


def _list_custom_agents_from_filesystem(
    user_id: str, tenant_id: str | None
) -> list["AgentConfig"]:
    """Scan the agents directory for valid agents (deprecated)."""
    agents_dir = get_paths().agents_dir(user_id=user_id, tenant_id=tenant_id)

    if not agents_dir.exists():
        return []

    agents: list["AgentConfig"] = []

    for entry in sorted(agents_dir.iterdir()):
        if not entry.is_dir():
            continue
        config_file = entry / "config.yaml"
        if not config_file.exists():
            logger.debug(f"Skipping {entry.name}: no config.yaml")
            continue

        try:
            agent_cfg = _load_agent_config_from_filesystem(
                entry.name, user_id, tenant_id
            )
            agents.append(agent_cfg)
        except Exception as e:
            logger.warning(f"Skipping agent '{entry.name}': {e}")

    return agents
