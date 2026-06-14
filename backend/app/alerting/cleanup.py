"""Periodic cleanup of old raw_alerts, signals, and links — per-tenant retention.

Cleans up:
  - raw_alerts older than retention (30 days default, 1-365 configurable)
  - signals and incident_signal_links from the same period

Incidents are preserved — they are the aggregated user-facing records.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alerting import AlertingSettings, IncidentSignalLink, RawAlert, Signal

logger = logging.getLogger(__name__)

_DEFAULT_DAYS = 30
_MIN_DAYS = 1
_MAX_DAYS = 365


def clamp_retention_days(days: int) -> int:
    if days < _MIN_DAYS:
        return _MIN_DAYS
    if days > _MAX_DAYS:
        return _MAX_DAYS
    return days


async def get_retention_days(session: AsyncSession, tenant_id: str) -> int:
    """Read the retention setting for a tenant, falling back to default."""
    result = await session.exec(
        select(AlertingSettings).where(AlertingSettings.tenant_id == tenant_id)
    )
    settings = result.scalars().first()
    if settings is None:
        return _DEFAULT_DAYS
    return clamp_retention_days(settings.raw_alert_retention_days)


async def cleanup_raw_alerts(session: AsyncSession) -> int:
    """Delete expired raw_alerts, signals, and links per-tenant.

    Returns the total number of deleted rows.
    """
    total_deleted = 0

    # Collect per-tenant retention configs
    settings_result = await session.exec(select(AlertingSettings))
    tenant_retention: dict[str, int] = {
        s.tenant_id: clamp_retention_days(s.raw_alert_retention_days)
        for s in settings_result.scalars().all()
    }

    # Clean known tenants with their configured retention
    for tenant_id, days in tenant_retention.items():
        cutoff = datetime.now(UTC) - timedelta(days=days)
        total_deleted += await _cleanup_tenant(session, tenant_id, cutoff, days)

    # Clean remaining tenants (no explicit settings) with default retention
    cutoff = datetime.now(UTC) - timedelta(days=_DEFAULT_DAYS)
    skip = set(tenant_retention.keys())
    raw_result = await session.exec(
        select(RawAlert.tenant_id).where(RawAlert.received_at < cutoff).distinct()
    )
    default_tenants = [t for t in raw_result.scalars().all() if t not in skip]
    for tenant_id in default_tenants:
        total_deleted += await _cleanup_tenant(session, tenant_id, cutoff, _DEFAULT_DAYS)

    if total_deleted > 0:
        await session.commit()
    return total_deleted


async def _cleanup_tenant(
    session: AsyncSession, tenant_id: str, cutoff: datetime, days: int,
) -> int:
    """Delete expired data for a single tenant."""
    deleted = 0

    # 1. Find stale signal IDs
    sig_result = await session.exec(
        select(Signal.id).where(
            Signal.tenant_id == tenant_id,
            Signal.created_at < cutoff,
        )
    )
    stale_signal_ids = list(sig_result.scalars().all())

    # 2. Delete incident_signal_links for stale signals
    if stale_signal_ids:
        link_result = await session.exec(
            delete(IncidentSignalLink).where(
                IncidentSignalLink.tenant_id == tenant_id,
                IncidentSignalLink.signal_id.in_(stale_signal_ids),
            )
        )
        deleted += link_result.rowcount or 0

        # 3. Delete stale signals
        sig_del = await session.exec(
            delete(Signal).where(Signal.id.in_(stale_signal_ids))
        )
        deleted += sig_del.rowcount or 0

    # 4. Delete raw_alerts past cutoff
    raw_result = await session.exec(
        delete(RawAlert).where(
            RawAlert.tenant_id == tenant_id,
            RawAlert.received_at < cutoff,
        )
    )
    raw_deleted = raw_result.rowcount or 0
    deleted += raw_deleted

    if deleted:
        logger.info(
            "cleanup tenant=%s retention=%dd: %d raw_alerts, %d signals, %d links",
            tenant_id, days, raw_deleted, len(stale_signal_ids), deleted - raw_deleted - len(stale_signal_ids),
        )
    return deleted
