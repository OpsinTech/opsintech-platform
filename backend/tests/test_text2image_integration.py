import pytest
from pathlib import Path
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from unittest.mock import patch, MagicMock

from langgraph.checkpoint.memory import InMemorySaver
from deerflow.database.models import TenantModelConfig
from deerflow.database.secrets_crypto import encrypt_model_settings
from deerflow.database.user_config_service import PLATFORM_MODEL_OWNER_ID
from deerflow.sandbox.tools import _get_selected_image_model, _get_text2image_env, _run_async


@pytest.fixture()
async def t2i_test_db(monkeypatch, tmp_path: Path):
    db_file = tmp_path / "t2i-test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", future=True)

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)

    import deerflow.database.user_config_service as user_config_service
    import deerflow.database.session as session_module

    monkeypatch.setattr(user_config_service, "get_session_factory", lambda: factory)
    monkeypatch.setattr(session_module, "get_session_factory", lambda: factory)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture()
def setup_checkpointer(monkeypatch):
    saver = InMemorySaver()
    import deerflow.agents.checkpointer as cp_module
    monkeypatch.setattr(cp_module, "get_checkpointer", lambda: saver)
    return saver


def test_get_selected_image_model(setup_checkpointer):
    saver = setup_checkpointer
    thread_id = "test-thread-1"
    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}

    # 1. Test when there is no checkpoint
    assert _get_selected_image_model(thread_id) is None

    # 2. Test when checkpoint has messages but no ppt-master context
    checkpoint = {
        "v": 1,
        "id": "1",
        "ts": "2026-06-05T00:00:00Z",
        "channel_values": {
            "messages": [
                {"content": "hello world"}
            ]
        },
        "channel_versions": {"messages": "v1"},
        "versions_seen": {},
        "pending_sends": []
    }
    saver.put(config, checkpoint, {}, {"messages": "v1"})
    assert _get_selected_image_model(thread_id) is None

    # 3. Test when checkpoint contains the ppt-master context but no image_model
    checkpoint2 = {
        "v": 1,
        "id": "2",
        "ts": "2026-06-05T00:01:00Z",
        "channel_values": {
            "messages": [
                {"content": "hello world"},
                {"content": "[SYSTEM CONTEXT: ppt-master]\n- template_path: default"}
            ]
        },
        "channel_versions": {"messages": "v2"},
        "versions_seen": {},
        "pending_sends": []
    }
    saver.put(config, checkpoint2, {}, {"messages": "v2"})
    assert _get_selected_image_model(thread_id) is None

    # 4. Test when checkpoint contains the ppt-master context and image_model
    checkpoint3 = {
        "v": 1,
        "id": "3",
        "ts": "2026-06-05T00:02:00Z",
        "channel_values": {
            "messages": [
                {"content": "hello world"},
                {"content": "[SYSTEM CONTEXT: ppt-master]\n- template_path: default\n- image_model: OpenAI DALL-E-3"}
            ]
        },
        "channel_versions": {"messages": "v3"},
        "versions_seen": {},
        "pending_sends": []
    }
    saver.put(config, checkpoint3, {}, {"messages": "v3"})
    assert _get_selected_image_model(thread_id) == "OpenAI DALL-E-3"


@pytest.mark.anyio
async def test_get_text2image_env(t2i_test_db, setup_checkpointer, monkeypatch):
    monkeypatch.setenv("DEERFLOW_SECRETS_ENCRYPTION_KEY", "unit-test-key")
    
    saver = setup_checkpointer
    thread_id = "test-thread-2"
    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}

    # Write selected model to checkpoint
    checkpoint = {
        "v": 1,
        "id": "1",
        "ts": "2026-06-05T00:00:00Z",
        "channel_values": {
            "messages": [
                {"content": "[SYSTEM CONTEXT: ppt-master]\n- image_model: test-openai-model"}
            ]
        },
        "channel_versions": {"messages": "v1"},
        "versions_seen": {},
        "pending_sends": []
    }
    saver.put(config, checkpoint, {}, {"messages": "v1"})

    # Seed model to DB (as global model)
    async with t2i_test_db() as session:
        encrypted_settings = encrypt_model_settings({
            "api_key": "sk-test-openai-key",
            "base_url": "https://api.openai.com/v1"
        })
        session.add(TenantModelConfig(
            user_id=PLATFORM_MODEL_OWNER_ID,
            name="test-openai-model",
            model="gpt-4",
            use="langchain_openai.ChatOpenAI",
            settings=encrypted_settings,
            supports_text2image=True
        ))
        await session.commit()

    # Get env using _get_text2image_env
    env = _get_text2image_env(user_id="any-user", tenant_id=None, thread_id=thread_id)
    assert env == {
        "IMAGE_BACKEND": "openai",
        "OPENAI_API_KEY": "sk-test-openai-key",
        "OPENAI_BASE_URL": "https://api.openai.com/v1"
    }

    # Now test with a gemini model (as user private model)
    checkpoint_gemini = {
        "v": 1,
        "id": "2",
        "ts": "2026-06-05T00:01:00Z",
        "channel_values": {
            "messages": [
                {"content": "[SYSTEM CONTEXT: ppt-master]\n- image_model: test-gemini-model"}
            ]
        },
        "channel_versions": {"messages": "v2"},
        "versions_seen": {},
        "pending_sends": []
    }
    saver.put(config, checkpoint_gemini, {}, {"messages": "v2"})

    async with t2i_test_db() as session:
        encrypted_gemini_settings = encrypt_model_settings({
            "api_key": "gemini-key-123",
            "base_url": "https://gemini.googleapis.com"
        })
        session.add(TenantModelConfig(
            user_id="test-user-id",
            tenant_id="tenant-a",
            name="test-gemini-model",
            model="gemini-1.5-pro",
            use="langchain_google_genai.ChatGoogleGenerativeAI",
            settings=encrypted_gemini_settings,
            supports_text2image=True
        ))
        await session.commit()

    env_gemini = _get_text2image_env(user_id="test-user-id", tenant_id="tenant-a", thread_id=thread_id)
    assert env_gemini == {
        "IMAGE_BACKEND": "gemini",
        "GEMINI_API_KEY": "gemini-key-123",
        "GOOGLE_API_KEY": "gemini-key-123",
        "GEMINI_BASE_URL": "https://gemini.googleapis.com"
    }

    # Test "None" choice
    checkpoint_none = {
        "v": 1,
        "id": "3",
        "ts": "2026-06-05T00:02:00Z",
        "channel_values": {
            "messages": [
                {"content": "[SYSTEM CONTEXT: ppt-master]\n- image_model: None"}
            ]
        },
        "channel_versions": {"messages": "v3"},
        "versions_seen": {},
        "pending_sends": []
    }
    saver.put(config, checkpoint_none, {}, {"messages": "v3"})

    env_none = _get_text2image_env(user_id="test-user-id", tenant_id="tenant-a", thread_id=thread_id)
    assert env_none == {}
