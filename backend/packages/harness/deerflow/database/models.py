from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Text, UniqueConstraint, func
from sqlmodel import Field, SQLModel


class UserConfig(SQLModel, table=True):
    """Per-user persisted configuration for multi-tenant runtime settings."""

    __tablename__ = "user_configs"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_user_configs_tenant_user"),)

    id: int | None = Field(default=None, primary_key=True)
    tenant_id: str | None = Field(default=None, index=True)
    user_id: str = Field(index=True)
    app_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    extensions_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class Tenant(SQLModel, table=True):
    """Tenant container for shared workspace-level scope."""

    __tablename__ = "tenants"

    id: str = Field(primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    status: str = Field(default="active", index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class TenantMembership(SQLModel, table=True):
    """User membership in a tenant, with role and status."""

    __tablename__ = "tenant_memberships"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_tenant_membership_tenant_user"),)

    id: int | None = Field(default=None, primary_key=True)
    tenant_id: str = Field(index=True)
    user_id: str = Field(index=True)
    role: str = Field(default="member")
    status: str = Field(default="active", index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class TenantModelConfig(SQLModel, table=True):
    """Normalized per-user model configuration entries."""

    __tablename__ = "tenant_model_configs"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", "name", name="uq_tenant_model_tenant_user_name"),)

    id: int | None = Field(default=None, primary_key=True)
    tenant_id: str | None = Field(default=None, index=True)
    user_id: str = Field(index=True)
    name: str = Field(index=True)
    model: str
    use: str = Field(default="")
    display_name: str | None = None
    description: str | None = None
    supports_thinking: bool = Field(default=False)
    supports_reasoning_effort: bool = Field(default=False)
    supports_vision: bool = Field(default=False)
    supports_text2image: bool = Field(default=False)
    max_input_tokens: int | None = Field(default=None)
    model_type: str | None = Field(default=None)
    settings: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class TenantMcpServer(SQLModel, table=True):
    """Normalized per-user MCP server configuration entries."""

    __tablename__ = "tenant_mcp_servers"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", "name", name="uq_tenant_mcp_tenant_user_name"),)

    id: int | None = Field(default=None, primary_key=True)
    tenant_id: str | None = Field(default=None, index=True)
    user_id: str = Field(index=True)
    name: str = Field(index=True)
    enabled: bool = Field(default=True)
    transport_type: str = Field(default="stdio")
    command: str | None = None
    args: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    env: dict[str, str] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    url: str | None = None
    headers: dict[str, str] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    oauth: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    description: str = Field(default="")
    health_status: str = Field(default="unknown")
    last_checked_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class TenantSkill(SQLModel, table=True):
    """Normalized per-user skill state entries."""

    __tablename__ = "tenant_skills"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", "name", name="uq_tenant_skill_tenant_user_name"),)

    id: int | None = Field(default=None, primary_key=True)
    tenant_id: str | None = Field(default=None, index=True)
    user_id: str = Field(index=True)
    name: str = Field(index=True)
    enabled: bool = Field(default=True)
    category: str = Field(default="custom")
    relative_path: str = Field(default="")
    install_dir: str = Field(default="")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class PlatformAnnouncement(SQLModel, table=True):
    """Platform-level operational announcements with tenant/role targeting."""

    __tablename__ = "platform_announcements"

    id: int | None = Field(default=None, primary_key=True)
    title: str
    content: str
    type: str = Field(default="general", index=True)
    severity: str = Field(default="info", index=True)
    scope: str = Field(default="platform_all", index=True)
    target_roles_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    target_tenant_ids_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    publish_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    expire_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    pinned_until: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    status: str = Field(default="draft", index=True)
    created_by: str = Field(index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class PlatformAnnouncementRead(SQLModel, table=True):
    """Per-user read/dismiss state for announcements under tenant context."""

    __tablename__ = "platform_announcement_reads"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", "tenant_id", name="uq_announcement_read_user_tenant"),)

    id: int | None = Field(default=None, primary_key=True)
    announcement_id: int = Field(index=True)
    user_id: str = Field(index=True)
    tenant_id: str = Field(index=True)
    read_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    dismissed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class SubagentRun(SQLModel, table=True):
    """Persistent record of a subagent execution lifecycle."""

    __tablename__ = "subagent_runs"

    id: str = Field(primary_key=True, description="task_id matching the in-memory SubagentResult")
    thread_id: str = Field(index=True, description="The parent thread / conversation ID")
    tenant_id: str | None = Field(default=None, index=True)
    user_id: str | None = Field(default=None, index=True)
    subagent_type: str = Field(index=True, description="general-purpose, bash, etc.")
    description: str | None = Field(default=None)
    prompt: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    status: str = Field(default="pending", index=True, description="pending/running/completed/failed/timed_out")
    result: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    error: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    timeout_seconds: int = Field(default=900)
    max_turns: int | None = Field(default=None)
    trace_id: str | None = Field(default=None)
    started_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )
