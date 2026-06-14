"""Tests for incident deep diagnosis API endpoint."""

from __future__ import annotations

import asyncio
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.agents import CustomAgent
from app.models.alerting import Incident, IncidentSignalLink, Signal, RawAlert, AlertSource

# ---------------------------------------------------------------------------
# Engine & Session Fixtures
# ---------------------------------------------------------------------------

def _make_test_engine() -> AsyncEngine:
    return create_async_engine(
        "sqlite+aiosqlite://",
        echo=False,
        connect_args={"check_same_thread": False},
    )

async def _create_tables(engine: AsyncEngine) -> None:
    # Ensure all tables are registered
    from app.models.agents import CustomAgent
    from app.models.alerting import Incident, IncidentSignalLink, Signal, RawAlert, AlertSource

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

async def _drop_tables(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)

@pytest.fixture()
def test_session_factory():
    engine = _make_test_engine()
    asyncio.run(_create_tables(engine))

    from sqlalchemy.ext.asyncio import async_sessionmaker
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    yield factory

    asyncio.run(_drop_tables(engine))
    asyncio.run(engine.dispose())

# ---------------------------------------------------------------------------
# Test App Setup
# ---------------------------------------------------------------------------

def _make_test_app(session_factory, default_user_id: str | None = "user-a"):
    from fastapi import FastAPI, Request
    from app.gateway.routers.alerts import router

    app = FastAPI()

    @app.middleware("http")
    async def inject_test_user(request: Request, call_next):
        header_user_id = request.headers.get("x-user-id")
        request.state.user_id = header_user_id if header_user_id is not None else default_user_id
        request.state.tenant_id = request.headers.get("x-tenant-id", "tenant-a")
        request.state.tenant_role = request.headers.get("x-tenant-role", "tenant_member")
        return await call_next(request)

    async def override_get_session():
        async with session_factory() as session:
            yield session

    from deerflow.database.session import get_session
    app.dependency_overrides[get_session] = override_get_session
    app.include_router(router)
    return app

@pytest.fixture()
def client(test_session_factory):
    app = _make_test_app(test_session_factory)
    with TestClient(app) as client:
        yield client

# ---------------------------------------------------------------------------
# LangGraph Mocking
# ---------------------------------------------------------------------------

class MockStreamChunk:
    def __init__(self, event: str, data: any):
        self.event = event
        self.data = data

async def mock_runs_stream(*args, **kwargs):
    # Yield a few mock tokens to simulate LangGraph streaming
    yield MockStreamChunk(
        "messages-tuple",
        [("ai", {"type": "ai", "content": "Mock diagnosis token 1"})]
    )
    yield MockStreamChunk(
        "messages-tuple",
        [("ai", {"type": "ai", "content": "Mock diagnosis token 2"})]
    )

@pytest.fixture()
def mock_langgraph():
    mock_client = MagicMock()
    mock_client.threads.create = AsyncMock(return_value={"thread_id": "mock-thread-xyz"})
    mock_client.runs.stream = mock_runs_stream

    with patch("langgraph_sdk.get_client", return_value=mock_client):
        yield mock_client

# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

