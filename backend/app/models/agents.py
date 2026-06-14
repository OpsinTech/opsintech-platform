"""Custom agent domain model — DB-backed agent configuration.

All tables carry tenant_id for multi-tenant isolation and follow the
conventions established in deerflow.database.models.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Text, UniqueConstraint, func
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(UTC)


class CustomAgent(SQLModel, table=True):
    """User-created custom agent with personality, tool, and skill configuration."""

    __tablename__ = "custom_agents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "name", name="uq_custom_agents_tenant_user_name"),
    )

    id: str = Field(primary_key=True)
    tenant_id: str = Field(index=True)
    user_id: str = Field(index=True)
    name: str = Field(index=True)
    description: str = Field(default="")
    model: str | None = Field(default=None)
    tool_groups: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    system_prompt: str = Field(default="", sa_column=Column(Text, nullable=False))
    skills: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    enabled: bool = Field(default=True)
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    meta_info: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column("metadata", JSON, nullable=False, server_default="{}"),
    )
    created_by: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )
