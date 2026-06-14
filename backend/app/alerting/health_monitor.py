"""Alert source health monitoring.

Push-based alert sources send data only when an incident occurs — absence
of data means everything is healthy, not that the source is offline.
This module logs periodic statistics for operational visibility.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select

logger = logging.getLogger(__name__)


async def check_source_health() -> None:
    """Log health statistics for all active alert sources.

    This does NOT treat "no recent data" as an outage — alert sources are
    push-based and silence is expected during quiet periods.
    """
    from app.models.alerting import AlertSource, RawAlert
    from deerflow.database.session import get_session_factory

    async with get_session_factory()() as session:
        result = await session.exec(
            select(AlertSource).where(AlertSource.status == "active")
        )
        sources = result.scalars().all()

        if not sources:
            return

        total = len(sources)
        with_data = 0
        without_data = 0

        for source in sources:
            last_result = await session.exec(
                select(func.max(RawAlert.received_at)).where(
                    RawAlert.source_id == source.id
                )
            )
            last_ts = last_result.scalar()

            if last_ts is None:
                without_data += 1
            else:
                with_data += 1
                if last_ts.tzinfo is None:
                    last_ts = last_ts.replace(tzinfo=UTC)
                minutes_ago = int(
                    (datetime.now(UTC) - last_ts).total_seconds() / 60
                )
                logger.debug(
                    "health: source %s (%s) last data %d min ago",
                    source.name, source.type, minutes_ago,
                )

        logger.info(
            "health: %d active sources (%d with data, %d never received)",
            total, with_data, without_data,
        )
