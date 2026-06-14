"""Alert ingest pipeline — the entry point for external alerts.

Orchestrates:
1. Receive raw payload → parse via provider → raw_alert
2. Normalise → signal
3. Evaluate user rules (priority: suppression > aggregation > system default)

Rule priority model (user rules override system defaults):
  - No user rules match → system default (auto fingerprint dedup, service+env aggregation, 30min window)
  - Suppression rule matches → alert is silenced, no incident created
  - Aggregation rule matches → user's group_by + window_minutes override system defaults
  - Multiple rules of same type match → first match wins
"""

import logging
import os
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerting.ai_analysis import schedule_analysis, should_auto_analyze
from app.alerting.dedup import compute_payload_hash
from app.alerting.incident_manager import create_signal, find_or_create_incident
from app.alerting.providers import get_provider
from app.alerting.rule_engine import evaluate_rules, get_aggregation_config
from app.models.alerting import AlertRule, AlertSource, Incident, IncidentSignalLink, RawAlert, Signal

logger = logging.getLogger(__name__)

# Duplicate payloads arriving within this window are treated as idempotent retries
_IDEMPOTENCY_WINDOW_MINUTES = 5


async def process_alert(
    session: AsyncSession,
    source: AlertSource,
    body: dict,
    headers: dict,
) -> tuple[Incident | None, bool, str]:
    """Run the full ingest pipeline for a single alert payload.

    Args:
        session: DB session.
        source: The configured alert source.
        body: Parsed JSON body of the incoming request.
        headers: Request headers.

    Returns:
        (incident, is_new, disposition) —
        * ``disposition`` is one of ``"created"``, ``"merged"``, ``"suppressed"``, ``"duplicate"``.
        * When suppressed, ``incident`` is None.
    """
    provider = get_provider(source.type)
    if provider is None:
        raise ValueError(f"No provider registered for type '{source.type}'")

    # Validate auth
    if not provider.validate_auth(headers, source.config_json):
        raise PermissionError("Authentication failed for alert source")

    payload_hash = compute_payload_hash(body)

    # Idempotency check — same payload from same source within window = duplicate
    cutoff = datetime.now(UTC) - timedelta(minutes=_IDEMPOTENCY_WINDOW_MINUTES)
    dup_result = await session.exec(
        select(RawAlert).where(
            RawAlert.tenant_id == source.tenant_id,
            RawAlert.source_id == source.id,
            RawAlert.payload_hash == payload_hash,
            RawAlert.received_at >= cutoff,
        ).limit(1)
    )
    existing_raw = dup_result.scalars().first()
    if existing_raw is not None:
        # Resolve the linked incident to return consistent response
        sig_result = await session.exec(
            select(Signal).where(Signal.raw_alert_id == existing_raw.id).limit(1)
        )
        existing_signal = sig_result.scalars().first()
        incident = None
        if existing_signal is not None:
            link_result = await session.exec(
                select(IncidentSignalLink).where(
                    IncidentSignalLink.signal_id == existing_signal.id,
                    IncidentSignalLink.tenant_id == source.tenant_id,
                ).limit(1)
            )
            link = link_result.scalars().first()
            if link is not None:
                incident = await session.get(Incident, link.incident_id)

        logger.info("ingest source=%s duplicate payload hash=%s", source.id, payload_hash[:16])
        return incident, False, "duplicate"

    # Step 1 — raw_alert
    raw_alert = provider.parse_raw_payload(body, headers)
    raw_alert.id = str(uuid.uuid4())
    raw_alert.tenant_id = source.tenant_id
    raw_alert.source_id = source.id
    raw_alert.payload_hash = payload_hash
    raw_alert.ingest_status = "received"
    session.add(raw_alert)

    # Step 2 — normalise to signal
    signal = provider.normalize(raw_alert, source_config=source.config_json)
    signal.tenant_id = source.tenant_id
    signal.raw_alert_id = raw_alert.id  # defensive: ensure link is always populated
    await create_signal(session, raw_alert, signal)
    raw_alert.ingest_status = "normalized"
    session.add(raw_alert)

    # Step 2.5 — load active user-defined rules for this tenant
    rules_result = await session.exec(
        select(AlertRule).where(
            AlertRule.tenant_id == source.tenant_id,
            AlertRule.enabled == True,  # noqa: E712
        )
    )
    active_rules = list(rules_result.scalars().all())

    # Step 2.6 — evaluate rules (user overrides > system defaults)
    # Priority: suppression first, then aggregation for grouping config
    matched = evaluate_rules(active_rules, signal)

    # Check suppression rules (first match wins)
    for r in matched:
        if r.rule_type == "suppression":
            raw_alert.ingest_status = "suppressed"
            raw_alert.error_message = f"Suppressed by rule: {r.name}"
            session.add(raw_alert)
            await session.commit()
            logger.info("ingest source=%s suppressed by rule=%s", source.id, r.name)
            return None, False, "suppressed"

    # Get aggregation override from user rules (None = use system defaults)
    aggregation_config = get_aggregation_config(matched)
    if aggregation_config:
        logger.debug("ingest using user aggregation rule: group_by=%s window=%s",
                      aggregation_config.get("group_by"), aggregation_config.get("window_minutes"))

    incident, is_new = await find_or_create_incident(
        session, signal, raw_alert, aggregation_config=aggregation_config,
    )

    await session.commit()

    disposition = "created" if is_new else "merged"

    # Trigger AI analysis + IM notification for newly created incidents (fire-and-forget)
    if is_new:
        if should_auto_analyze(source.config_json, signal.severity):
            signals_data = [{
                "title": signal.title,
                "severity": signal.severity,
                "source": signal.source,
                "fingerprint": signal.fingerprint,
                "labels_json": signal.labels_json,
            }]
            trigger = (source.config_json or {}).get("analysis_trigger", {})
            model_name = trigger.get("model") or None
            schedule_analysis(incident, signals_data, body, model_name)

            # Auto-trigger agent diagnosis if source has a bound agent
            diagnosis_agent_id = trigger.get("diagnosis_agent_id")
            if diagnosis_agent_id:
                _schedule_agent_diagnosis(incident, source.tenant_id, diagnosis_agent_id)

        # Schedule IM notification (delayed, waits for AI)
        from app.alerting.notify import send_incident_created, schedule_notification

        schedule_notification(send_incident_created(incident))

    logger.info(
        "ingest source=%s type=%s incident=%s disposition=%s",
        source.id,
        source.type,
        incident.incident_key,
        disposition,
    )
    return incident, is_new, disposition


