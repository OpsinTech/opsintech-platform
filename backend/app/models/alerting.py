"""Alerting domain models — raw_alert → signal → incident pipeline.

All tables carry tenant_id for multi-tenant isolation and follow the
conventions established in deerflow.database.models.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Integer, Text, UniqueConstraint, func
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# alert_sources
# ---------------------------------------------------------------------------


class AlertSource(SQLModel, table=True):
    """External alert source configuration (webhook, alertmanager, etc.)."""

    __tablename__ = "alert_sources"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_alert_sources_tenant_name"),)

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    name: str
    type: str = Field(default="webhook", index=True)  # webhook, alertmanager, grafana, cloud
    status: str = Field(default="active", index=True)  # active, disabled
    auth_mode: str = Field(default="none")  # none, token, signature
    config_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_by: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


# ---------------------------------------------------------------------------
# raw_alerts
# ---------------------------------------------------------------------------


class RawAlert(SQLModel, table=True):
    """Immutable fact table for every alert payload received."""

    __tablename__ = "raw_alerts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "payload_hash", "received_at", name="uq_raw_alerts_tenant_payload_ts"),
    )

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    source_id: str | None = Field(default=None, index=True)
    external_event_id: str | None = Field(default=None)
    payload_hash: str = Field(index=True)
    payload_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    received_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True, server_default=func.now()),
    )
    ingest_status: str = Field(default="received", index=True)  # received, normalized, failed
    error_message: str | None = Field(default=None)


# ---------------------------------------------------------------------------
# signals
# ---------------------------------------------------------------------------


class Signal(SQLModel, table=True):
    """Normalised platform signal derived from a raw alert."""

    __tablename__ = "signals"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    raw_alert_id: str | None = Field(default=None, index=True)
    source: str | None = Field(default=None, index=True)
    service: str | None = Field(default=None, index=True)
    environment: str | None = Field(default=None, index=True)
    severity: str = Field(default="warning", index=True)  # info, warning, minor, major, critical
    status: str = Field(default="firing", index=True)  # firing, resolved
    title: str | None = Field(default=None)
    summary: str | None = Field(default=None)
    labels_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    fingerprint: str = Field(index=True)
    correlation_key: str | None = Field(default=None, index=True)
    occurred_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    resolved_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


# ---------------------------------------------------------------------------
# incidents
# ---------------------------------------------------------------------------


class Incident(SQLModel, table=True):
    """User-facing event object — the primary work item for on-call engineers."""

    __tablename__ = "incidents"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    incident_key: str = Field(index=True, unique=True)
    title: str | None = Field(default=None)
    summary: str | None = Field(default=None)
    severity: str = Field(default="warning", index=True)  # info, warning, minor, major, critical
    priority: str = Field(default="p3", index=True)  # p1, p2, p3, p4
    status: str = Field(default="firing", index=True)  # firing, resolved, suppressed
    service: str | None = Field(default=None, index=True)
    environment: str | None = Field(default=None, index=True)
    owner_user_id: str | None = Field(default=None)
    owner_team_id: str | None = Field(default=None)
    signal_count: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    first_seen_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    last_seen_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    resolved_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    suppressed: bool = Field(default=False)

    # AI-generated fields
    ai_summary: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    ai_impact: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    ai_suggestion: str | None = Field(default=None, sa_column=Column(Text, nullable=True))

    # Agent linkage
    agent_id: str | None = Field(default=None, index=True)
    thread_id: str | None = Field(default=None)
    diagnosis_status: str | None = Field(default=None, index=True)  # pending/running/completed/failed/partial/cancelled
    diagnosis_result: str | None = Field(default=None, sa_column=Column(Text, nullable=True))  # full agent output
    diagnosis_error: str | None = Field(default=None, sa_column=Column(Text, nullable=True))  # error message if failed

    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


# ---------------------------------------------------------------------------
# incident_signal_links
# ---------------------------------------------------------------------------


class IncidentSignalLink(SQLModel, table=True):
    """Many-to-many link between incidents and signals."""

    __tablename__ = "incident_signal_links"
    __table_args__ = (
        UniqueConstraint("incident_id", "signal_id", name="uq_incident_signal"),
    )

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    incident_id: str = Field(index=True)
    signal_id: str = Field(index=True)
    linked_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


# ---------------------------------------------------------------------------
# incident_context_snapshots
# ---------------------------------------------------------------------------


class IncidentContextSnapshot(SQLModel, table=True):
    """Versioned context snapshots captured at analysis time."""

    __tablename__ = "incident_context_snapshots"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    incident_id: str = Field(index=True)
    context_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    version: int = Field(default=1)
    generated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


# ---------------------------------------------------------------------------
# incident_actions
# ---------------------------------------------------------------------------


class IncidentAction(SQLModel, table=True):
    """Audit log for user and system actions on an incident."""

    __tablename__ = "incident_actions"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    incident_id: str = Field(index=True)
    actor_id: str | None = Field(default=None)  # user_id or "system"
    action_type: str = Field(index=True)  # created, assigned, suppressed, resolved, ai_triage, etc.
    action_payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


# ---------------------------------------------------------------------------
# alert_rules
# ---------------------------------------------------------------------------


class AlertingSettings(SQLModel, table=True):
    """Per-tenant alerting configuration."""

    __tablename__ = "alerting_settings"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True, unique=True)
    raw_alert_retention_days: int = Field(default=30)
    notification_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class AlertRule(SQLModel, table=True):
    """Configurable rules for dedup, aggregation, suppression, and escalation."""

    __tablename__ = "alert_rules"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_alert_rules_tenant_name"),)

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    name: str
    rule_type: str = Field(index=True)  # dedup, aggregation, suppression, escalation
    enabled: bool = Field(default=True)
    condition_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    action_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


# ---------------------------------------------------------------------------
# change_events
# ---------------------------------------------------------------------------


class ChangeEvent(SQLModel, table=True):
    """Deployment / config-change events ingested from CI/CD pipelines.

    Used for context assembly on incident detail pages.
    """

    __tablename__ = "change_events"

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    source_id: str | None = Field(default=None, index=True)
    service: str | None = Field(default=None, index=True)
    environment: str | None = Field(default=None, index=True)
    change_type: str = Field(default="deploy", index=True)  # deploy, config, rollback, scale
    summary: str | None = Field(default=None)
    detail_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    changed_by: str | None = Field(default=None)
    changed_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True, server_default=func.now()),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
