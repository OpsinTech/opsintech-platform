import asyncio
import concurrent.futures
import logging
import uuid

from langchain_core.messages import ToolMessage
from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime
from langgraph.types import Command

from deerflow.config.paths import get_paths
from deerflow.database.session import get_session_factory

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from sync code, handling both event-loop and no-loop cases."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(asyncio.run, coro).result()


def _create_agent_in_db(
    agent_name: str,
    soul: str,
    description: str,
    user_id: str,
    tenant_id: str | None,
) -> None:
    """Create a custom agent row in the database."""
    from app.models.agents import CustomAgent

    async def _do_create():
        session_factory = get_session_factory()
        async with session_factory() as session:
            agent = CustomAgent(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                user_id=user_id,
                name=agent_name,
                description=description,
                system_prompt=soul,
                enabled=True,
                created_by=user_id,
            )
            session.add(agent)
            await session.commit()

    _run_async(_do_create())


@tool
def setup_agent(
    soul: str,
    description: str,
    runtime: ToolRuntime,
) -> Command:
    """Setup the custom DeerFlow agent.

    Args:
        soul: Full SOUL.md content defining the agent's personality and behavior.
        description: One-line description of what the agent does.
    """

    agent_name: str | None = runtime.context.get("agent_name") if runtime.context else None
    user_id: str | None = runtime.context.get("user_id") if runtime.context else None
    tenant_id: str | None = runtime.context.get("tenant_id") if runtime.context else None

    try:
        if agent_name:
            # Custom agent — write to DB
            _create_agent_in_db(
                agent_name=agent_name,
                soul=soul,
                description=description,
                user_id=user_id,
                tenant_id=tenant_id,
            )
            logger.info(f"[agent_creator] Created custom agent '{agent_name}' in DB (user={user_id})")
        else:
            # Default agent — write global SOUL.md (filesystem remains for default)
            paths = get_paths()
            soul_file = paths.base_dir / "SOUL.md"
            soul_file.parent.mkdir(parents=True, exist_ok=True)
            soul_file.write_text(soul, encoding="utf-8")
            logger.info(f"[agent_creator] Updated global SOUL.md at {soul_file}")

        return Command(
            update={
                "created_agent_name": agent_name,
                "messages": [
                    ToolMessage(
                        content=f"Agent '{agent_name}' created successfully!",
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    except Exception as e:
        logger.error(f"[agent_creator] Failed to create agent '{agent_name}': {e}", exc_info=True)
        return Command(
            update={
                "messages": [
                    ToolMessage(content=f"Error: {e}", tool_call_id=runtime.tool_call_id)
                ]
            }
        )
