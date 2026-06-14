"""Tests for custom agent support — DB-backed."""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_test_engine() -> AsyncEngine:
    """Create an in-memory SQLite async engine for tests."""
    return create_async_engine(
        "sqlite+aiosqlite://",
        echo=False,
        connect_args={"check_same_thread": False},
    )


async def _create_tables(engine: AsyncEngine) -> None:
    """Create all tables needed for agent tests."""
    # Import models so they register with SQLModel.metadata
    from app.models.agents import CustomAgent  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def _drop_tables(engine: AsyncEngine) -> None:
    """Drop all tables after tests."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest.fixture()
def test_session_factory():
    """Fixture providing an async session factory connected to in-memory SQLite."""
    engine = _make_test_engine()
    asyncio.run(_create_tables(engine))

    from sqlalchemy.ext.asyncio import async_sessionmaker

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    yield factory

    asyncio.run(_drop_tables(engine))
    asyncio.run(engine.dispose())


def _make_paths(base_dir: Path):
    """Return a Paths instance pointing to base_dir."""
    from deerflow.config.paths import Paths

    return Paths(base_dir=base_dir)


# ---------------------------------------------------------------------------
# Test app factory with DB dependency override
# ---------------------------------------------------------------------------


def _make_test_app(session_factory, default_user_id: str | None = "user-a"):
    """Create a FastAPI app with the agents router, using test DB sessions."""
    from fastapi import FastAPI, Request

    from app.gateway.routers.agents import router

    app = FastAPI()

    @app.middleware("http")
    async def inject_test_user(request: Request, call_next):
        header_user_id = request.headers.get("x-user-id")
        request.state.user_id = header_user_id if header_user_id is not None else default_user_id
        request.state.tenant_id = request.headers.get("x-tenant-id", "tenant-a")
        request.state.tenant_role = request.headers.get("x-tenant-role", "tenant_member")
        return await call_next(request)

    # Override get_session to use test DB
    async def override_get_session():
        async with session_factory() as session:
            yield session

    from deerflow.database.session import get_session

    app.dependency_overrides[get_session] = override_get_session

    app.include_router(router)
    return app


@pytest.fixture()
def agent_client(test_session_factory):
    """TestClient with agents router, using test DB sessions."""
    app = _make_test_app(test_session_factory)
    with TestClient(app) as client:
        yield client


@pytest.fixture()
def unauth_agent_client(test_session_factory):
    """TestClient that does not auto-inject a fallback authenticated user."""
    app = _make_test_app(test_session_factory, default_user_id=None)
    with TestClient(app) as client:
        yield client


# ===========================================================================
# 1. Paths class — agent path methods (filesystem-based, still relevant)
# ===========================================================================


class TestPaths:
    def test_agents_dir(self, tmp_path):
        paths = _make_paths(tmp_path)
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            assert paths.agents_dir() == tmp_path / "agents"

    def test_agent_dir(self, tmp_path):
        paths = _make_paths(tmp_path)
        import warnings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            assert paths.agent_dir("code-reviewer") == tmp_path / "agents" / "code-reviewer"

    def test_agent_memory_file(self, tmp_path):
        paths = _make_paths(tmp_path)
        assert paths.agent_memory_file("code-reviewer") == tmp_path / "agents" / "code-reviewer" / "memory.json"

    def test_user_md_file(self, tmp_path):
        paths = _make_paths(tmp_path)
        assert paths.user_md_file() == tmp_path / "USER.md"

    def test_paths_are_different_from_global(self, tmp_path):
        paths = _make_paths(tmp_path)
        assert paths.memory_file != paths.agent_memory_file("my-agent")
        assert paths.memory_file == tmp_path / "memory.json"
        assert paths.agent_memory_file("my-agent") == tmp_path / "agents" / "my-agent" / "memory.json"


# ===========================================================================
# 2. AgentConfig — Pydantic parsing
# ===========================================================================


class TestAgentConfig:
    def test_minimal_config(self):
        from deerflow.config.agents_config import AgentConfig

        cfg = AgentConfig(name="my-agent")
        assert cfg.name == "my-agent"
        assert cfg.description == ""
        assert cfg.model is None
        assert cfg.tool_groups is None
        assert cfg.skills is None
        assert cfg.enabled is True

    def test_full_config(self):
        from deerflow.config.agents_config import AgentConfig

        cfg = AgentConfig(
            name="code-reviewer",
            description="Specialized for code review",
            model="deepseek-v3",
            tool_groups=["file:read", "bash"],
            skills=["code-review", "testing"],
            enabled=True,
            tags=["dev", "code"],
        )
        assert cfg.name == "code-reviewer"
        assert cfg.model == "deepseek-v3"
        assert cfg.tool_groups == ["file:read", "bash"]
        assert cfg.skills == ["code-review", "testing"]
        assert cfg.tags == ["dev", "code"]

    def test_config_from_dict(self):
        from deerflow.config.agents_config import AgentConfig

        data = {"name": "test-agent", "description": "A test", "model": "gpt-4"}
        cfg = AgentConfig(**data)
        assert cfg.name == "test-agent"
        assert cfg.model == "gpt-4"
        assert cfg.tool_groups is None


# ===========================================================================
# 3. Agent DB model — CustomAgent
# ===========================================================================


class TestCustomAgentModel:
    def test_create_and_query(self, test_session_factory):
        from app.models.agents import CustomAgent

        from sqlmodel import select

        async def _run():
            agent_id = str(uuid.uuid4())
            agent = CustomAgent(
                id=agent_id,
                tenant_id="tenant-a",
                user_id="user-a",
                name="test-agent",
                description="Test agent",
                system_prompt="You are a test agent.",
                skills=["k8s", "db"],
                tags=["oncall"],
                enabled=True,
            )

            async with test_session_factory() as session:
                session.add(agent)
                await session.commit()
                await session.refresh(agent)

            async with test_session_factory() as session:
                result = await session.exec(
                    select(CustomAgent).where(CustomAgent.id == agent_id)
                )
                found = result.first()

            assert found is not None
            assert found.name == "test-agent"
            assert found.skills == ["k8s", "db"]
            assert found.tags == ["oncall"]
            assert found.enabled is True

        asyncio.run(_run())


# ===========================================================================
# 4. Gateway API — Agents endpoints (DB-backed)
# ===========================================================================


class TestAgentsAPI:
    def test_list_agents_empty(self, agent_client):
        response = agent_client.get("/api/agents")
        assert response.status_code == 200
        data = response.json()
        assert data["agents"] == []

    def test_create_agent(self, agent_client):
        payload = {
            "name": "code-reviewer",
            "description": "Reviews code",
            "system_prompt": "You are a code reviewer.",
            "skills": ["code-review"],
            "tags": ["dev"],
        }
        response = agent_client.post("/api/agents", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "code-reviewer"
        assert data["description"] == "Reviews code"
        assert data["system_prompt"] == "You are a code reviewer."
        assert data["soul"] == "You are a code reviewer."  # deprecated alias
        assert data["skills"] == ["code-review"]
        assert data["tags"] == ["dev"]
        assert data["enabled"] is True
        assert "id" in data

    def test_create_agent_with_deprecated_soul_field(self, agent_client):
        """soul field should be accepted and mapped to system_prompt."""
        payload = {
            "name": "soul-agent",
            "soul": "You are helpful.",
        }
        response = agent_client.post("/api/agents", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["system_prompt"] == "You are helpful."

    def test_create_agent_invalid_name(self, agent_client):
        payload = {"name": "Code Reviewer!", "system_prompt": "test"}
        response = agent_client.post("/api/agents", json=payload)
        assert response.status_code == 422

    def test_create_duplicate_agent_409(self, agent_client):
        payload = {"name": "my-agent", "system_prompt": "test"}
        agent_client.post("/api/agents", json=payload)

        # Second create should fail
        response = agent_client.post("/api/agents", json=payload)
        assert response.status_code == 409

    def test_same_name_different_users_allowed(self, agent_client):
        """Two different users can have agents with the same name."""
        payload = {"name": "shared-name", "system_prompt": "isolation"}

        first = agent_client.post(
            "/api/agents", json=payload, headers={"x-user-id": "user-a"}
        )
        assert first.status_code == 201

        second = agent_client.post(
            "/api/agents", json=payload, headers={"x-user-id": "user-b"}
        )
        assert second.status_code == 201

    def test_list_agents_after_create(self, agent_client):
        agent_client.post("/api/agents", json={"name": "agent-one", "system_prompt": "p1"})
        agent_client.post("/api/agents", json={"name": "agent-two", "system_prompt": "p2"})

        response = agent_client.get("/api/agents")
        assert response.status_code == 200
        names = [a["name"] for a in response.json()["agents"]]
        assert "agent-one" in names
        assert "agent-two" in names

    def test_get_agent(self, agent_client):
        agent_client.post(
            "/api/agents",
            json={"name": "test-agent", "system_prompt": "Hello world"},
        )

        response = agent_client.get("/api/agents/test-agent")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "test-agent"
        assert data["system_prompt"] == "Hello world"

    def test_get_missing_agent_404(self, agent_client):
        response = agent_client.get("/api/agents/nonexistent")
        assert response.status_code == 404

    def test_update_agent_system_prompt(self, agent_client):
        agent_client.post(
            "/api/agents", json={"name": "update-me", "system_prompt": "original"}
        )

        response = agent_client.put(
            "/api/agents/update-me", json={"system_prompt": "updated"}
        )
        assert response.status_code == 200
        assert response.json()["system_prompt"] == "updated"

    def test_update_agent_description(self, agent_client):
        agent_client.post(
            "/api/agents",
            json={"name": "desc-agent", "description": "old desc", "system_prompt": "p"},
        )

        response = agent_client.put(
            "/api/agents/desc-agent", json={"description": "new desc"}
        )
        assert response.status_code == 200
        assert response.json()["description"] == "new desc"

    def test_update_agent_skills(self, agent_client):
        agent_client.post(
            "/api/agents",
            json={"name": "skill-agent", "system_prompt": "p", "skills": []},
        )

        response = agent_client.put(
            "/api/agents/skill-agent",
            json={"skills": ["k8s", "db"]},
        )
        assert response.status_code == 200
        assert response.json()["skills"] == ["k8s", "db"]

    def test_update_agent_enabled(self, agent_client):
        agent_client.post(
            "/api/agents",
            json={"name": "toggle-agent", "system_prompt": "p"},
        )

        # Disable
        response = agent_client.put(
            "/api/agents/toggle-agent", json={"enabled": False}
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is False

        # Re-enable
        response = agent_client.put(
            "/api/agents/toggle-agent", json={"enabled": True}
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is True

    def test_update_missing_agent_404(self, agent_client):
        response = agent_client.put(
            "/api/agents/ghost-agent", json={"system_prompt": "new"}
        )
        assert response.status_code == 404

    def test_update_by_other_user_returns_404(self, agent_client):
        """Cross-user update returns 404 (doesn't leak agent existence)."""
        agent_client.post(
            "/api/agents",
            json={"name": "owned-by-a", "system_prompt": "mine"},
            headers={"x-user-id": "user-a"},
        )

        response = agent_client.put(
            "/api/agents/owned-by-a",
            json={"description": "stolen"},
            headers={"x-user-id": "user-b"},
        )
        assert response.status_code == 404

    def test_delete_agent(self, agent_client):
        agent_client.post(
            "/api/agents", json={"name": "del-me", "system_prompt": "bye"}
        )

        response = agent_client.delete("/api/agents/del-me")
        assert response.status_code == 204

        # Verify it's gone
        response = agent_client.get("/api/agents/del-me")
        assert response.status_code == 404

    def test_delete_missing_agent_404(self, agent_client):
        response = agent_client.delete("/api/agents/does-not-exist")
        assert response.status_code == 404

    def test_delete_by_other_user_returns_404(self, agent_client):
        """Cross-user delete returns 404 (doesn't leak agent existence)."""
        agent_client.post(
            "/api/agents",
            json={"name": "owned-by-a-del", "system_prompt": "mine"},
            headers={"x-user-id": "user-a"},
        )

        response = agent_client.delete(
            "/api/agents/owned-by-a-del",
            headers={"x-user-id": "user-b"},
        )
        assert response.status_code == 404

    def test_create_agent_with_model_and_tool_groups(self, agent_client):
        payload = {
            "name": "specialized",
            "description": "Specialized agent",
            "model": "deepseek-v3",
            "tool_groups": ["file:read", "bash"],
            "system_prompt": "You are specialized.",
        }
        response = agent_client.post("/api/agents", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["model"] == "deepseek-v3"
        assert data["tool_groups"] == ["file:read", "bash"]

    def test_check_agent_name_available(self, agent_client):
        response = agent_client.get("/api/agents/check?name=free-agent")
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is True
        assert data["name"] == "free-agent"

    def test_check_agent_name_taken(self, agent_client):
        agent_client.post(
            "/api/agents", json={"name": "taken-agent", "system_prompt": "p"}
        )

        response = agent_client.get("/api/agents/check?name=taken-agent")
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False

    def test_agents_are_isolated_between_users(self, agent_client):
        payload = {"name": "shared-name", "system_prompt": "isolation"}
        first = agent_client.post(
            "/api/agents", json=payload, headers={"x-user-id": "user-a"}
        )
        assert first.status_code == 201

        second = agent_client.post(
            "/api/agents", json=payload, headers={"x-user-id": "user-b"}
        )
        assert second.status_code == 201

        listed_a = agent_client.get("/api/agents", headers={"x-user-id": "user-a"})
        listed_b = agent_client.get("/api/agents", headers={"x-user-id": "user-b"})
        assert [a["name"] for a in listed_a.json()["agents"]] == ["shared-name"]
        assert [a["name"] for a in listed_b.json()["agents"]] == ["shared-name"]

    def test_get_agent_scoped_to_owner(self, agent_client):
        """Each user's agent is scoped — user-b can't see user-a's agent."""
        created = agent_client.post(
            "/api/agents",
            json={"name": "private-agent", "system_prompt": "mine"},
            headers={"x-user-id": "user-a"},
        )
        assert created.status_code == 201

        read_b = agent_client.get(
            "/api/agents/private-agent",
            headers={"x-user-id": "user-b"},
        )
        assert read_b.status_code == 404


    def test_update_clear_tool_groups_with_null(self, agent_client):
        """Explicit null clears tool_groups (model_fields_set distinguishes from absent)."""
        agent_client.post(
            "/api/agents",
            json={"name": "clear-tools", "system_prompt": "p", "tool_groups": ["bash", "read"]},
        )

        # Verify created with tool_groups
        get_resp = agent_client.get("/api/agents/clear-tools")
        assert get_resp.status_code == 200
        assert get_resp.json()["tool_groups"] == ["bash", "read"]

        # Clear with explicit null
        response = agent_client.put(
            "/api/agents/clear-tools",
            json={"tool_groups": None},
        )
        assert response.status_code == 200
        assert response.json()["tool_groups"] == []

    def test_update_rejects_empty_system_prompt(self, agent_client):
        """Update with empty or whitespace-only system_prompt returns 422."""
        agent_client.post(
            "/api/agents",
            json={"name": "no-clear-soul", "system_prompt": "valid"},
        )

        # Empty string
        resp = agent_client.put(
            "/api/agents/no-clear-soul",
            json={"system_prompt": ""},
        )
        assert resp.status_code == 422

        # Whitespace only
        resp = agent_client.put(
            "/api/agents/no-clear-soul",
            json={"system_prompt": "   "},
        )
        assert resp.status_code == 422

        # Valid update still works
        resp = agent_client.put(
            "/api/agents/no-clear-soul",
            json={"system_prompt": "still valid"},
        )
        assert resp.status_code == 200

    def test_tenant_shared_agent_creation_and_access(self, agent_client):
        # 1. Non-admin trying to create a shared agent should fail with 403
        payload = {
            "name": "sre-agent-shared",
            "system_prompt": "You are shared.",
            "is_shared": True,
        }
        resp = agent_client.post(
            "/api/agents", json=payload, headers={"x-tenant-role": "tenant_member"}
        )
        assert resp.status_code == 403

        # 2. Tenant admin creates a shared agent - succeeds
        resp = agent_client.post(
            "/api/agents", json=payload, headers={"x-tenant-role": "tenant_admin"}
        )
        assert resp.status_code == 201
        assert resp.json()["is_shared"] is True

        # 3. Check name availability for shared agent
        # Under normal user (is_shared=true in check query has no effect/denied, or checks user's private space)
        resp_check = agent_client.get(
            "/api/agents/check?name=sre-agent-shared&is_shared=true",
            headers={"x-tenant-role": "tenant_member"}
        )
        assert resp_check.json()["available"] is True  # because user's private namespace doesn't have it
        
        # Under tenant_admin
        resp_check_admin = agent_client.get(
            "/api/agents/check?name=sre-agent-shared&is_shared=true",
            headers={"x-tenant-role": "tenant_admin"}
        )
        assert resp_check_admin.json()["available"] is False  # Taken in the shared namespace

        # 4. List agents:
        # A normal user listing their agents shouldn't see it (show_all=False)
        list_user = agent_client.get(
            "/api/agents", headers={"x-tenant-role": "tenant_member"}
        )
        names_user = [a["name"] for a in list_user.json()["agents"]]
        assert "sre-agent-shared" not in names_user

        # A normal user with show_all=True also shouldn't see it (hidden from normal users)
        list_user_all = agent_client.get(
            "/api/agents?show_all=true", headers={"x-tenant-role": "tenant_member"}
        )
        names_user_all = [a["name"] for a in list_user_all.json()["agents"]]
        assert "sre-agent-shared" not in names_user_all

        # A tenant admin listing their agents (show_all=False) should see it
        list_admin = agent_client.get(
            "/api/agents", headers={"x-tenant-role": "tenant_admin"}
        )
        names_admin = [a["name"] for a in list_admin.json()["agents"]]
        assert "sre-agent-shared" in names_admin

        # 5. Get Agent:
        # A normal user trying to get a shared agent should get 404
        get_user = agent_client.get(
            "/api/agents/sre-agent-shared", headers={"x-tenant-role": "tenant_member"}
        )
        assert get_user.status_code == 404

        # A tenant admin can get it
        get_admin = agent_client.get(
            "/api/agents/sre-agent-shared", headers={"x-tenant-role": "tenant_admin"}
        )
        assert get_admin.status_code == 200
        assert get_admin.json()["is_shared"] is True

        # 6. Update Agent:
        # Normal user trying to update it should get 404
        update_user = agent_client.put(
            "/api/agents/sre-agent-shared",
            json={"description": "Stolen"},
            headers={"x-tenant-role": "tenant_member"}
        )
        assert update_user.status_code == 404

        # Tenant admin updates it
        update_admin = agent_client.put(
            "/api/agents/sre-agent-shared",
            json={"description": "Admin update"},
            headers={"x-tenant-role": "tenant_admin"}
        )
        assert update_admin.status_code == 200
        assert update_admin.json()["description"] == "Admin update"

        # 7. Convert private to shared:
        # Create private agent
        agent_client.post(
            "/api/agents",
            json={"name": "private-to-be-shared", "system_prompt": "prompt"},
            headers={"x-tenant-role": "tenant_admin"}
        )
        # Check it is not shared
        get_priv = agent_client.get(
            "/api/agents/private-to-be-shared", headers={"x-tenant-role": "tenant_admin"}
        )
        assert get_priv.json()["is_shared"] is False

        # Share it
        share_priv = agent_client.put(
            "/api/agents/private-to-be-shared",
            json={"is_shared": True},
            headers={"x-tenant-role": "tenant_admin"}
        )
        assert share_priv.status_code == 200
        assert share_priv.json()["is_shared"] is True

        # 8. Delete Agent:
        # Normal user trying to delete shared agent gets 404
        delete_user = agent_client.delete(
            "/api/agents/sre-agent-shared", headers={"x-tenant-role": "tenant_member"}
        )
        assert delete_user.status_code == 404

        # Tenant admin deletes it
        delete_admin = agent_client.delete(
            "/api/agents/sre-agent-shared", headers={"x-tenant-role": "tenant_admin"}
        )
        assert delete_admin.status_code == 204


# ===========================================================================
# 5. Gateway API — Skills endpoint
# ===========================================================================


class TestSkillsAPI:
    def test_list_skills_requires_auth(self, unauth_agent_client):
        response = unauth_agent_client.get("/api/skills")
        assert response.status_code == 401

    def test_list_skills(self, agent_client):
        response = agent_client.get("/api/skills")
        assert response.status_code == 200
        data = response.json()
        assert "skills" in data


# ===========================================================================
# 6. Gateway API — User Profile endpoints (filesystem-based, unchanged)
# ===========================================================================


class TestUserProfileAPI:
    def test_unauthenticated_agents_and_user_profile_return_401(self, unauth_agent_client):
        agents_response = unauth_agent_client.get("/api/agents")
        profile_response = unauth_agent_client.get("/api/user-profile")

        assert agents_response.status_code == 401
        assert profile_response.status_code == 401

    def test_get_user_profile_empty(self, agent_client):
        response = agent_client.get("/api/user-profile")
        assert response.status_code == 200
        assert response.json()["content"] is None

    def test_put_user_profile(self, agent_client, tmp_path):
        # Patch get_paths so USER.md is written to tmp_path
        with patch("app.gateway.routers.agents.get_paths", return_value=_make_paths(tmp_path)):
            content = "# User Profile\n\nI am a developer."
            response = agent_client.put("/api/user-profile", json={"content": content})
            assert response.status_code == 200
            assert response.json()["content"] == content

            # File should be written to disk
            user_md = tmp_path / "tenants" / "tenant-a" / "users" / "user-a" / "USER.md"
            assert user_md.exists()
            assert user_md.read_text(encoding="utf-8") == content

    def test_get_user_profile_after_put(self, agent_client, tmp_path):
        with patch("app.gateway.routers.agents.get_paths", return_value=_make_paths(tmp_path)):
            content = "# Profile\n\nI work on data science."
            agent_client.put("/api/user-profile", json={"content": content})

            response = agent_client.get("/api/user-profile")
            assert response.status_code == 200
            assert response.json()["content"] == content

    def test_put_empty_user_profile_returns_none(self, agent_client, tmp_path):
        with patch("app.gateway.routers.agents.get_paths", return_value=_make_paths(tmp_path)):
            response = agent_client.put("/api/user-profile", json={"content": ""})
            assert response.status_code == 200
            assert response.json()["content"] is None

    def test_user_profile_is_not_shared_between_users(self, agent_client, tmp_path):
        with patch("app.gateway.routers.agents.get_paths", return_value=_make_paths(tmp_path)):
            content = "# Private Profile\n\nOnly user-a should read this."
            write_a = agent_client.put(
                "/api/user-profile",
                json={"content": content},
                headers={"x-user-id": "user-a"},
            )
            assert write_a.status_code == 200

            read_b = agent_client.get(
                "/api/user-profile", headers={"x-user-id": "user-b"}
            )
            assert read_b.status_code == 200
            assert read_b.json()["content"] is None


# ===========================================================================
# 7. Memory isolation: _get_memory_file_path (filesystem-based, unchanged)
# ===========================================================================


class TestMemoryFilePath:
    def test_global_memory_path(self, tmp_path):
        """None agent_name should return global memory file."""
        import deerflow.agents.memory.updater as updater_mod
        from deerflow.config.memory_config import MemoryConfig

        with (
            patch("deerflow.agents.memory.updater.get_paths", return_value=_make_paths(tmp_path)),
            patch("deerflow.agents.memory.updater.get_memory_config", return_value=MemoryConfig(storage_path="")),
        ):
            path = updater_mod._get_memory_file_path(None)
        assert path == tmp_path / "memory.json"

    def test_agent_memory_path(self, tmp_path):
        """Providing agent_name should return per-agent memory file."""
        import deerflow.agents.memory.updater as updater_mod
        from deerflow.config.memory_config import MemoryConfig

        with (
            patch("deerflow.agents.memory.updater.get_paths", return_value=_make_paths(tmp_path)),
            patch("deerflow.agents.memory.updater.get_memory_config", return_value=MemoryConfig(storage_path="")),
        ):
            path = updater_mod._get_memory_file_path("code-reviewer")
        assert path == tmp_path / "agents" / "code-reviewer" / "memory.json"

    def test_different_paths_for_different_agents(self, tmp_path):
        import deerflow.agents.memory.updater as updater_mod
        from deerflow.config.memory_config import MemoryConfig

        with (
            patch("deerflow.agents.memory.updater.get_paths", return_value=_make_paths(tmp_path)),
            patch("deerflow.agents.memory.updater.get_memory_config", return_value=MemoryConfig(storage_path="")),
        ):
            path_global = updater_mod._get_memory_file_path(None)
            path_a = updater_mod._get_memory_file_path("agent-a")
            path_b = updater_mod._get_memory_file_path("agent-b")

        assert path_global != path_a
        assert path_global != path_b
        assert path_a != path_b

    def test_user_memory_path(self, tmp_path):
        """Authenticated user memory should be resolved under users/{user_id}."""
        import deerflow.agents.memory.updater as updater_mod
        from deerflow.config.memory_config import MemoryConfig

        with (
            patch("deerflow.agents.memory.updater.get_paths", return_value=_make_paths(tmp_path)),
            patch("deerflow.agents.memory.updater.get_memory_config", return_value=MemoryConfig(storage_path="")),
        ):
            path = updater_mod._get_memory_file_path(None, user_id="user-123")

        assert path == tmp_path / "users" / "user-123" / "memory.json"

    def test_agent_memory_path_is_user_scoped_when_user_id_present(self, tmp_path):
        import deerflow.agents.memory.updater as updater_mod
        from deerflow.config.memory_config import MemoryConfig

        with (
            patch("deerflow.agents.memory.updater.get_paths", return_value=_make_paths(tmp_path)),
            patch("deerflow.agents.memory.updater.get_memory_config", return_value=MemoryConfig(storage_path="")),
        ):
            path = updater_mod._get_memory_file_path("code-reviewer", user_id="user-123")

        assert path == tmp_path / "users" / "user-123" / "agents" / "code-reviewer" / "memory.json"
