"""Incident manager — signal aggregation and incident lifecycle.

System defaults (zero-config, always active):
  - Grouping: service + environment
  - Time window: 30 minutes
  - Dedup: SHA-256 fingerprint (source|service|env|severity|labels)

User rules override: when an aggregation_config is provided, its group_by
and window_minutes replace the system defaults.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerting.dedup import compute_fingerprint
from app.models.alerting import (
    Incident,
    IncidentAction,
    IncidentSignalLink,
    RawAlert,
    Signal,
)

# Time window (minutes) within which signals with the same correlation key
# are merged into the same incident.
DEFAULT_CORRELATION_WINDOW_MINUTES = 30


async def create_signal(
    session: AsyncSession,
    raw_alert: RawAlert,
    signal_data: Signal,
) -> Signal:
    """Persist a signal linked to its raw alert, with fingerprint computed."""
    fingerprint = compute_fingerprint(
        source=signal_data.source or "",
        service=signal_data.service or "",
        environment=signal_data.environment or "",
        severity=signal_data.severity,
        labels=signal_data.labels_json,
    )
    signal_data.id = str(uuid.uuid4())
    signal_data.fingerprint = fingerprint
    signal_data.correlation_key = signal_data.correlation_key or fingerprint
    session.add(signal_data)
    return signal_data


async def find_or_create_incident(
    session: AsyncSession,
    signal: Signal,
    raw_alert: RawAlert,
    window_minutes: int = DEFAULT_CORRELATION_WINDOW_MINUTES,
    aggregation_config: dict | None = None,
) -> tuple[Incident, bool]:
    """Find an existing incident to merge into, or create a new one.

    When *aggregation_config* is provided, its ``group_by`` list
    overrides the default service+environment grouping.

    Returns:
        (incident, is_new) — True if a new incident was created.
    """
    existing = await _find_active_incident(session, signal, window_minutes, aggregation_config)
    if existing:
        await _append_signal_to_incident(session, existing, signal)
        return existing, False

    incident = await _create_incident(session, signal, raw_alert)
    return incident, True


async def _find_active_incident(
    session: AsyncSession,
    signal: Signal,
    window_minutes: int,
    aggregation_config: dict | None = None,
) -> Incident | None:
    """Find the most recent active incident matching this signal's group keys.

    Default grouping: service + environment.
    When aggregation_config.group_by is set, those fields are used instead.
    The rule's window_minutes overrides the default when provided.
    """
    group_by = (aggregation_config or {}).get("group_by", ["service", "environment"])
    if aggregation_config:
        window_minutes = aggregation_config.get("window_minutes", window_minutes)

    cutoff = datetime.now(UTC) - timedelta(minutes=window_minutes)

    conditions = [
        Incident.tenant_id == signal.tenant_id,
        Incident.status == "firing",
        Incident.last_seen_at >= cutoff,
    ]

    for field_name in group_by:
        signal_value = _get_signal_field(signal, field_name)
        if signal_value is None:
            continue
        col = getattr(Incident, field_name, None)
        if col is not None:
            conditions.append(col == signal_value)
        elif "." in field_name:
            # labels.xxx — filter via linked signals' JSON labels
            parts = field_name.split(".")
            if parts[0] == "labels" and len(parts) >= 2:
                label_key = parts[1]
                subq = (
                    select(IncidentSignalLink.id)
                    .join(Signal, IncidentSignalLink.signal_id == Signal.id)
                    .where(
                        IncidentSignalLink.incident_id == Incident.id,
                        func.json_extract(Signal.labels_json, f"$.{label_key}") == str(signal_value),
                    )
                )
                conditions.append(exists(subq))

    result = await session.exec(
        select(Incident)
        .where(*conditions)
        .order_by(Incident.last_seen_at.desc())
        .limit(1)
    )
    return result.scalars().first()


def _get_signal_field(signal: Signal, field_name: str):
    """Get a field value from a signal, supporting dotted paths into labels."""
    if "." in field_name:
        parts = field_name.split(".")
        current = signal.labels_json or {}
        for p in parts[1:]:  # skip "labels" prefix
            if isinstance(current, dict):
                current = current.get(p)
            else:
                return None
        return current
    return getattr(signal, field_name, None)


async def _append_signal_to_incident(
    session: AsyncSession,
    incident: Incident,
    signal: Signal,
) -> None:
    """Link a signal to an existing incident and update counters.

    When a resolved signal arrives, the incident is resolved.  Subsequent
    firing signals for the same grouping will create a new incident.
    """
    link = IncidentSignalLink(
        id=str(uuid.uuid4()),
        tenant_id=incident.tenant_id,
        incident_id=incident.id,
        signal_id=signal.id,
    )
    session.add(link)

    incident.signal_count = (incident.signal_count or 0) + 1
    incident.last_seen_at = datetime.now(UTC)

    # Severity escalation only
    if signal.severity == "critical" and incident.severity != "critical":
        incident.severity = "critical"
    elif signal.severity == "major" and incident.severity not in ("critical",):
        incident.severity = "major"

    # Auto-resolve: when a resolved signal arrives, close the incident
    if signal.status == "resolved":
        now = datetime.now(UTC)
        incident.status = "resolved"
        incident.resolved_at = now
        action = IncidentAction(
            id=str(uuid.uuid4()),
            tenant_id=incident.tenant_id,
            incident_id=incident.id,
            actor_id="system",
            action_type="resolved",
            action_payload={"resolved_by_signal": signal.id, "resolved_at": now.isoformat()},
        )
        session.add(action)

        # Schedule IM notification for resolved incident
        try:
            fs = incident.first_seen_at
            if fs:
                # Ensure timezone-aware for subtraction
                if fs.tzinfo is None:
                    fs = fs.replace(tzinfo=UTC)
                duration_minutes = int((now - fs).total_seconds() / 60)
            else:
                duration_minutes = 0

            from app.alerting.notify import schedule_notification, send_incident_resolved

            schedule_notification(send_incident_resolved(incident, duration_minutes))
        except Exception:
            logger.exception("Failed to schedule resolved notification for incident=%s", incident.incident_key)

    session.add(incident)


async def _create_incident(
    session: AsyncSession,
    signal: Signal,
    raw_alert: RawAlert,
) -> Incident:
    """Create a new incident from a signal."""
    now = datetime.now(UTC)
    initial_status = "resolved" if signal.status == "resolved" else "firing"
    incident = Incident(
        id=str(uuid.uuid4()),
        tenant_id=signal.tenant_id,
        incident_key=f"INC-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        title=signal.title,
        summary=signal.summary,
        severity=signal.severity,
        priority=_default_priority(signal.severity),
        status=initial_status,
        service=signal.service,
        environment=signal.environment,
        owner_team_id=_extract_team(signal),
        signal_count=1,
        first_seen_at=signal.occurred_at or now,
        last_seen_at=now,
        resolved_at=now if initial_status == "resolved" else None,
    )
    session.add(incident)

    link = IncidentSignalLink(
        id=str(uuid.uuid4()),
        tenant_id=signal.tenant_id,
        incident_id=incident.id,
        signal_id=signal.id,
    )
    session.add(link)

    action = IncidentAction(
        id=str(uuid.uuid4()),
        tenant_id=signal.tenant_id,
        incident_id=incident.id,
        actor_id="system",
        action_type="created",
        action_payload={"source": signal.source, "severity": signal.severity},
    )
    session.add(action)

    return incident


def _default_priority(severity: str) -> str:
    """Map severity to a default priority."""
    mapping = {
        "critical": "p1",
        "major": "p2",
        "warning": "p3",
        "minor": "p4",
        "info": "p4",
    }
    return mapping.get(severity, "p3")


def _extract_team(signal: Signal) -> str | None:
    """Auto-detect responsible team from signal labels.

    Checks labels for common team keys: team, owner, squad, group.
    """
    labels = signal.labels_json or {}
    for key in ("team", "owner", "squad", "group"):
        val = labels.get(key)
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    return None


async def resolve_incident(session: AsyncSession, incident: Incident) -> None:
    """Mark an incident as resolved."""
    now = datetime.now(UTC)
    incident.status = "resolved"
    incident.resolved_at = now
    session.add(incident)

    action = IncidentAction(
        id=str(uuid.uuid4()),
        tenant_id=incident.tenant_id,
        incident_id=incident.id,
        actor_id="system",
        action_type="resolved",
        action_payload={"resolved_at": now.isoformat()},
    )
    session.add(action)

    # Schedule IM notification (same as auto-resolve)
    try:
        fs = incident.first_seen_at
        if fs:
            if fs.tzinfo is None:
                fs = fs.replace(tzinfo=UTC)
            duration_minutes = int((now - fs).total_seconds() / 60)
        else:
            duration_minutes = 0

        from app.alerting.notify import schedule_notification, send_incident_resolved

        schedule_notification(send_incident_resolved(incident, duration_minutes))
    except Exception:
        logger.exception("Failed to schedule resolved notification")
    session.add(action)


async def suppress_incident(session: AsyncSession, incident: Incident, actor_id: str) -> None:
    """Suppress an incident (mark as noise)."""
    incident.status = "suppressed"
    incident.suppressed = True
    session.add(incident)

    action = IncidentAction(
        id=str(uuid.uuid4()),
        tenant_id=incident.tenant_id,
        incident_id=incident.id,
        actor_id=actor_id,
        action_type="suppressed",
        action_payload={},
    )
    session.add(action)
