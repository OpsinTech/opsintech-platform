"""Backfill script: migrate filesystem agents (config.yaml + SOUL.md) to DB.

Usage:
    cd backend
    .venv/bin/python -m scripts.backfill_agents_to_db

The script is idempotent — running it multiple times is safe.
"""

import asyncio
import logging
import uuid
from pathlib import Path

import yaml

from deerflow.config.agents_config import SOUL_FILENAME
from deerflow.config.paths import get_paths
from deerflow.database.session import get_session_factory

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def _scan_filesystem_agents():
    """Scan all known locations for filesystem-based agent directories.

    Returns a list of (agent_dir, agent_name, user_id, tenant_id) tuples.
    """
    paths = get_paths()
    agents_dir = paths.agents_dir()  # global agents dir
    found = []

    # Scan global agents dir
    if agents_dir.exists():
        for entry in agents_dir.iterdir():
            if entry.is_dir() and (entry / "config.yaml").exists():
                found.append((entry, entry.name, None, None))

    # Scan user-scoped agents dirs under base_dir/users/
    users_root = paths.base_dir / "users"
    if users_root.exists():
        for user_entry in users_root.iterdir():
            if not user_entry.is_dir():
                continue
            uid = user_entry.name
            user_agents = user_entry / "agents"
            if user_agents.exists():
                for agent_entry in user_agents.iterdir():
                    if agent_entry.is_dir() and (agent_entry / "config.yaml").exists():
                        found.append((agent_entry, agent_entry.name, uid, None))

    # Scan tenant-scoped user agents dirs under base_dir/tenants/
    tenants_root = paths.base_dir / "tenants"
    if tenants_root.exists():
        for tenant_entry in tenants_root.iterdir():
            if not tenant_entry.is_dir():
                continue
            tid = tenant_entry.name
            tenant_users = tenant_entry / "users"
            if tenant_users.exists():
                for user_entry in tenant_users.iterdir():
                    if not user_entry.is_dir():
                        continue
                    uid = user_entry.name
                    user_agents = user_entry / "agents"
                    if user_agents.exists():
                        for agent_entry in user_agents.iterdir():
                            if agent_entry.is_dir() and (agent_entry / "config.yaml").exists():
                                found.append((agent_entry, agent_entry.name, uid, tid))

    return found


async def _backfill():
    """Main backfill logic."""
    from app.models.agents import CustomAgent

    from sqlmodel import select

    session_factory = get_session_factory()
    found = _scan_filesystem_agents()
    logger.info(f"Found {len(found)} filesystem agent(s) to migrate.")

    inserted = 0
    skipped = 0
    errors = 0

    async with session_factory() as session:
        for agent_dir, name, user_id, tenant_id in found:
            # Read config.yaml
            config_file = agent_dir / "config.yaml"
            try:
                with open(config_file, encoding="utf-8") as f:
                    config_data = yaml.safe_load(f) or {}
            except Exception as e:
                logger.error(f"Failed to parse {config_file}: {e}")
                errors += 1
                continue

            # Read SOUL.md
            soul_file = agent_dir / SOUL_FILENAME
            system_prompt = ""
            if soul_file.exists():
                system_prompt = soul_file.read_text(encoding="utf-8").strip()

            description = config_data.get("description", "")
            model = config_data.get("model")
            tool_groups = config_data.get("tool_groups", [])

            # Check if already exists
            stmt = select(CustomAgent).where(
                CustomAgent.tenant_id == tenant_id,
                CustomAgent.user_id == user_id,
                CustomAgent.name == name,
            )
            result = await session.exec(stmt)
            existing = result.scalars().first()
            if existing is not None:
                logger.debug(f"Agent '{name}' (user={user_id}, tenant={tenant_id}) already in DB — skipping.")
                skipped += 1
                continue

            agent = CustomAgent(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                user_id=user_id or "",
                name=name,
                description=description or "",
                model=model,
                tool_groups=tool_groups or [],
                system_prompt=system_prompt,
                skills=[],
                tags=[],
                enabled=True,
                created_by=user_id,
            )
            session.add(agent)
            inserted += 1
            logger.info(f"Migrated agent '{name}' (user={user_id}, tenant={tenant_id})")

        await session.commit()

    logger.info(f"Backfill complete: {inserted} inserted, {skipped} skipped, {errors} errors.")


def main():
    asyncio.run(_backfill())


if __name__ == "__main__":
    main()
