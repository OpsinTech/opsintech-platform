"""Gateway router for IM channel management."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/channels", tags=["channels"])


class ChannelStatusResponse(BaseModel):
    service_running: bool
    channels: dict[str, dict]


class ChannelRestartResponse(BaseModel):
    success: bool
    message: str


class TestNotificationRequest(BaseModel):
    channel_name: str
    chat_id: str


class TestNotificationResponse(BaseModel):
    success: bool
    message: str



@router.get("/", response_model=ChannelStatusResponse)
async def get_channels_status() -> ChannelStatusResponse:
    """Get the status of all IM channels."""
    from app.channels.service import get_channel_service

    service = get_channel_service()
    if service is None:
        return ChannelStatusResponse(service_running=False, channels={})
    status = service.get_status()
    return ChannelStatusResponse(**status)


@router.post("/{name}/restart", response_model=ChannelRestartResponse)
async def restart_channel(name: str) -> ChannelRestartResponse:
    """Restart a specific IM channel."""
    from app.channels.service import get_channel_service

    service = get_channel_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Channel service is not running")

    success = await service.restart_channel(name)
    if success:
        logger.info("Channel %s restarted successfully", name)
        return ChannelRestartResponse(success=True, message=f"Channel {name} restarted successfully")
    else:
        logger.warning("Failed to restart channel %s", name)
        return ChannelRestartResponse(success=False, message=f"Failed to restart channel {name}")


@router.post("/test", response_model=TestNotificationResponse)
async def test_channel_notification(body: TestNotificationRequest) -> TestNotificationResponse:
    """Send a test notification to a specific IM channel and chat ID."""
    from datetime import datetime
    from app.channels.service import get_channel_service
    from app.channels.message_bus import OutboundMessage

    service = get_channel_service()
    if service is None or not service.bus:
        raise HTTPException(status_code=503, detail="Channel service is not running")

    text = (
        "🔔 **OpsInTech 告警通道连通性测试**\n\n"
        "这是一条自动生成的通道连通性测试消息。\n"
        "**测试状态**: 成功 ✅\n"
        f"**测试渠道**: {body.channel_name}\n"
        f"**推送群组**: {body.chat_id}\n"
        f"**时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )

    msg = OutboundMessage(
        channel_name=body.channel_name,
        chat_id=body.chat_id,
        thread_id="",
        text=text,
    )
    try:
        await service.bus.publish_outbound(msg)
        logger.info("Test notification published successfully to %s/%s", body.channel_name, body.chat_id)
        return TestNotificationResponse(success=True, message=f"Test message sent to {body.channel_name}")
    except Exception as e:
        logger.exception("Failed to publish test message")
        return TestNotificationResponse(success=False, message=f"Error sending test message: {str(e)}")


# ---------------------------------------------------------------------------
# Tenant IM Settings
# ---------------------------------------------------------------------------

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.authorization import require_tenant_admin, require_tenant_context
from app.models.alerting import AlertingSettings
from deerflow.database.session import get_session

im_settings_router = APIRouter(prefix="/api/tenant-im", tags=["tenant-im"])


class TenantImSettingsResponse(BaseModel):
    enabled: bool = False
    channels: list[str] = []
    chat_ids: dict[str, str] = {}


class TenantImSettingsUpdate(BaseModel):
    enabled: bool = False
    channels: list[str] = []
    chat_ids: dict[str, str] = {}


@im_settings_router.get(
    "/settings",
    response_model=TenantImSettingsResponse,
    summary="Get tenant IM channel settings",
)
async def get_im_settings(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> TenantImSettingsResponse:
    tenant_id = require_tenant_context(request)
    result = await session.exec(
        select(AlertingSettings).where(AlertingSettings.tenant_id == tenant_id)
    )
    settings = result.scalars().first()
    cfg = settings.notification_config if settings else {}

    return TenantImSettingsResponse(
        enabled=cfg.get("enabled", False),
        channels=cfg.get("channels", []),
        chat_ids=cfg.get("chat_ids", {}),
    )


@im_settings_router.put(
    "/settings",
    response_model=TenantImSettingsResponse,
    summary="Update tenant IM channel settings",
)
async def update_im_settings(
    body: TenantImSettingsUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> TenantImSettingsResponse:
    """Update only channel infrastructure (channels + chat_ids).
    Does NOT touch alerting-specific notification preferences."""
    tenant_id = require_tenant_admin(request)

    result = await session.exec(
        select(AlertingSettings).where(AlertingSettings.tenant_id == tenant_id)
    )
    settings = result.scalars().first()

    if settings is None:
        import uuid
        settings = AlertingSettings(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            notification_config={},
        )

    # Merge: only update channel keys, preserve alerting keys
    cfg = dict(settings.notification_config or {})
    cfg["enabled"] = body.enabled
    cfg["channels"] = body.channels
    cfg["chat_ids"] = body.chat_ids
    settings.notification_config = cfg

    session.add(settings)
    await session.commit()

    return TenantImSettingsResponse(
        enabled=body.enabled,
        channels=body.channels,
        chat_ids=body.chat_ids,
    )

