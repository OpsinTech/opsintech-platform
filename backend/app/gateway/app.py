import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI

from app.gateway.bootstrap_admin import bootstrap_admin
from app.gateway.config import get_gateway_config
from app.gateway.routers import (
    admin,
    agents,
    alerts,
    announcements,
    artifacts,
    assets,
    auth as auth_routes,
    channels,
    files,
    mcp,
    memory,
    models,
    skills,
    suggestions,
    summarization,
    templates,
    tenants,
    threads,
    uploads,
    terminal,
)
from deerflow.config.app_config import get_app_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""

    # Load config and check necessary environment variables at startup
    try:
        get_app_config()
        logger.info("Configuration loaded successfully")
    except Exception as e:
        error_msg = f"Failed to load configuration during gateway startup: {e}"
        logger.exception(error_msg)
        raise RuntimeError(error_msg) from e
    config = get_gateway_config()
    logger.info(f"Starting API Gateway on {config.host}:{config.port}")

    try:
        import subprocess
        import sys
        from pathlib import Path

        backend_dir = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.stdout:
            for line in result.stdout.strip().splitlines():
                logger.info("[alembic] %s", line)
        if result.stderr:
            for line in result.stderr.strip().splitlines():
                logger.warning("[alembic] %s", line)
        if result.returncode != 0:
            raise RuntimeError(f"Alembic exited with code {result.returncode}")
        logger.info("Database migrations completed successfully")
    except Exception:
        logger.exception("Database migration failed — aborting startup")
        raise

    bootstrap_admin()

    # NOTE: MCP tools initialization is NOT done here because:
    # 1. Gateway doesn't use MCP tools - they are used by Agents in the LangGraph Server
    # 2. Gateway and LangGraph Server are separate processes with independent caches
    # MCP tools are lazily initialized in LangGraph Server when first needed

    # Start IM channel service if any channels are configured
    try:
        from app.channels.service import start_channel_service

        channel_service = await start_channel_service()
        logger.info("Channel service started: %s", channel_service.get_status())
    except Exception:
        logger.exception("No IM channels configured or channel service failed to start")

    # Run raw_alerts cleanup on startup
    try:
        from app.alerting.cleanup import cleanup_raw_alerts
        from deerflow.database.session import get_session_factory

        async with get_session_factory()() as cleanup_session:
            deleted = await cleanup_raw_alerts(cleanup_session)
            if deleted:
                logger.info("Startup cleanup: removed %d old raw_alerts", deleted)
    except Exception:
        logger.exception("Raw alert cleanup failed on startup")

    # Start background tasks
    digest_task = asyncio.create_task(_run_digest_scheduler())
    health_task = asyncio.create_task(_run_health_monitor())

    yield

    for task in [digest_task, health_task]:
        task.cancel()
    for task in [digest_task, health_task]:
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Stop channel service on shutdown
    try:
        from app.channels.service import stop_channel_service

        await stop_channel_service()
    except Exception:
        logger.exception("Failed to stop channel service")
    logger.info("Shutting down API Gateway")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI application instance.
    """

    app = FastAPI(
        title="OpsinTech API Gateway",
        description="""
## OpsinTech API Gateway

API Gateway for OpsinTech - A LangGraph-based AI agent backend with sandbox execution capabilities.

### Features

- **Models Management**: Query and retrieve available AI models
- **MCP Configuration**: Manage Model Context Protocol (MCP) server configurations
- **Memory Management**: Access and manage global memory data for personalized conversations
- **Skills Management**: Query and manage skills and their enabled status
- **Artifacts**: Access thread artifacts and generated files
- **Health Monitoring**: System health check endpoints

### Architecture