class TestIncidentDiagnosis:
    async def _setup_data(self, session_factory):
        async with session_factory() as session:
            # 1. Create SRE custom agents
            private_agent = CustomAgent(
                id="agent-private",
                tenant_id="tenant-a",
                user_id="user-a",
                name="private-diagnoser",
                system_prompt="Private agent system prompt",
            )
            shared_agent = CustomAgent(
                id="agent-shared",
                tenant_id="tenant-a",
                user_id="tenant-shared",
                name="shared-diagnoser",
                system_prompt="Shared agent system prompt",
            )
            other_agent = CustomAgent(
                id="agent-other",
                tenant_id="tenant-a",
                user_id="user-other",
                name="other-diagnoser",
                system_prompt="Other agent system prompt",
            )

            # 2. Create Alert Source
            source = AlertSource(
                id="source-1",
                tenant_id="tenant-a",
                name="Prometheus",
                type="webhook",
                status="active",
                config_json={
                    "analysis_trigger": {
                        "mode": "conditional",
                        "diagnosis_agent_id": "agent-shared",
                    }
                },
            )

            # 3. Create Incident
            incident = Incident(
                id="incident-1",
                tenant_id="tenant-a",
                incident_key="INC-1",
                title="Service high error rate",
                severity="critical",
                status="firing",
            )

            # 4. Create Signal & Links
            signal = Signal(
                id="sig-1",
                tenant_id="tenant-a",
                raw_alert_id="raw-1",
                source="prometheus",
                severity="critical",
                status="firing",
                title="High response time",
                fingerprint="finger-1",
            )
            raw_alert = RawAlert(
                id="raw-1",
                tenant_id="tenant-a",
                source_id="source-1",
                payload_hash="mock_payload_hash",
                raw_payload_json={},
            )
            link = IncidentSignalLink(
                id="link-1",
                tenant_id="tenant-a",
                incident_id="incident-1",
                signal_id="sig-1",
            )

            session.add_all([private_agent, shared_agent, other_agent, source, incident, signal, raw_alert, link])
            await session.commit()

    def test_diagnose_default_agent(self, test_session_factory, client, mock_langgraph):
        asyncio.run(self._setup_data(test_session_factory))

        # Patch get_session_factory so the SSE write session uses test DB
        with patch("app.gateway.routers.alerts.get_session_factory", return_value=test_session_factory):
            response = client.post(
                "/api/incidents/incident-1/diagnose",
                headers={"x-user-id": "user-a", "x-tenant-id": "tenant-a"},
            )
            assert response.status_code == 200
            # Read streaming response chunks
            chunks = response.text.split("\n\n")
            assert any("thread" in chunk and "mock-thread-xyz" in chunk for chunk in chunks)
            # Check for token messages (new SSE format)
            assert any("token" in chunk and "Mock diagnosis token" in chunk for chunk in chunks)

            # Verify Incident in DB has completed status and thread/agent linked
            async def verify_db():
                async with test_session_factory() as session:
                    inc = await session.get(Incident, "incident-1")
                    assert inc.diagnosis_status == "completed"
                    assert inc.agent_id == "agent-shared"
                    # thread_id is cleared after completion in new code
            asyncio.run(verify_db())

    def test_diagnose_custom_private_agent(self, test_session_factory, client, mock_langgraph):
        asyncio.run(self._setup_data(test_session_factory))

        with patch("app.gateway.routers.alerts.get_session_factory", return_value=test_session_factory):
            response = client.post(
                "/api/incidents/incident-1/diagnose?agent_id=agent-private",
                headers={"x-user-id": "user-a", "x-tenant-id": "tenant-a"},
            )
            assert response.status_code == 200
            chunks = response.text.split("\n\n")
            assert any("thread" in chunk and "mock-thread-xyz" in chunk for chunk in chunks)

            async def verify_db():
                async with test_session_factory() as session:
                    inc = await session.get(Incident, "incident-1")
                    assert inc.diagnosis_status == "completed"
                    assert inc.agent_id == "agent-private"
                    # thread_id is cleared after completion in new code
            asyncio.run(verify_db())

    def test_diagnose_custom_shared_agent(self, test_session_factory, client, mock_langgraph):
        asyncio.run(self._setup_data(test_session_factory))

        with patch("app.gateway.routers.alerts.get_session_factory", return_value=test_session_factory):
            response = client.post(
                "/api/incidents/incident-1/diagnose?agent_id=agent-shared",
                headers={"x-user-id": "user-a", "x-tenant-id": "tenant-a"},
            )
            assert response.status_code == 200
            chunks = response.text.split("\n\n")
            assert any("thread" in chunk and "mock-thread-xyz" in chunk for chunk in chunks)

            async def verify_db():
                async with test_session_factory() as session:
                    inc = await session.get(Incident, "incident-1")
                    assert inc.diagnosis_status == "completed"
                    assert inc.agent_id == "agent-shared"
            asyncio.run(verify_db())

    def test_diagnose_permission_denied_other_user_agent(self, test_session_factory, client, mock_langgraph):
        asyncio.run(self._setup_data(test_session_factory))

        with patch("app.gateway.routers.alerts.get_session_factory", return_value=test_session_factory):
            response = client.post(
                "/api/incidents/incident-1/diagnose?agent_id=agent-other",
                headers={"x-user-id": "user-a", "x-tenant-id": "tenant-a"},
            )
            # Should return 400 Bad Request / Permission Denied
            assert response.status_code == 400
            assert "permission denied" in response.json()["detail"]

    def test_diagnose_stream_failure_handling(self, test_session_factory, client, mock_langgraph):
        asyncio.run(self._setup_data(test_session_factory))

        # Force runs.stream to raise an Exception
        async def failing_stream(*args, **kwargs):
            yield ("messages-tuple", MagicMock(content="Token before fail"))
            raise RuntimeError("LangGraph connection failed")

        mock_langgraph.runs.stream = failing_stream

        with patch("app.gateway.routers.alerts.get_session_factory", return_value=test_session_factory):
            response = client.post(
                "/api/incidents/incident-1/diagnose",
                headers={"x-user-id": "user-a", "x-tenant-id": "tenant-a"},
            )
            assert response.status_code == 200
            chunks = response.text.split("\n\n")
            # AG-UI protocol uses RUN_ERROR event type
            assert any("RUN_ERROR" in chunk and "LangGraph connection failed" in chunk for chunk in chunks)

            # Verify Incident in DB has failed status
            async def verify_db():
                async with test_session_factory() as session:
                    inc = await session.get(Incident, "incident-1")
                    assert inc.diagnosis_status == "failed"
            asyncio.run(verify_db())
