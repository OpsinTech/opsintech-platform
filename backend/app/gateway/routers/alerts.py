"""Alerting API routes — ingest, incident list/detail, source management."""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select as sm_select

from app.alerting.ai_analysis import DEFAULT_AUTO_SEVERITIES
from app.alerting.ingest import process_alert
from app.alerting.incident_manager import suppress_incident
from app.gateway.authorization import require_tenant_context, require_tenant_admin
from app.models.alerting import AlertRule, AlertingSettings, AlertSource, ChangeEvent, Incident, IncidentSignalLink, RawAlert, Signal
from deerflow.database.session import get_session, get_session_factory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["alerting"])

# Global manager for ongoing background diagnostic tasks
class DiagnosisTaskManager:
    def __init__(self):
        import asyncio
        self._tasks = {}         # incident_id -> asyncio.Task
        self._queues = {}        # incident_id -> Set[asyncio.Queue]
        self._stream_states = {} # incident_id -> StreamState
        self._thread_ids = {}    # incident_id -> str
        self._agent_names = {}   # incident_id -> str

    def get_thread_id(self, incident_id: str) -> str | None:
        return self._thread_ids.get(incident_id)

    def get_agent_name(self, incident_id: str) -> str | None:
        return self._agent_names.get(incident_id)

    def is_running(self, incident_id: str) -> bool:
        task = self._tasks.get(incident_id)
        return task is not None and not task.done()

    def get_stream_state(self, incident_id: str):
        return self._stream_states.get(incident_id)

    def register_queue(self, incident_id: str, queue):
        self._queues.setdefault(incident_id, set()).add(queue)

    def unregister_queue(self, incident_id: str, queue):
        if incident_id in self._queues:
            self._queues[incident_id].discard(queue)
            if not self._queues[incident_id]:
                del self._queues[incident_id]

    def broadcast(self, incident_id: str, message: str):
        if incident_id in self._queues:
            for q in self._queues[incident_id]:
                q.put_nowait(message)

    def start_task(self, incident_id: str, coro):
        import asyncio
        if incident_id in self._tasks:
            self._tasks[incident_id].cancel()
        
        task = asyncio.create_task(coro)
        self._tasks[incident_id] = task

        def _cleanup(t):
            if incident_id in self._tasks and self._tasks[incident_id] == t:
                del self._tasks[incident_id]
        
        task.add_done_callback(_cleanup)

    def cancel_task(self, incident_id: str):
        if incident_id in self._tasks:
            self._tasks[incident_id].cancel()

diagnosis_task_manager = DiagnosisTaskManager()

# ---------------------------------------------------------------------------
# Ingest (unauthenticated — source-level token auth in provider)
# ---------------------------------------------------------------------------


class IngestResponse(BaseModel):
    """Response returned after successful alert ingestion."""

    ingest_id: str | None = None
    incident_key: str | None = None
    is_new_incident: bool = False
    disposition: str = "created"  # "created", "merged", "suppressed"