LangGraph requests are handled by nginx reverse proxy.
This gateway provides custom endpoints for models, MCP configuration, skills, and artifacts.
        """,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        openapi_tags=[
            {
                "name": "models",
                "description": "Operations for querying available AI models and their configurations",
            },
            {
                "name": "mcp",
                "description": "Manage Model Context Protocol (MCP) server configurations",
            },
            {
                "name": "memory",
                "description": "Access and manage global memory data for personalized conversations",
            },
            {
                "name": "skills",
                "description": "Manage skills and their configurations",
            },
            {
                "name": "artifacts",
                "description": "Access and download thread artifacts and generated files",
            },
            {
                "name": "uploads",
                "description": "Upload and manage user files for threads",
            },
            {
                "name": "files",
                "description": "File Center — unified file and folder management across the platform",
            },
            {
                "name": "threads",
                "description": "Manage OpsinTech thread-local filesystem data",
            },
            {
                "name": "tenants",
                "description": "Manage tenant context and tenant switching",
            },
            {
                "name": "agents",
                "description": "Create and manage custom agents with per-agent config and prompts",
            },
            {
                "name": "suggestions",
                "description": "Generate follow-up question suggestions for conversations",
            },
            {
                "name": "channels",
                "description": "Manage IM channel integrations (Feishu, Slack, Telegram)",
            },
            {
                "name": "admin",
                "description": "Administrator-only governance APIs",
            },
            {
                "name": "announcements",
                "description": "Platform operational announcements with targeting and lifecycle control",
            },
            {
                "name": "health",
                "description": "Health check and system status endpoints",
            },
        ],
    )

    # CORS is handled by nginx - no need for FastAPI middleware

    # Load Auth Middleware to protect business APIs
    from app.gateway.auth import AuthMiddleware
    app.add_middleware(AuthMiddleware)

    # Include routers
    # Models API is mounted at /api/models
    app.include_router(models.router)

    # MCP API is mounted at /api/mcp
    app.include_router(mcp.router)

    # Memory API is mounted at /api/memory
    app.include_router(memory.router)

    # Skills API is mounted at /api/skills
    app.include_router(skills.router)

    # Artifacts API is mounted at /api/threads/{thread_id}/artifacts
    app.include_router(artifacts.router)

    # Uploads API is mounted at /api/threads/{thread_id}/uploads
    app.include_router(uploads.router)

    # Templates API is mounted at /api/templates
    app.include_router(templates.router)

    # Thread cleanup API is mounted at /api/threads/{thread_id}
    app.include_router(threads.router)

    # Tenant APIs are mounted at /api/tenants
    app.include_router(tenants.router)

    # Agents API is mounted at /api/agents
    app.include_router(agents.router)

    # Auth helpers (bootstrap-status, setup-bootstrap-admin)
    app.include_router(auth_routes.router)

    # Suggestions API is mounted at /api/threads/{thread_id}/suggestions
    app.include_router(suggestions.router)

    # Channels API is mounted at /api/channels
    app.include_router(channels.router)
    app.include_router(channels.im_settings_router)

    # Admin API is mounted at /api/admin
    app.include_router(admin.router)

    # Announcements APIs are mounted at /api/admin/announcements and /api/announcements
    app.include_router(announcements.router)

    # Alerting APIs — ingest is unauthenticated (source-level token auth);
    # incident list/detail and source management require normal auth.
    app.include_router(alerts.router)

    # Terminal websocket API
    app.include_router(terminal.router, prefix="/api/v1/terminal")


    # Assets Management API
    app.include_router(assets.router)

    # File Center API — unified file and folder management
    app.include_router(files.router)

    # Summarization settings API (tenant-admin)
    app.include_router(summarization.router)

    @app.get("/health", tags=["health"])
    async def health_check() -> dict:
        """Health check endpoint.

        Returns:
            Service health status information.
        """
        return {"status": "healthy", "service": "opsintech-gateway"}

    return app


# ---------------------------------------------------------------------------
# Background scheduler for daily digest
# ---------------------------------------------------------------------------


async def _run_digest_scheduler() -> None:
    """Check every 60s if any tenant's digest is due, fire send_daily_digest."""
    fired_dates: dict[str, set[str]] = {}  # tenant_id -> set of "HH:MM" already fired today
    _last_reset_date: str = ""

    while True:
        try:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

            now = datetime.now(UTC)
            today = now.strftime("%Y%m%d")
            current_utc_time = now.strftime("%H:%M")

            # Reset fired_dates when the day rolls over (UTC baseline)
            if today != _last_reset_date:
                _last_reset_date = today
                fired_dates = {}

            from app.alerting.notify import send_daily_digest
            from app.models.alerting import AlertingSettings
            from sqlalchemy import select
            from deerflow.database.session import get_session_factory

            async with get_session_factory()() as session:
                result = await session.exec(select(AlertingSettings))
                for settings in result.scalars().all():
                    cfg = settings.notification_config or {}
                    digest = cfg.get("digest", {})
                    if not digest.get("enabled"):
                        continue

                    # Resolve the configured digest time in the tenant's timezone
                    digest_time = digest.get("time", "09:00")
                    tz_name = cfg.get("timezone", "UTC")
                    try:
                        tz = ZoneInfo(tz_name)
                    except (ZoneInfoNotFoundError, KeyError):
                        tz = ZoneInfo("UTC")
                    local_now = now.astimezone(tz)
                    if digest_time != local_now.strftime("%H:%M"):
                        continue

                    # Avoid duplicate firing within the same day (in the tenant's timezone)
                    tenant_key = settings.tenant_id
                    if digest_time in fired_dates.get(tenant_key, set()):
                        continue

                    fired_dates.setdefault(tenant_key, set()).add(digest_time)
                    logger.info("digest: firing for tenant=%s at %s (tz=%s)", tenant_key, digest_time, tz_name)
                    await send_daily_digest(tenant_key)

        except Exception:
            logger.exception("digest scheduler error")

        await asyncio.sleep(60)


async def _run_health_monitor() -> None:
    """Check alert source health every 5 minutes."""
    while True:
        try:
            from app.alerting.health_monitor import check_source_health

            await check_source_health()
        except Exception:
            logger.exception("health monitor error")
        await asyncio.sleep(300)  # every 5 minutes


# Create app instance for uvicorn
app = create_app()
