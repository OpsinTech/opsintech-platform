from datetime import UTC, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.alerting import Incident, IncidentSignalLink, Signal, RawAlert, AlertSource, ChangeEvent

def extract_diagnosis_agent_id_from_config(config_json: dict | None) -> str | None:
    """Extract diagnosis_agent_id from AlertSource.config_json."""
    if not config_json:
        return None
    trigger = config_json.get("analysis_trigger", {})
    return trigger.get("diagnosis_agent_id") or None

async def get_diagnosis_agent_id_for_incident(
    session: AsyncSession,
    incident_id: str,
    tenant_id: str,
) -> str | None:
    """Consistently search for diagnosis_agent_id linked to an incident's alert sources."""
    # Find all signals linked to the incident
    links_result = await session.exec(
        select(IncidentSignalLink).where(
            IncidentSignalLink.incident_id == incident_id,
            IncidentSignalLink.tenant_id == tenant_id,
        )
    )
    signal_ids = [l.signal_id for l in links_result.scalars().all()]
    if not signal_ids:
        return None

    # Get signals to trace back to raw alerts
    sigs_result = await session.exec(
        select(Signal).where(
            Signal.id.in_(signal_ids),
            Signal.raw_alert_id.isnot(None),
        )
    )
    raw_alert_ids = list({s.raw_alert_id for s in sigs_result.scalars().all()})
    if not raw_alert_ids:
        return None

    # Get raw alerts to trace back to alert sources
    raw_alerts_result = await session.exec(
        select(RawAlert.source_id).where(
            RawAlert.id.in_(raw_alert_ids),
            RawAlert.source_id.isnot(None),
        )
    )
    source_ids = list({r for r in raw_alerts_result.scalars().all()})
    if not source_ids:
        return None

    # Check alert sources for diagnosis_agent_id
    src_result = await session.exec(
        select(AlertSource).where(
            AlertSource.tenant_id == tenant_id,
            AlertSource.id.in_(source_ids),
        )
    )
    for src in src_result.scalars().all():
        diag_id = extract_diagnosis_agent_id_from_config(src.config_json)
        if diag_id:
            return diag_id

    return None

async def build_incident_diagnosis_prompt(
    session: AsyncSession,
    incident: Incident,
    tenant_id: str,
    agent_system_prompt: str | None = None,
    agent_skills: list[str] | None = None,
    agent_tool_groups: list[str] | None = None,
) -> str:
    """Build a unified, consistent detailed prompt for diagnosing an incident.

    When agent metadata is provided (system_prompt, skills, tool_groups),
    it is included to give the agent clear boundaries on its role and capabilities.
    """
    links_result = await session.exec(
        select(IncidentSignalLink).where(
            IncidentSignalLink.incident_id == incident.id,
            IncidentSignalLink.tenant_id == tenant_id,
        )
    )
    sig_ids = [l.signal_id for l in links_result.scalars().all()]

    signal_summaries = []
    if sig_ids:
        sig_result = await session.exec(select(Signal).where(Signal.id.in_(sig_ids)))
        for s in sig_result.scalars().all():
            labels = s.labels_json or {}
            signal_summaries.append(
                f"- [{s.severity.upper()}] {s.title or 'untitled'} (source={s.source}) labels={labels}"
            )

    # Query similar incidents (same service, last 7 days)
    similar_summaries: list[str] = []
    if incident.service:
        cutoff = datetime.now(UTC) - timedelta(days=7)
        similar_result = await session.exec(
            select(Incident).where(
                Incident.tenant_id == tenant_id,
                Incident.service == incident.service,
                Incident.id != incident.id,
                Incident.created_at >= cutoff,
            ).order_by(Incident.created_at.desc()).limit(5)
        )
        for inc in similar_result.scalars().all():
            similar_summaries.append(
                f"- [{inc.severity.upper()}] {inc.incident_key}: {inc.title or 'untitled'} "
                f"(status={inc.status}, signals={inc.signal_count})"
            )

    # Query recent changes (same service, last 24 hours)
    changes_summaries: list[str] = []
    if incident.service:
        changes_cutoff = datetime.now(UTC) - timedelta(hours=24)
        changes_result = await session.exec(
            select(ChangeEvent).where(
                ChangeEvent.tenant_id == tenant_id,
                ChangeEvent.service == incident.service,
                ChangeEvent.changed_at >= changes_cutoff,
            ).order_by(ChangeEvent.changed_at.desc()).limit(5)
        )
        for ch in changes_result.scalars().all():
            changes_summaries.append(
                f"- [{ch.change_type.upper()}] {ch.summary or 'no summary'} "
                f"(by={ch.changed_by or 'unknown'}, at={ch.changed_at.isoformat() if ch.changed_at else '?'})"
            )

    prompt = f"""## Incident Diagnosis Request

### Agent Role
You are acting as a diagnostic agent with the following configuration:
"""
    
    if agent_system_prompt:
        prompt += f"- **System Prompt**: {agent_system_prompt[:500]}\n"
    if agent_skills:
        prompt += f"- **Bound Skills**: {', '.join(agent_skills)}\n"
    if agent_tool_groups:
        prompt += f"- **Available Tool Groups**: {', '.join(agent_tool_groups)}\n"
        prompt += "- **Important**: Only use tools from the above groups. If a tool is not available, ask the user to provide the needed information.\n"
    
    prompt += f"""
### Incident Details
**Incident Key**: {incident.incident_key}
**Title**: {incident.title or 'N/A'}
**Severity**: {incident.severity}
**Service**: {incident.service or 'Unknown'}
**Environment**: {incident.environment or 'Unknown'}
**Signal Count**: {incident.signal_count}

### Associated Signals
{"\n".join(signal_summaries) if signal_summaries else '(none)'}

### Similar Recent Incidents (same service, last 7 days)
{"\n".join(similar_summaries) if similar_summaries else '(none)'}

### Recent Changes (same service, last 24 hours)
{"\n".join(changes_summaries) if changes_summaries else '(none)'}

Please diagnose this incident. Analyze the signals, identify the likely root cause, assess the impact, and recommend actionable next steps."""
    return prompt