def _schedule_agent_diagnosis(incident, tenant_id: str, diagnosis_agent_id: str):
    """Fire-and-forget: trigger agent diagnosis for a newly created incident."""
    import asyncio

    from deerflow.database.session import get_session_factory

    async def _run():
        try:
            from app.models.agents import CustomAgent
            from app.alerting.diagnosis_helper import build_incident_diagnosis_prompt
            from langgraph_sdk import get_client
            from sqlmodel import select

            async with get_session_factory()() as session:
                # Set status to running immediately
                fresh_inc = await session.get(Incident, incident.id)
                if fresh_inc:
                    fresh_inc.diagnosis_status = "running"
                    session.add(fresh_inc)
                    await session.commit()

                agent_result = await session.exec(
                    select(CustomAgent).where(CustomAgent.id == diagnosis_agent_id)
                )
                agent = agent_result.scalars().first()
                if agent is None:
                    logger.warning("diagnose: agent %s not found for incident %s", diagnosis_agent_id, incident.incident_key)
                    async with get_session_factory()() as err_session:
                        fresh = await err_session.get(Incident, incident.id)
                        if fresh:
                            fresh.diagnosis_status = "failed"
                            err_session.add(fresh)
                            await err_session.commit()
                    return

                # Build diagnosis prompt with incident context using helper
                prompt = await build_incident_diagnosis_prompt(
                    session, incident, tenant_id,
                    agent_system_prompt=agent.system_prompt,
                    agent_skills=agent.skills,
                    agent_tool_groups=agent.tool_groups,
                )

                langgraph_url = os.getenv("LANGGRAPH_API_URL", "http://localhost:2024")
                client = get_client(url=langgraph_url)
                thread = await client.threads.create(metadata={
                    "incident_id": incident.id,
                    "tenant_id": tenant_id,
                })
                thread_id = thread["thread_id"]

                result = await client.runs.wait(
                    thread_id,
                    "lead_agent",
                    input={"messages": [{"role": "human", "content": prompt}]},
                    config={
                        "recursion_limit": 500,
                    },
                    context={
                        "agent_name": agent.name,
                        "tenant_id": tenant_id,
                        "user_id": agent.user_id,
                        "thread_id": thread_id,
                    },
                )

                # Extract the last AI response text from the result
                diagnosis_text = ""
                if isinstance(result, dict):
                    messages = result.get("messages", [])
                    for msg in reversed(messages):
                        if isinstance(msg, dict) and msg.get("type") == "ai":
                            content = msg.get("content", "")
                            if isinstance(content, str):
                                diagnosis_text = content
                            elif isinstance(content, list):
                                diagnosis_text = "".join(
                                    c.get("text", "") if isinstance(c, dict) else str(c)
                                    for c in content
                                )
                            if diagnosis_text:
                                break

                # Store linkage, result, and completed status
                fresh = await session.get(Incident, incident.id)
                if fresh:
                    fresh.agent_id = diagnosis_agent_id
                    fresh.thread_id = thread_id
                    fresh.diagnosis_status = "completed"
                    fresh.diagnosis_result = diagnosis_text or None
                    fresh.diagnosis_error = None
                    session.add(fresh)
                    await session.commit()

                logger.info("diagnose: auto-completed for incident=%s agent=%s", incident.incident_key, agent.name)

        except Exception:
            logger.exception("diagnose: auto-failed for incident=%s", incident.incident_key)
            try:
                async with get_session_factory()() as err_session:
                    fresh = await err_session.get(Incident, incident.id)
                    if fresh:
                        fresh.diagnosis_status = "failed"
                        fresh.diagnosis_error = "自动诊断执行失败，请手动发起深度诊断"
                        err_session.add(fresh)
                        await err_session.commit()
            except Exception:
                logger.exception("diagnose: failed to save failure status for incident=%s", incident.incident_key)

    asyncio.create_task(_run())
    logger.info("diagnose: auto-scheduled for incident=%s agent=%s", incident.incident_key, diagnosis_agent_id)
