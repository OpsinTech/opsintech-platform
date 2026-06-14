"""IM notification for alerting incidents.

Sends incident create/resolve notifications via the existing
channel infrastructure (Feishu, Slack, Telegram).
"""

import asyncio
import logging
from datetime import UTC, datetime

from app.models.alerting import AlertingSettings, Incident

logger = logging.getLogger(__name__)

_NOTIFICATION_DEBOUNCE_SECONDS = 3  # Wait for AI analysis before sending


async def send_incident_created(incident: Incident) -> None:
    """Send incident creation notification to configured IM channels."""
    await asyncio.sleep(_NOTIFICATION_DEBOUNCE_SECONDS)

    settings = await _get_settings(incident.tenant_id)
    if not settings or not _should_notify(settings, incident, "created"):
        return

    text = _build_created_card(incident)
    await _publish(settings, text)


async def send_incident_resolved(incident: Incident, duration_minutes: int) -> None:
    """Send incident resolution notification to configured IM channels."""
    settings = await _get_settings(incident.tenant_id)
    if not settings or not _should_notify(settings, incident, "resolved"):
        return

    # Skip flash-recovery (< 5 minutes)
    if duration_minutes < 5:
        return

    text = _build_resolved_card(incident, duration_minutes)
    await _publish(settings, text)


async def send_daily_digest(tenant_id: str) -> None:
    """Send daily incident summary to configured IM channels."""
    settings = await _get_settings(tenant_id)
    if not settings:
        return

    notify_cfg = settings.notification_config or {}
    digest = notify_cfg.get("digest", {})
    if not digest.get("enabled"):
        return

    text = await _build_digest_card(tenant_id, "daily")
    await _publish(settings, text)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_settings(tenant_id: str) -> AlertingSettings | None:
    from sqlalchemy import select

    from deerflow.database.session import get_session_factory

    async with get_session_factory()() as session:
        result = await session.exec(
            select(AlertingSettings).where(AlertingSettings.tenant_id == tenant_id)
        )
        return result.scalars().first()


def _should_notify(settings: AlertingSettings, incident: Incident, event: str) -> bool:
    cfg = settings.notification_config or {}
    if not cfg.get("enabled"):
        return False

    # Severity filter
    threshold = cfg.get("severity_threshold", "major")
    if _severity_rank(incident.severity) < _severity_rank(threshold):
        return False

    # Event type filter
    if event == "resolved" and not cfg.get("on_resolved"):
        return False

    # Quiet hours (respect tenant timezone)
    qh = cfg.get("quiet_hours", {})
    if qh.get("enabled"):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        tz_name = cfg.get("timezone", "UTC")
        try:
            tz = ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, KeyError):
            tz = ZoneInfo("UTC")
        local_now = datetime.now(UTC).astimezone(tz)
        current = local_now.hour * 60 + local_now.minute
        try:
            sh, sm = map(int, qh["start"].split(":"))
            eh, em = map(int, qh["end"].split(":"))
            qstart = sh * 60 + sm
            qend = eh * 60 + em
            if qstart <= qend:
                in_quiet = qstart <= current < qend
            else:
                in_quiet = current >= qstart or current < qend
            if in_quiet and incident.severity != "critical":
                return False
        except (ValueError, KeyError):
            pass

    return True


def _severity_rank(sev: str) -> int:
    return {"critical": 4, "major": 3, "warning": 2, "minor": 1, "info": 0}.get(sev, 0)


_SEVERITY_COLORS = {
    "critical": ("🔴", "CRITICAL"),
    "major": ("🟠", "MAJOR"),
    "warning": ("🟡", "WARNING"),
    "minor": ("🔵", "MINOR"),
    "info": ("⚪", "INFO"),
}


def _build_created_card(incident: Incident) -> str:
    icon, label = _SEVERITY_COLORS.get(incident.severity, ("⚪", incident.severity.upper()))

    lines = [
        f"{icon} *[{label}] {incident.title or incident.incident_key}*",
        f"*Incident:* `{incident.incident_key}`",
        f"*服务:* {incident.service or '?'}  ·  *环境:* {incident.environment or '?'}  ·  *信号数:* {incident.signal_count}",
    ]

    if incident.ai_summary:
        lines.append(f"")
        lines.append(f"📋 *AI 解读:* {incident.ai_summary[:200]}")

    if incident.owner_team_id:
        lines.append(f"*团队:* {incident.owner_team_id}")

    return "\n".join(lines)


