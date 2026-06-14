"""Synchronous store for subagent run records.

Used by SubagentExecutor which runs in ThreadPoolExecutor threads.
Writes are best-effort (never raise) to avoid affecting the agent execution flow.
"""

import logging
from datetime import datetime

from sqlalchemy import create_engine
from sqlmodel import Session

from deerflow.database.models import SubagentRun

logger = logging.getLogger(__name__)

_engine = None


def _to_sync_db_url(db_url: str) -> str:
    normalized = db_url.strip()
    if normalized.startswith("sqlite+aiosqlite://"):
        return normalized.replace("sqlite+aiosqlite://", "sqlite+pysqlite://", 1)
    if normalized.startswith("postgresql+asyncpg://"):
        return normalized.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    return normalized


def _get_sync_engine():
    global _engine
    if _engine is None:
        from deerflow.config.app_config import AppConfig

        try:
            db_url = _to_sync_db_url(AppConfig.from_file().database.url)
            _engine = create_engine(db_url, future=True, pool_pre_ping=True)
        except Exception:
            logger.exception("Failed to create sync engine for subagent store")
            return None
    return _engine


def persist_subagent_run(
    task_id: str,
    thread_id: str = "",
    tenant_id: str | None = None,
    user_id: str | None = None,
    subagent_type: str = "",
    description: str | None = None,
    prompt: str | None = None,
    status: str = "pending",
    result: str | None = None,
    error: str | None = None,
    timeout_seconds: int = 900,
    max_turns: int | None = None,
    trace_id: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> None:
    engine = _get_sync_engine()
    if engine is None:
        logger.warning("No sync engine available, skipping DB persist for task %s", task_id)
        return

    try:
        with Session(engine) as session:
            existing = session.get(SubagentRun, task_id)
            if existing:
                existing.status = status
                existing.result = result
                existing.error = error
                existing.started_at = started_at
                existing.completed_at = completed_at
                if description:
                    existing.description = description
                existing.updated_at = datetime.now()
            else:
                record = SubagentRun(
                    id=task_id,
                    thread_id=thread_id,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    subagent_type=subagent_type,
                    description=description or "",
                    prompt=prompt,
                    status=status,
                    result=result,
                    error=error,
                    timeout_seconds=timeout_seconds,
                    max_turns=max_turns,
                    trace_id=trace_id,
                    started_at=started_at,
                    completed_at=completed_at,
                )
                session.add(record)
            session.commit()
    except Exception:
        logger.exception("Failed to persist subagent run %s to DB", task_id)