@router.post(
    "/alerts/ingest/{source_id}",
    response_model=IngestResponse,
    status_code=202,
    summary="Ingest alert (generic)",
    description="Receive an alert from a configured source. The provider "
    "is determined by the source's type field.",
)
async def ingest_alert(
    source_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> IngestResponse:
    """Ingest an alert payload from a configured source."""
    source = await session.get(AlertSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"Alert source '{source_id}' not found")
    if source.status != "active":
        raise HTTPException(status_code=403, detail="Alert source is disabled")

    body = await request.json()
    headers = {k.lower(): v for k, v in request.headers.items()}

    try:
        incident, is_new, disposition = await process_alert(session, source, body, headers)
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return IngestResponse(
        ingest_id=incident.id if incident else None,
        incident_key=incident.incident_key if incident else None,
        is_new_incident=is_new,
        disposition=disposition,
    )


@router.post(
    "/alerts/ingest/webhook/{source_id}",
    response_model=IngestResponse,
    status_code=202,
    summary="Ingest webhook alert",
    description="Dedicated webhook ingest endpoint.  Alias for generic ingest.",
)
async def ingest_webhook(
    source_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> IngestResponse:
    return await ingest_alert(source_id, request, session)


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------


class IncidentSummary(BaseModel):
    """Lightweight incident row for list views."""

    id: str
    incident_key: str
    title: str | None
    severity: str
    priority: str
    status: str
    service: str | None
    environment: str | None
    signal_count: int
    first_seen_at: str
    last_seen_at: str
    agent_id: str | None
    diagnosis_status: str | None = None


class IncidentListResponse(BaseModel):
    incidents: list[IncidentSummary]
    total: int


class IncidentStatsResponse(BaseModel):
    firing: int
    resolved: int
    suppressed: int
    total: int
    severity_distribution: dict[str, int]
    top_services: list[dict]
    recent_incidents: list[IncidentSummary]


@router.get(
    "/incidents/stats",
    response_model=IncidentStatsResponse,
    summary="Get incident statistics",
    description="Get aggregated incident stats, severity distribution, top services, and recent firing incidents for the tenant.",
)
async def get_incident_stats(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> IncidentStatsResponse:
    tenant_id = require_tenant_context(request)

    # 1. Counts
    firing_res = await session.exec(
        select(func.count(Incident.id)).where(Incident.tenant_id == tenant_id, Incident.status == "firing")
    )
    firing = firing_res.scalar() or 0

    resolved_res = await session.exec(
        select(func.count(Incident.id)).where(Incident.tenant_id == tenant_id, Incident.status == "resolved")
    )
    resolved = resolved_res.scalar() or 0

    suppressed_res = await session.exec(
        select(func.count(Incident.id)).where(Incident.tenant_id == tenant_id, Incident.status == "suppressed")
    )
    suppressed = suppressed_res.scalar() or 0

    total_res = await session.exec(
        select(func.count(Incident.id)).where(Incident.tenant_id == tenant_id)
    )
    total = total_res.scalar() or 0

    # 2. Severity distribution
    severity_res = await session.exec(
        select(Incident.severity, func.count(Incident.id))
        .where(Incident.tenant_id == tenant_id)
        .group_by(Incident.severity)
    )
    severity_distribution = {row[0]: row[1] for row in severity_res.all()}

    # 3. Top services
    services_res = await session.exec(
        select(Incident.service, func.count(Incident.id))
        .where(Incident.tenant_id == tenant_id, Incident.service != None, Incident.service != "")
        .group_by(Incident.service)
        .order_by(func.count(Incident.id).desc())
        .limit(5)
    )
    top_services = [{"service": row[0], "count": row[1]} for row in services_res.all()]

    # 4. Recent firing incidents
    recent_res = await session.exec(
        select(Incident)
        .where(Incident.tenant_id == tenant_id, Incident.status == "firing")
        .order_by(Incident.last_seen_at.desc())
        .limit(5)
    )
    recent_rows = recent_res.scalars().all()

    return IncidentStatsResponse(
        firing=firing,
        resolved=resolved,
        suppressed=suppressed,
        total=total,
        severity_distribution=severity_distribution,
        top_services=top_services,
        recent_incidents=[
            IncidentSummary(
                id=r.id,
                incident_key=r.incident_key,
                title=r.title,
                severity=r.severity,
                priority=r.priority,
                status=r.status,
                service=r.service,
                environment=r.environment,
                signal_count=r.signal_count,
                first_seen_at=r.first_seen_at.isoformat() if r.first_seen_at else "",
                last_seen_at=r.last_seen_at.isoformat() if r.last_seen_at else "",
                agent_id=r.agent_id,
                diagnosis_status=r.diagnosis_status,
            )
            for r in recent_rows
        ]
    )


@router.get(
    "/incidents",
    response_model=IncidentListResponse,
    summary="List incidents",
    description="List incidents for the current tenant, newest first.",
)
async def list_incidents(
    request: Request,
    session: AsyncSession = Depends(get_session),
    status: str | None = None,
    severity: str | None = None,
    service: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> IncidentListResponse:
    tenant_id = require_tenant_context(request)

    conditions = [Incident.tenant_id == tenant_id]
    if status:
        conditions.append(Incident.status == status)
    if severity:
        conditions.append(Incident.severity == severity)
    if service:
        conditions.append(Incident.service == service)

    total_result = await session.exec(
        select(func.count()).select_from(Incident).where(*conditions)
    )
    total = total_result.scalar() or 0

    result = await session.exec(
        select(Incident)
        .where(*conditions)
        .order_by(Incident.last_seen_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()

    return IncidentListResponse(
        incidents=[
            IncidentSummary(
                id=r.id,
                incident_key=r.incident_key,
                title=r.title,
                severity=r.severity,
                priority=r.priority,
                status=r.status,
                service=r.service,
                environment=r.environment,
                signal_count=r.signal_count,
                first_seen_at=r.first_seen_at.isoformat() if r.first_seen_at else "",
                last_seen_at=r.last_seen_at.isoformat() if r.last_seen_at else "",
                agent_id=r.agent_id,
                diagnosis_status=r.diagnosis_status,
            )
            for r in rows
        ],
        total=total,
    )


class IncidentDetail(BaseModel):
    """Full incident detail with signals, AI fields, and context."""

    id: str
    incident_key: str
    title: str | None
    summary: str | None
    severity: str
    priority: str
    status: str
    service: str | None
    environment: str | None
    owner_team_id: str | None = None
    signal_count: int
    first_seen_at: str
    last_seen_at: str
    resolved_at: str | None
    suppressed: bool
    ai_summary: str | None
    ai_impact: str | None
    ai_suggestion: str | None
    ai_analysis_enabled: bool = False
    agent_id: str | None
    thread_id: str | None
    diagnosis_agent_configured: bool = False
    diagnosis_status: str | None = None
    diagnosis_result: str | None = None
    diagnosis_error: str | None = None
    signals: list[dict]
    related_incidents: list[IncidentSummary] = []
    recent_changes: list[dict] = []
    created_at: str
    updated_at: str


@router.get(
    "/incidents/{incident_id}",
    response_model=IncidentDetail,
    summary="Get incident detail",
    description="Full incident detail including linked signals.",
)
async def get_incident(
    incident_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> IncidentDetail:
    tenant_id = require_tenant_context(request)

    result = await session.exec(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.tenant_id == tenant_id,
        )
    )
    incident = result.scalars().first()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    links_result = await session.exec(
        select(IncidentSignalLink).where(
            IncidentSignalLink.incident_id == incident_id,
            IncidentSignalLink.tenant_id == tenant_id,
        )
    )
    link_rows = links_result.scalars().all()
    signal_ids = [l.signal_id for l in link_rows]

    signals: list[dict] = []
    if signal_ids:
        sig_result = await session.exec(
            select(Signal).where(Signal.id.in_(signal_ids))
        )
        for s in sig_result.scalars().all():
            raw_payload = None
            if s.raw_alert_id:
                raw_alert = await session.get(RawAlert, s.raw_alert_id)
                if raw_alert:
                    raw_payload = raw_alert.payload_json
            signals.append({
                "id": s.id,
                "source": s.source,
                "service": s.service,
                "severity": s.severity,
                "status": s.status,
                "title": s.title,
                "fingerprint": s.fingerprint,
                "occurred_at": s.occurred_at.isoformat() if s.occurred_at else None,
                "labels_json": s.labels_json,
                "raw_payload": raw_payload,
            })

    # Context: similar incidents (same service, last 7 days)
    from datetime import UTC, datetime, timedelta
    related: list[IncidentSummary] = []
    if incident.service:
        cutoff = datetime.now(UTC) - timedelta(days=7)
        related_result = await session.exec(
            select(Incident).where(
                Incident.tenant_id == tenant_id,
                Incident.service == incident.service,
                Incident.id != incident_id,
                Incident.created_at >= cutoff,
            ).order_by(Incident.created_at.desc()).limit(5)
        )
        related = [
            IncidentSummary(
                id=r.id, incident_key=r.incident_key, title=r.title,
                severity=r.severity, priority=r.priority, status=r.status,
                service=r.service, environment=r.environment,
                signal_count=r.signal_count,
                first_seen_at=r.first_seen_at.isoformat() if r.first_seen_at else "",
                last_seen_at=r.last_seen_at.isoformat() if r.last_seen_at else "",
                agent_id=r.agent_id,
                diagnosis_status=r.diagnosis_status,
            )
            for r in related_result.scalars().all()
        ]

    # Context: recent changes (same service, last 24h)
    changes_cutoff = datetime.now(UTC) - timedelta(hours=24)
    changes_result = await session.exec(
        select(ChangeEvent).where(
            ChangeEvent.tenant_id == tenant_id,
            ChangeEvent.service == incident.service,
            ChangeEvent.changed_at >= changes_cutoff,
        ).order_by(ChangeEvent.changed_at.desc()).limit(5)
    )
    recent_changes: list[dict] = []
    for c in changes_result.scalars().all():
        recent_changes.append({
            "id": c.id,
            "change_type": c.change_type,
            "summary": c.summary,
            "service": c.service,
            "environment": c.environment,
            "changed_by": c.changed_by,
            "changed_at": c.changed_at.isoformat() if c.changed_at else "",
        })

    # Determine AI analysis + diagnosis agent config from the incident's source(s).
    # Signal.source is the provider type (e.g. "webhook"), NOT the AlertSource name.
    # We trace through RawAlert.source_id → AlertSource.id to find the actual source.
    ai_analysis_enabled = False
    diagnosis_agent_configured = False
    if signal_ids:
        # Collect unique raw_alert_ids from linked signals
        sigs_with_raw = await session.exec(
            select(Signal.raw_alert_id).where(
                Signal.id.in_(signal_ids),
                Signal.raw_alert_id.isnot(None),
            )
        )
        raw_alert_ids = list({r for r in sigs_with_raw.scalars().all()})
        if raw_alert_ids:
            raw_alerts_result = await session.exec(
                select(RawAlert.source_id).where(
                    RawAlert.id.in_(raw_alert_ids),
                    RawAlert.source_id.isnot(None),
                )
            )
            source_ids = list({r for r in raw_alerts_result.scalars().all()})
            if source_ids:
                src_result = await session.exec(
                    select(AlertSource).where(
                        AlertSource.tenant_id == tenant_id,
                        AlertSource.id.in_(source_ids),
                    )
                )
                for src in src_result.scalars().all():
                    enabled, _, _, diag_id = _extract_ai_analysis_from_config(src.config_json)
                    if enabled:
                        ai_analysis_enabled = True
                    if diag_id:
                        diagnosis_agent_configured = True

    return IncidentDetail(
        id=incident.id,
        incident_key=incident.incident_key,
        title=incident.title,
        summary=incident.summary,
        severity=incident.severity,
        priority=incident.priority,
        status=incident.status,
        service=incident.service,
        environment=incident.environment,
        owner_team_id=incident.owner_team_id,
        signal_count=incident.signal_count,
        first_seen_at=incident.first_seen_at.isoformat() if incident.first_seen_at else "",
        last_seen_at=incident.last_seen_at.isoformat() if incident.last_seen_at else "",
        resolved_at=incident.resolved_at.isoformat() if incident.resolved_at else None,
        suppressed=incident.suppressed,
        ai_summary=incident.ai_summary,
        ai_impact=incident.ai_impact,
        ai_suggestion=incident.ai_suggestion,
        ai_analysis_enabled=ai_analysis_enabled,
        agent_id=incident.agent_id,
        thread_id=incident.thread_id,
        diagnosis_agent_configured=diagnosis_agent_configured,
        diagnosis_status=incident.diagnosis_status,
        diagnosis_result=incident.diagnosis_result,
        diagnosis_error=incident.diagnosis_error,
        signals=signals,
        related_incidents=related,
        recent_changes=recent_changes,
        created_at=incident.created_at.isoformat() if incident.created_at else "",
        updated_at=incident.updated_at.isoformat() if incident.updated_at else "",
    )


@router.post(
    "/incidents/{incident_id}/suppress",
    status_code=200,
    summary="Suppress incident",
    description="Mark an incident as suppressed (noise).",
)
async def suppress_incident_endpoint(
    incident_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    tenant_id = require_tenant_context(request)
    user_id = getattr(request.state, "user_id", None)

    result = await session.exec(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.tenant_id == tenant_id,
        )
    )
    incident = result.scalars().first()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    await suppress_incident(session, incident, user_id or "unknown")
    await session.commit()

    return {"status": "suppressed", "incident_id": incident_id}


@router.post(
    "/incidents/{incident_id}/unsuppress",
    status_code=200,
    summary="Unsuppress incident",
    description="Revert the suppression of an incident (mark back as active/firing).",
)
async def unsuppress_incident_endpoint(
    incident_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    tenant_id = require_tenant_context(request)
    user_id = getattr(request.state, "user_id", None)

    result = await session.exec(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.tenant_id == tenant_id,
        )
    )
    incident = result.scalars().first()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = "firing"
    incident.suppressed = False
    session.add(incident)

    import uuid
    from app.models.alerting import IncidentAction
    action = IncidentAction(
        id=str(uuid.uuid4()),
        tenant_id=incident.tenant_id,
        incident_id=incident.id,
        actor_id=user_id or "unknown",
        action_type="unsuppressed",
        action_payload={},
    )
    session.add(action)
    await session.commit()

    return {"status": "firing", "incident_id": incident_id}


@router.post(
    "/incidents/{incident_id}/analyze",
    status_code=202,
    summary="Trigger AI analysis",
    description="Manually trigger AI analysis for an incident. The analysis runs asynchronously.",
)
async def analyze_incident(
    incident_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    tenant_id = require_tenant_context(request)

    result = await session.exec(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.tenant_id == tenant_id,
        )
    )
    incident = result.scalars().first()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Check if AI analysis is enabled for this incident's source(s).
    # Signal.source is the provider type — trace through RawAlert.source_id instead.
    links_chk = await session.exec(
        select(IncidentSignalLink).where(
            IncidentSignalLink.incident_id == incident_id,
            IncidentSignalLink.tenant_id == tenant_id,
        )
    )
    chk_signal_ids = [l.signal_id for l in links_chk.scalars().all()]
    ai_enabled_for_incident = False
    if chk_signal_ids:
        raw_ids_result = await session.exec(
            select(Signal.raw_alert_id).where(
                Signal.id.in_(chk_signal_ids),
                Signal.raw_alert_id.isnot(None),
            )
        )
        raw_alert_ids = list({r for r in raw_ids_result.scalars().all()})
        if raw_alert_ids:
            src_ids_result = await session.exec(
                select(RawAlert.source_id).where(
                    RawAlert.id.in_(raw_alert_ids),
                    RawAlert.source_id.isnot(None),
                )
            )
            source_ids = list({r for r in src_ids_result.scalars().all()})
            if source_ids:
                src_chk = await session.exec(
                    select(AlertSource).where(
                        AlertSource.tenant_id == tenant_id,
                        AlertSource.id.in_(source_ids),
                    )
                )
                for s in src_chk.scalars().all():
                    if _extract_ai_analysis_from_config(s.config_json)[0]:
                        ai_enabled_for_incident = True
                        break

    if not ai_enabled_for_incident:
        raise HTTPException(status_code=400, detail="AI analysis is not enabled for this incident's alert source")

    # Clear old AI analysis fields synchronously so that the frontend polling detects the new analysis run
    incident.ai_summary = None
    incident.ai_impact = None
    incident.ai_suggestion = None
    session.add(incident)

    # Collect signal data
    links_result = await session.exec(
        select(IncidentSignalLink).where(
            IncidentSignalLink.incident_id == incident_id,
            IncidentSignalLink.tenant_id == tenant_id,
        )
    )
    signal_ids = [l.signal_id for l in links_result.scalars().all()]

    signals_data: list[dict] = []
    raw_payload = None
    if signal_ids:
        sig_result = await session.exec(select(Signal).where(Signal.id.in_(signal_ids)))
        for s in sig_result.scalars().all():
            signals_data.append({
                "title": s.title,
                "severity": s.severity,
                "source": s.source,
                "fingerprint": s.fingerprint,
                "labels_json": s.labels_json,
            })
        # Get first raw payload for context (via signal's raw_alert_id)
        first_signal = await session.get(Signal, signal_ids[0])
        if first_signal and first_signal.raw_alert_id:
            raw_alert = await session.get(RawAlert, first_signal.raw_alert_id)
            if raw_alert:
                raw_payload = raw_alert.payload_json

    await session.commit()

    from deerflow.config import get_app_config
    from app.alerting.ai_analysis import schedule_analysis

    if not get_app_config().models:
        raise HTTPException(status_code=503, detail="No AI models configured — please add a model in tenant admin settings first")

    # Determine model override from the incident's alert source config
    # Trace through raw_alert_id → source_id (signal.source is provider type, not name)
    model_name: str | None = None
    if signal_ids:
        first_signal = await session.get(Signal, signal_ids[0])
        if first_signal and first_signal.raw_alert_id:
            raw_alert = await session.get(RawAlert, first_signal.raw_alert_id)
            if raw_alert and raw_alert.source_id:
                src = await session.get(AlertSource, raw_alert.source_id)
                if src:
                    trigger = (src.config_json or {}).get("analysis_trigger", {})
                    model_name = trigger.get("model") or None

    schedule_analysis(incident, signals_data, raw_payload, model_name)

    return {"status": "analyzing", "incident_id": incident_id}


async def _cancel_incident_diagnosis_run(client, thread_id: str, incident_id: str) -> None:
    """Cancel the active LangGraph run for a diagnosis thread, then update the incident."""
    try:
        # Find and cancel active runs for this thread
        runs = await client.runs.list(thread_id, limit=5, status="running")
        if not runs:
            runs = await client.runs.list(thread_id, limit=5, status="pending")
        for run in runs:
            run_id = run.get("run_id") if isinstance(run, dict) else getattr(run, "run_id", None)
            if run_id:
                await client.runs.cancel(thread_id, run_id, action="interrupt")
                logger.info("diagnose: cancelled run %s for incident=%s", run_id, incident_id)
    except Exception as exc:
        logger.error("diagnose: failed to cancel runs for incident=%s: %s", incident_id, exc)
async def _run_diagnosis_background_task(
    incident_id: str,
    agent_id: str,
    agent_name: str,
    diagnosis_prompt: str,
    user_id: str,
    tenant_id: str,
    task_manager: DiagnosisTaskManager,
    session_factory=None
):
    import asyncio
    import logging
    import os
    from app.alerting.diagnosis_sse import (
        parse_messages_tuple_event, parse_values_event,
        msg_thread, msg_done, msg_error,
    )
    from app.models.alerting import Incident
    from app.gateway.routers.alerts import _cancel_incident_diagnosis_run, logger
    
    agui_logger = logging.getLogger("agui")
    db_factory = session_factory or get_session_factory()
    
    def log_agui_event(event_type: str, data: dict | None = None):
        import json as _json
        payload = {"event": event_type, "incident_id": incident_id}
        if data:
            payload.update(data)
        agui_logger.info(_json.dumps(payload, ensure_ascii=False))

    thread_id = None
    client = None
    stream_state = task_manager.get_stream_state(incident_id)
    if stream_state is None:
        return

    try:
        from langgraph_sdk import get_client
        langgraph_url = os.getenv("LANGGRAPH_API_URL", "http://localhost:2025")
        client = get_client(url=langgraph_url)

        # Cancel any orphaned diagnosis from previous attempts
        async with db_factory() as read_session:
            inc = await read_session.get(Incident, incident_id)
            old_thread_id = inc.thread_id if inc else None
            
        if old_thread_id:
            try:
                await _cancel_incident_diagnosis_run(client, old_thread_id, incident_id)
            except Exception:
                pass

        thread = await client.threads.create(metadata={
            "owner_user_id": user_id,
            "owner_tenant_id": tenant_id,
            "incident_id": incident_id,
        })
        thread_id = thread["thread_id"]
        task_manager._thread_ids[incident_id] = thread_id

        # Update status to running and store thread_id early
        async with db_factory() as write_session:
            fresh = await write_session.get(Incident, incident_id)
            if fresh:
                fresh.agent_id = agent_id
                fresh.thread_id = thread_id
                fresh.diagnosis_status = "running"
                write_session.add(fresh)
                await write_session.commit()

        # Broadcast thread_id start event
        task_manager.broadcast(incident_id, msg_thread(thread_id, agent_name))
        log_agui_event("RUN_STARTED", {"thread_id": thread_id, "agent_name": agent_name})

        # Stream agent response
        async for chunk in client.runs.stream(
            thread_id,
            "lead_agent",
            input={"messages": [{"role": "human", "content": diagnosis_prompt}]},
            config={
                "recursion_limit": 500,
            },
            context={
                "agent_name": agent_name,
                "user_id": user_id,
                "tenant_id": tenant_id,
                "thread_id": thread_id,
            },
            stream_mode=["messages-tuple", "values"],
        ):
            event = getattr(chunk, "event", "")
            data = getattr(chunk, "data", None)

            if event == "metadata":
                continue

            if event == "error":
                err_msg = str(data) if isinstance(data, str) else str(data.get("message", "Unknown error"))
                
                async with db_factory() as write_session:
                    fresh = await write_session.get(Incident, incident_id)
                    if fresh:
                        fresh.diagnosis_status = "failed"
                        fresh.diagnosis_error = err_msg
                        if stream_state.full_text_buffer:
                            fresh.diagnosis_result = stream_state.full_text_buffer
                        write_session.add(fresh)
                        await write_session.commit()

                task_manager.broadcast(incident_id, msg_error(err_msg))
                log_agui_event("RUN_ERROR", {"message": err_msg})
                return

            if event in ("messages", "messages-tuple"):
                sse_messages = parse_messages_tuple_event(data, stream_state)
                for sse_msg in sse_messages:
                    task_manager.broadcast(incident_id, sse_msg)

            elif event == "values":
                sse_messages = parse_values_event(data, stream_state)
                for sse_msg in sse_messages:
                    task_manager.broadcast(incident_id, sse_msg)

        # Finished successfully
        async with db_factory() as write_session:
            fresh = await write_session.get(Incident, incident_id)
            if fresh and fresh.diagnosis_status != "cancelled":
                fresh.diagnosis_status = "completed"
                fresh.diagnosis_result = stream_state.full_text_buffer or None
                fresh.diagnosis_error = None
                write_session.add(fresh)
                await write_session.commit()

        task_manager.broadcast(incident_id, msg_done(thread_id, stream_state.full_text_buffer))
        log_agui_event("RUN_FINISHED", {"thread_id": thread_id, "text_length": len(stream_state.full_text_buffer)})

    except asyncio.CancelledError:
        logger.info("diagnose: background task cancelled for incident=%s", incident_id)
        log_agui_event("RUN_CANCELLED", {"reason": "task_cancelled"})
        # Update status to cancelled in DB
        async with db_factory() as write_session:
            fresh = await write_session.get(Incident, incident_id)
            if fresh and fresh.diagnosis_status == "running":
                fresh.diagnosis_status = "cancelled"
                fresh.diagnosis_error = "诊断任务被手动终止"
                write_session.add(fresh)
                await write_session.commit()

    except Exception as e:
        from langgraph.errors import GraphRecursionError
        
        if isinstance(e, GraphRecursionError):
            err_msg = "诊断步骤过多，已自动终止。请尝试缩小排查范围后重新诊断。"
        else:
            err_msg = str(e)

        logger.error("diagnose: background task failed for incident=%s: %s", incident_id, e, exc_info=True)
        log_agui_event("RUN_ERROR", {"message": err_msg})
        
        try:
            async with db_factory() as write_session:
                fresh = await write_session.get(Incident, incident_id)
                if fresh:
                    fresh.diagnosis_status = "failed"
                    fresh.diagnosis_error = err_msg[:5000]
                    if stream_state.full_text_buffer:
                        fresh.diagnosis_result = stream_state.full_text_buffer
                    write_session.add(fresh)
                    await write_session.commit()
        except Exception as se:
            logger.error("diagnose: background task failed to update failure status in DB: %s", se)

        task_manager.broadcast(incident_id, msg_error(err_msg))

@router.post(
    "/incidents/{incident_id}/diagnose",
    status_code=202,
    summary="Stream agent diagnosis",
    description="Stream a depth diagnosis with the incident's bound custom agent via SSE.",
)
async def diagnose_incident(
    incident_id: str,
    request: Request,
    agent_id: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    from starlette.responses import StreamingResponse
    from app.alerting.diagnosis_helper import get_diagnosis_agent_id_for_incident, build_incident_diagnosis_prompt
    from app.models.agents import CustomAgent

    tenant_id = require_tenant_context(request)
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Load incident
    result = await session.exec(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.tenant_id == tenant_id,
        )
    )
    incident = result.scalars().first()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Determine agent_id to use
    if not agent_id:
        agent_id = await get_diagnosis_agent_id_for_incident(session, incident_id, tenant_id)
        if not agent_id:
            raise HTTPException(status_code=400, detail="No diagnosis agent configured for this incident's alert source")

    # Load the agent and verify permissions (must be owned by current user OR tenant-shared)
    agent_result = await session.exec(
        select(CustomAgent).where(
            CustomAgent.id == agent_id,
            CustomAgent.tenant_id == tenant_id,
            (CustomAgent.user_id == user_id) | (CustomAgent.user_id == "tenant-shared")
        )
    )
    agent = agent_result.scalars().first()
    if agent is None:
        raise HTTPException(status_code=400, detail=f"Diagnosis agent not found or permission denied: {agent_id}")

    agent_name = agent.name

    # Build the unified detailed prompt using helper (pass agent metadata)
    diagnosis_prompt = await build_incident_diagnosis_prompt(
        session, incident, tenant_id,
        agent_system_prompt=agent.system_prompt,
        agent_skills=agent.skills,
        agent_tool_groups=agent.tool_groups,
    )

    # Check if a diagnosis is already running. If not, start it.
    if not diagnosis_task_manager.is_running(incident_id):
        from app.alerting.diagnosis_sse import StreamState
        diagnosis_task_manager._stream_states[incident_id] = StreamState()
        diagnosis_task_manager._agent_names[incident_id] = agent_name
        
        diagnosis_task_manager.start_task(
            incident_id,
            _run_diagnosis_background_task(
                incident_id=incident_id,
                agent_id=agent_id,
                agent_name=agent_name,
                diagnosis_prompt=diagnosis_prompt,
                user_id=user_id,
                tenant_id=tenant_id,
                task_manager=diagnosis_task_manager,
                session_factory=get_session_factory()
            )
        )

    async def event_stream():
        import asyncio
        from app.alerting.diagnosis_sse import (
            msg_thread, msg_done, msg_error,
            _text_message_content, _step_started, _step_finished
        )
        import json

        # Capture current length of text buffer
        stream_state = diagnosis_task_manager.get_stream_state(incident_id)
        initial_length = len(stream_state.full_text_buffer) if stream_state else 0
        sent_chars = initial_length
        yielded_run_started = False

        # Register queue BEFORE yielding catchup elements so we don't miss live events
        queue = asyncio.Queue()
        diagnosis_task_manager.register_queue(incident_id, queue)

        try:
            thread_id = diagnosis_task_manager.get_thread_id(incident_id) or incident.thread_id
            if thread_id:
                yield msg_thread(thread_id, agent_name)
                yielded_run_started = True

            # Replay historical steps from LangGraph checkpoint values (todos)
            if thread_id:
                try:
                    from langgraph_sdk import get_client
                    langgraph_url = os.getenv("LANGGRAPH_API_URL", "http://localhost:2025")
                    client = get_client(url=langgraph_url)
                    state = await client.threads.get_state(thread_id)
                    values = state.get("values", {}) if isinstance(state, dict) else getattr(state, "values", {})
                    todos = values.get("todos") or values.get("scratchpad") or []
                    for todo in todos:
                        if isinstance(todo, dict):
                            step_name = todo.get("name") or todo.get("title") or todo.get("content") or str(todo)
                            step_status = str(todo.get("status", "")).lower()
                            yield _step_started(step_name)
                            if step_status in ("done", "completed", "finished", "success"):
                                yield _step_finished(step_name)
                except Exception as ex:
                    logger.warning("diagnose reconnect: could not fetch thread state: %s", ex)

            # Replay accumulated text buffer so far
            if stream_state and stream_state.full_text_buffer:
                yield _text_message_content("catchup-msg-id", stream_state.full_text_buffer)

            # If task is not running anymore, yield final done and finish
            if not diagnosis_task_manager.is_running(incident_id):
                if stream_state and stream_state.full_text_buffer:
                    yield msg_done(thread_id, stream_state.full_text_buffer)
                elif incident.diagnosis_status in ("completed", "failed", "cancelled"):
                    yield msg_done(thread_id, incident.diagnosis_result or "")
                return

            # Live loop
            while True:
                msg = await queue.get()
                if "RUN_STARTED" in msg:
                    if yielded_run_started:
                        continue
                    else:
                        yielded_run_started = True
                
                # Deduplicate and stream live text content incrementally
                if "TEXT_MESSAGE_CONTENT" in msg:
                    current_text = stream_state.full_text_buffer if stream_state else ""
                    if len(current_text) > sent_chars:
                        new_delta = current_text[sent_chars:]
                        sent_chars = len(current_text)
                        yield _text_message_content("live-msg-id", new_delta)
                else:
                    yield msg

                if "RUN_FINISHED" in msg or "RUN_ERROR" in msg:
                    break

        except (asyncio.CancelledError, GeneratorExit):
            logger.info("diagnose: client disconnected from SSE stream for incident=%s", incident_id)
        finally:
            diagnosis_task_manager.unregister_queue(incident_id, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/incidents/{incident_id}/diagnose/cancel",
    status_code=200,
    summary="Cancel a running diagnosis",
    description="Cancel an in-progress agent diagnosis for this incident.",
)
async def cancel_diagnosis(
    incident_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    tenant_id = require_tenant_context(request)
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    result = await session.exec(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.tenant_id == tenant_id,
        )
    )
    incident = result.scalars().first()
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Stop background task
    diagnosis_task_manager.cancel_task(incident_id)

    if incident.diagnosis_status != "running":
        raise HTTPException(status_code=400, detail="No running diagnosis to cancel")

    thread_id = incident.thread_id
    if not thread_id:
        raise HTTPException(status_code=400, detail="No active diagnosis thread found")

    from langgraph_sdk import get_client

    langgraph_url = os.getenv("LANGGRAPH_API_URL", "http://localhost:2025")
    client = get_client(url=langgraph_url)
    await _cancel_incident_diagnosis_run(client, thread_id, incident_id)

    # Update incident status
    incident.diagnosis_status = "cancelled"
    incident.diagnosis_error = "诊断已被用户取消"
    session.add(incident)
    await session.commit()
    await session.refresh(incident)

    logger.info("diagnose: cancelled by user for incident=%s", incident_id)
    return {"status": "cancelled", "incident_id": incident_id}


# ---------------------------------------------------------------------------
# Alert Sources
# ---------------------------------------------------------------------------


def _merge_ai_analysis_into_config(
    config_json: dict, enabled: bool | None, severities: list[str] | None, model: str | None = None,
    diagnosis_agent_id: str | None = None,
) -> dict:
    """Merge AI analysis UI fields into config_json.analysis_trigger."""
    config = dict(config_json) if config_json else {}

    if enabled is None and severities is None and model is None and diagnosis_agent_id is None:
        return config

    existing = config.get("analysis_trigger", {})

    if enabled is not None:
        if enabled and severities:
            existing["mode"] = "conditional"
            existing["conditions"] = {"severity": severities}
        elif enabled:
            existing["mode"] = "conditional"
            existing["conditions"] = existing.get("conditions", {"severity": ["critical", "major"]})
        else:
            existing["mode"] = "manual"
            existing.pop("conditions", None)

    if severities is not None and enabled is None:
        existing["conditions"] = {"severity": severities}

    if model is not None:
        if model:
            existing["model"] = model
        else:
            existing.pop("model", None)

    if diagnosis_agent_id is not None:
        if diagnosis_agent_id:
            existing["diagnosis_agent_id"] = diagnosis_agent_id
        else:
            existing.pop("diagnosis_agent_id", None)

    config["analysis_trigger"] = existing
    return config


def _extract_ai_analysis_from_config(config_json: dict | None) -> tuple[bool, list[str], str | None, str | None]:
    """Extract AI analysis UI fields from config_json.analysis_trigger.

    Returns (enabled, severities, model, diagnosis_agent_id).
    """
    if not config_json:
        return False, [], None, None

    trigger = config_json.get("analysis_trigger", {})
    mode = trigger.get("mode", "conditional")

    if mode == "manual":
        return False, [], trigger.get("model") or None, trigger.get("diagnosis_agent_id") or None

    severities = list(
        trigger.get("conditions", {}).get("severity", list(DEFAULT_AUTO_SEVERITIES))
    )
    model = trigger.get("model") or None
    diagnosis_agent_id = trigger.get("diagnosis_agent_id") or None
    return True, severities, model, diagnosis_agent_id


async def _validate_diagnosis_agent(
    session: AsyncSession,
    tenant_id: str,
    agent_id: str,
) -> None:
    """Validate that a diagnosis agent exists and is a shared agent."""
    from app.models.agents import CustomAgent

    result = await session.exec(
        select(CustomAgent).where(
            CustomAgent.id == agent_id,
            CustomAgent.tenant_id == tenant_id,
        )
    )
    agent = result.scalars().first()
    if agent is None:
        raise HTTPException(status_code=400, detail=f"诊断 Agent ({agent_id}) 不存在或不属于该租户")
    if agent.user_id != "tenant-shared":
        raise HTTPException(status_code=400, detail=f"只能使用租户共享 Agent 作为诊断 Agent。Agent '{agent.name}' 是私有 Agent。")
    if not agent.enabled:
        raise HTTPException(status_code=400, detail=f"诊断 Agent '{agent.name}' 已被禁用，请先启用。")


class AlertSourceCreate(BaseModel):
    name: str
    type: str = "webhook"
    auth_mode: str = "none"
    config_json: dict = Field(default_factory=dict)
    ai_analysis_enabled: bool = False
    ai_analysis_severities: list[str] = Field(default_factory=lambda: ["critical", "major"])
    ai_analysis_model: str | None = None
    diagnosis_agent_id: str | None = None


class AlertSourceResponse(BaseModel):
    id: str
    name: str
    type: str
    status: str
    auth_mode: str
    config_json: dict
    ai_analysis_enabled: bool = False
    ai_analysis_severities: list[str] = Field(default_factory=list)
    ai_analysis_model: str | None = None
    diagnosis_agent_id: str | None = None
    created_at: str


@router.get(
    "/alert-sources",
    response_model=list[AlertSourceResponse],
    summary="List alert sources",
)
async def list_alert_sources(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> list[AlertSourceResponse]:
    tenant_id = require_tenant_context(request)
    result = await session.exec(
        select(AlertSource).where(AlertSource.tenant_id == tenant_id)
    )
    rows = result.scalars().all()
    return [
        AlertSourceResponse(
            id=r.id,
            name=r.name,
            type=r.type,
            status=r.status,
            auth_mode=r.auth_mode,
            config_json=r.config_json,
            ai_analysis_enabled=_extract_ai_analysis_from_config(r.config_json)[0],
            ai_analysis_severities=_extract_ai_analysis_from_config(r.config_json)[1],
            ai_analysis_model=_extract_ai_analysis_from_config(r.config_json)[2],
            diagnosis_agent_id=_extract_ai_analysis_from_config(r.config_json)[3],
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@router.post(
    "/alert-sources",
    response_model=AlertSourceResponse,
    status_code=201,
    summary="Create alert source",
)
async def create_alert_source(
    body: AlertSourceCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AlertSourceResponse:
    tenant_id = require_tenant_admin(request)
    user_id = getattr(request.state, "user_id", None)

    import uuid

    # Validate diagnosis_agent_id if provided
    if body.diagnosis_agent_id:
        await _validate_diagnosis_agent(session, tenant_id, body.diagnosis_agent_id)

    merged_config = _merge_ai_analysis_into_config(
        body.config_json, body.ai_analysis_enabled, body.ai_analysis_severities, body.ai_analysis_model,
        body.diagnosis_agent_id,
    )

    source = AlertSource(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=body.name,
        type=body.type,
        auth_mode=body.auth_mode,
        config_json=merged_config,
        created_by=user_id,
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)

    ai_enabled, ai_severities, ai_model, ai_agent = _extract_ai_analysis_from_config(source.config_json)
    return AlertSourceResponse(
        id=source.id,
        name=source.name,
        type=source.type,
        status=source.status,
        auth_mode=source.auth_mode,
        config_json=source.config_json,
        ai_analysis_enabled=ai_enabled,
        ai_analysis_severities=ai_severities,
        ai_analysis_model=ai_model,
        diagnosis_agent_id=ai_agent,
        created_at=source.created_at.isoformat() if source.created_at else "",
    )


class AlertSourceUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    status: str | None = None  # active / disabled
    auth_mode: str | None = None
    config_json: dict | None = None
    ai_analysis_enabled: bool | None = None
    ai_analysis_severities: list[str] | None = None
    ai_analysis_model: str | None = None
    diagnosis_agent_id: str | None = None


@router.put(
    "/alert-sources/{source_id}",
    response_model=AlertSourceResponse,
    summary="Update alert source",
)
async def update_alert_source(
    source_id: str,
    body: AlertSourceUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AlertSourceResponse:
    tenant_id = require_tenant_admin(request)
    result = await session.exec(
        select(AlertSource).where(
            AlertSource.id == source_id,
            AlertSource.tenant_id == tenant_id,
        )
    )
    source = result.scalars().first()
    if source is None:
        raise HTTPException(status_code=404, detail="Alert source not found")

    # Validate diagnosis_agent_id if being changed
    if body.diagnosis_agent_id:
        await _validate_diagnosis_agent(session, tenant_id, body.diagnosis_agent_id)

    if body.name is not None:
        source.name = body.name
    if body.type is not None:
        source.type = body.type
    if body.status is not None:
        source.status = body.status
    if body.auth_mode is not None:
        source.auth_mode = body.auth_mode
    if body.config_json is not None:
        source.config_json = body.config_json

    # Merge AI analysis fields into config_json
    source.config_json = _merge_ai_analysis_into_config(
        source.config_json or {},
        body.ai_analysis_enabled,
        body.ai_analysis_severities,
        body.ai_analysis_model,
        body.diagnosis_agent_id,
    )

    session.add(source)
    await session.commit()
    await session.refresh(source)

    ai_enabled, ai_severities, ai_model, ai_agent = _extract_ai_analysis_from_config(source.config_json)
    return AlertSourceResponse(
        id=source.id,
        name=source.name,
        type=source.type,
        status=source.status,
        auth_mode=source.auth_mode,
        config_json=source.config_json,
        ai_analysis_enabled=ai_enabled,
        ai_analysis_severities=ai_severities,
        ai_analysis_model=ai_model,
        diagnosis_agent_id=ai_agent,
        created_at=source.created_at.isoformat() if source.created_at else "",
    )


@router.delete(
    "/alert-sources/{source_id}",
    status_code=204,
    summary="Delete alert source",
)
async def delete_alert_source(
    source_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    tenant_id = require_tenant_admin(request)
    result = await session.exec(
        select(AlertSource).where(
            AlertSource.id == source_id,
            AlertSource.tenant_id == tenant_id,
        )
    )
    source = result.scalars().first()
    if source is None:
        raise HTTPException(status_code=404, detail="Alert source not found")
    await session.delete(source)
    await session.commit()


# ---------------------------------------------------------------------------
# Alerting Settings (per-tenant config)
# ---------------------------------------------------------------------------


class AlertingNotificationPrefs(BaseModel):
    """Alerting-specific notification preferences (does NOT include channel config)."""
    severity_threshold: str = "major"
    on_resolved: bool = True
    digest: dict | None = None
    quiet_hours: dict | None = None


class AlertingSettingsResponse(BaseModel):
    raw_alert_retention_days: int = 30
    notification_config: dict = Field(default_factory=dict)


class AlertingSettingsUpdate(BaseModel):
    raw_alert_retention_days: int = 30
    notification_config: AlertingNotificationPrefs | None = None


@router.get(
    "/alerting-settings",
    response_model=AlertingSettingsResponse,
    summary="Get alerting settings",
)
async def get_alerting_settings(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AlertingSettingsResponse:
    from app.alerting.cleanup import get_retention_days

    tenant_id = require_tenant_context(request)
    days = await get_retention_days(session, tenant_id)

    result = await session.exec(
        select(AlertingSettings).where(AlertingSettings.tenant_id == tenant_id)
    )
    settings = result.scalars().first()
    notification = settings.notification_config if settings else {}

    return AlertingSettingsResponse(raw_alert_retention_days=days, notification_config=notification)


@router.put(
    "/alerting-settings",
    response_model=AlertingSettingsResponse,
    summary="Update alerting settings",
)
async def update_alerting_settings(
    body: AlertingSettingsUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AlertingSettingsResponse:
    """Update only alerting-specific notification preferences.
    Does NOT overwrite channel config (channels, chat_ids) managed by IM settings."""
    from app.alerting.cleanup import clamp_retention_days

    tenant_id = require_tenant_admin(request)
    days = clamp_retention_days(body.raw_alert_retention_days)

    result = await session.exec(
        select(AlertingSettings).where(AlertingSettings.tenant_id == tenant_id)
    )
    settings = result.scalars().first()

    if settings is None:
        import uuid
        settings = AlertingSettings(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            raw_alert_retention_days=days,
            notification_config={},
        )

    settings.raw_alert_retention_days = days

    # Merge: only update alerting-specific notification keys, preserve channel keys
    if body.notification_config is not None:
        cfg = dict(settings.notification_config or {})
        cfg["severity_threshold"] = body.notification_config.severity_threshold
        cfg["on_resolved"] = body.notification_config.on_resolved
        if body.notification_config.digest is not None:
            cfg["digest"] = body.notification_config.digest
        if body.notification_config.quiet_hours is not None:
            cfg["quiet_hours"] = body.notification_config.quiet_hours
        settings.notification_config = cfg

    session.add(settings)
    await session.commit()

    return AlertingSettingsResponse(
        raw_alert_retention_days=settings.raw_alert_retention_days,
        notification_config=settings.notification_config,
    )


# ---------------------------------------------------------------------------
# Alert Rules CRUD
# ---------------------------------------------------------------------------


class AlertRuleCreate(BaseModel):
    name: str
    rule_type: str = "suppression"  # suppression, aggregation, dedup
    enabled: bool = True
    condition_json: dict = Field(default_factory=dict)
    action_json: dict = Field(default_factory=dict)


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    rule_type: str | None = None
    enabled: bool | None = None
    condition_json: dict | None = None
    action_json: dict | None = None


class AlertRuleResponse(BaseModel):
    id: str
    name: str
    rule_type: str
    enabled: bool
    condition_json: dict
    action_json: dict
    created_at: str
    updated_at: str


@router.get(
    "/alert-rules",
    response_model=list[AlertRuleResponse],
    summary="List alert rules",
)
async def list_alert_rules(
    request: Request,
    session: AsyncSession = Depends(get_session),
    rule_type: str | None = None,
) -> list[AlertRuleResponse]:
    tenant_id = require_tenant_context(request)
    conditions = [AlertRule.tenant_id == tenant_id]
    if rule_type:
        conditions.append(AlertRule.rule_type == rule_type)
    result = await session.exec(
        select(AlertRule).where(*conditions).order_by(AlertRule.rule_type, AlertRule.name)
    )
    rows = result.scalars().all()
    return [
        AlertRuleResponse(
            id=r.id,
            name=r.name,
            rule_type=r.rule_type,
            enabled=r.enabled,
            condition_json=r.condition_json,
            action_json=r.action_json,
            created_at=r.created_at.isoformat() if r.created_at else "",
            updated_at=r.updated_at.isoformat() if r.updated_at else "",
        )
        for r in rows
    ]


@router.post(
    "/alert-rules",
    response_model=AlertRuleResponse,
    status_code=201,
    summary="Create alert rule",
)
async def create_alert_rule(
    body: AlertRuleCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AlertRuleResponse:
    tenant_id = require_tenant_admin(request)
    import uuid

    rule = AlertRule(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=body.name,
        rule_type=body.rule_type,
        enabled=body.enabled,
        condition_json=body.condition_json,
        action_json=body.action_json,
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        rule_type=rule.rule_type,
        enabled=rule.enabled,
        condition_json=rule.condition_json,
        action_json=rule.action_json,
        created_at=rule.created_at.isoformat() if rule.created_at else "",
        updated_at=rule.updated_at.isoformat() if rule.updated_at else "",
    )


@router.put(
    "/alert-rules/{rule_id}",
    response_model=AlertRuleResponse,
    summary="Update alert rule",
)
async def update_alert_rule(
    rule_id: str,
    body: AlertRuleUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AlertRuleResponse:
    tenant_id = require_tenant_admin(request)
    result = await session.exec(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.tenant_id == tenant_id)
    )
    rule = result.scalars().first()
    if rule is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    if body.name is not None:
        rule.name = body.name
    if body.rule_type is not None:
        rule.rule_type = body.rule_type
    if body.enabled is not None:
        rule.enabled = body.enabled
    if body.condition_json is not None:
        rule.condition_json = body.condition_json
    if body.action_json is not None:
        rule.action_json = body.action_json

    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        rule_type=rule.rule_type,
        enabled=rule.enabled,
        condition_json=rule.condition_json,
        action_json=rule.action_json,
        created_at=rule.created_at.isoformat() if rule.created_at else "",
        updated_at=rule.updated_at.isoformat() if rule.updated_at else "",
    )


@router.delete(
    "/alert-rules/{rule_id}",
    status_code=204,
    summary="Delete alert rule",
)
async def delete_alert_rule(
    rule_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    tenant_id = require_tenant_admin(request)
    result = await session.exec(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.tenant_id == tenant_id)
    )
    rule = result.scalars().first()
    if rule is None:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    await session.delete(rule)
    await session.commit()


# ---------------------------------------------------------------------------
# Change Events
# ---------------------------------------------------------------------------


@router.get(
    "/changes",
    response_model=list[dict],
    summary="List change events",
)
async def list_changes(
    request: Request,
    session: AsyncSession = Depends(get_session),
    service: str | None = None,
    limit: int = 20,
) -> list[dict]:
    tenant_id = require_tenant_context(request)
    conditions = [ChangeEvent.tenant_id == tenant_id]
    if service:
        conditions.append(ChangeEvent.service == service)
    result = await session.exec(
        select(ChangeEvent).where(*conditions).order_by(ChangeEvent.changed_at.desc()).limit(limit)
    )
    return [
        {
            "id": c.id, "change_type": c.change_type, "summary": c.summary,
            "service": c.service, "environment": c.environment,
            "changed_by": c.changed_by,
            "changed_at": c.changed_at.isoformat() if c.changed_at else "",
        }
        for c in result.scalars().all()
    ]


@router.post(
    "/changes/ingest/{source_id}",
    status_code=202,
    summary="Ingest change event",
)
async def ingest_change(
    source_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Ingest a deployment or config-change event from CI/CD pipelines."""
    source = await session.get(AlertSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.status != "active":
        raise HTTPException(status_code=403, detail="Source is disabled")

    body = await request.json()
    import uuid

    change = ChangeEvent(
        id=str(uuid.uuid4()),
        tenant_id=source.tenant_id,
        source_id=source_id,
        service=body.get("service"),
        environment=body.get("environment"),
        change_type=body.get("change_type", "deploy"),
        summary=body.get("summary", ""),
        detail_json=body.get("detail", {}),
        changed_by=body.get("changed_by"),
    )
    session.add(change)
    await session.commit()

    return {"id": change.id, "status": "ingested"}