def _build_resolved_card(incident: Incident, duration_minutes: int) -> str:
    dur = f"{duration_minutes} 分钟" if duration_minutes < 60 else f"{duration_minutes // 60} 小时 {duration_minutes % 60} 分钟"
    return (
        f"✅ *已恢复* `{incident.incident_key}`\n"
        f"*服务:* {incident.service or '?'}  ·  *环境:* {incident.environment or '?'}  ·  *持续:* {dur}"
    )


async def _build_digest_card(tenant_id: str, period: str) -> str:
    from sqlalchemy import func, select

    from app.models.alerting import Incident
    from deerflow.database.session import get_session_factory

    async with get_session_factory()() as session:
        # Firing count
        firing_res = await session.exec(
            select(func.count(Incident.id)).where(
                Incident.tenant_id == tenant_id, Incident.status == "firing"
            )
        )
        firing = firing_res.scalar() or 0

        # Today's created
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        created_res = await session.exec(
            select(func.count(Incident.id)).where(
                Incident.tenant_id == tenant_id, Incident.created_at >= today
            )
        )
        created = created_res.scalar() or 0

        # Resolved today
        resolved_res = await session.exec(
            select(func.count(Incident.id)).where(
                Incident.tenant_id == tenant_id,
                Incident.status == "resolved",
                Incident.resolved_at >= today,
            )
        )
        resolved = resolved_res.scalar() or 0

    return (
        f"📊 告警{period} · {today.strftime('%m/%d')}\n"
        f"🔥 进行中: {firing}  ·  ✅ 今日恢复: {resolved}  ·  📋 今日新建: {created}"
    )


async def _publish(settings: AlertingSettings, text: str) -> None:
    """Send a message to all configured channels and log audit trail."""
    import uuid

    from app.models.alerting import IncidentAction

    try:
        from app.channels.message_bus import OutboundMessage
        from app.channels.service import get_channel_service

        service = get_channel_service()
        if not service or not service.bus:
            logger.warning("notify: channel service not available")
            return

        cfg = settings.notification_config or {}
        channel_names = cfg.get("channels", [])
        chat_ids = cfg.get("chat_ids", {})
        selected_chat_ids = cfg.get("selected_chat_ids", {})
        all_sent_to: list[str] = []

        for channel_name in channel_names:
            if channel_name in selected_chat_ids and isinstance(selected_chat_ids[channel_name], list):
                target_chat_ids = selected_chat_ids[channel_name]
            else:
                chat_ids_str = chat_ids.get(channel_name)
                if not chat_ids_str:
                    continue
                target_chat_ids = [cid.strip() for cid in chat_ids_str.split(",") if cid.strip()]

            for chat_id in target_chat_ids:
                all_sent_to.append(f"{channel_name}/{chat_id}")
                msg = OutboundMessage(
                    channel_name=channel_name,
                    chat_id=chat_id,
                    thread_id="",
                    text=text,
                )
                await service.bus.publish_outbound(msg)
                logger.info("notify: sent to %s/%s for tenant=%s", channel_name, chat_id, settings.tenant_id)

        # Audit trail
        from deerflow.database.session import get_session_factory

        async with get_session_factory()() as audit_session:
            audit_action = IncidentAction(
                id=str(uuid.uuid4()),
                tenant_id=settings.tenant_id,
                incident_id="",  # generic notification, not tied to one incident
                actor_id="system",
                action_type="notification_sent",
                action_payload={
                    "sent_to": all_sent_to,
                },
            )
            audit_session.add(audit_action)
            await audit_session.commit()

    except Exception:
        logger.exception("notify: failed to publish notification")


def schedule_notification(coro):
    """Fire-and-forget: schedule a notification coroutine."""
    asyncio.create_task(coro)
