from deerflow.database import user_config_store as store
from deerflow.database.secrets_crypto import encrypt_mcp_server_payload, encrypt_model_settings, reset_crypto_cache


def test_load_user_config_payload_supports_non_sqlite(monkeypatch):
    monkeypatch.setattr(store, "_resolve_db_url_from_config", lambda: "postgresql+psycopg://u:p@h/db")

    def fake_query(db_url, sql, params=None):
        assert db_url.startswith("postgresql")
        if "FROM user_configs" in sql:
            return [{"app_config": {"foo": "bar"}, "extensions_config": {"skills": {}}}]
        if "FROM tenant_model_configs" in sql:
            return [
                {
                    "name": "demo",
                    "model": "gpt-4o",
                    "use": "langchain_openai.ChatOpenAI",
                    "display_name": "Demo",
                    "description": "desc",
                    "supports_thinking": True,
                    "supports_reasoning_effort": False,
                    "supports_vision": True,
                    "settings": {"name": "demo", "model": "gpt-4o"},
                }
            ]
        if "FROM tenant_mcp_servers" in sql:
            return []
        if "FROM tenant_skills" in sql:
            return []
        return []

    monkeypatch.setattr(store, "_query_rows", fake_query)

    payload = store.load_user_config_payload("u1")
    assert payload is not None
    app_payload, _ext_payload = payload
    assert app_payload["models"][0]["name"] == "demo"


def test_load_user_skill_records_supports_non_sqlite(monkeypatch):
    monkeypatch.setattr(store, "_resolve_db_url_from_config", lambda: "postgresql+psycopg://u:p@h/db")

    def fake_query(_db_url, sql, params=None):
        if "FROM tenant_skills" in sql:
            return [
                {
                    "name": "skill-a",
                    "enabled": True,
                    "category": "custom",
                    "relative_path": "skill-a",
                    "install_dir": "/tmp/skill-a",
                }
            ]
        return []

    monkeypatch.setattr(store, "_query_rows", fake_query)

    rows = store.load_user_skill_records("u1")
    assert len(rows) == 1
    assert rows[0]["name"] == "skill-a"
    assert rows[0]["enabled"] is True


def test_load_user_config_payload_scopes_structured_rows_by_tenant(monkeypatch):
    monkeypatch.setattr(store, "_resolve_db_url_from_config", lambda: "postgresql+psycopg://u:p@h/db")

    captured: list[tuple[str, dict | None]] = []

    def fake_query(_db_url, sql, params=None):
        captured.append((sql, params))
        if "FROM user_configs" in sql:
            return [{"app_config": {}, "extensions_config": {}}]
        return []

    monkeypatch.setattr(store, "_query_rows", fake_query)

    store.load_user_config_payload("u1", tenant_id="tenant-a")

    structured_params = [
        params
        for sql, params in captured
        if "WHERE user_id = :user_id AND tenant_id = :tenant_id" in sql
    ]
    assert structured_params
    assert all(params == {"user_id": "u1", "tenant_id": "tenant-a"} for params in structured_params)


def test_load_user_config_payload_merges_builtin_and_tenant_mcp_servers(monkeypatch):
    monkeypatch.setattr(store, "_resolve_db_url_from_config", lambda: "postgresql+psycopg://u:p@h/db")
    monkeypatch.setattr(
        store,
        "_default_mcp_servers",
        lambda: {
            "filesystem": {"enabled": True, "type": "stdio", "command": "fs"},
            "github": {"enabled": True, "type": "http", "url": "https://github.example.com"},
        },
    )

    def fake_query(_db_url, sql, params=None):
        if "FROM user_configs" in sql:
            return [{"app_config": {}, "extensions_config": {}}]
        if "FROM tenant_model_configs" in sql:
            return []
        if "WHERE user_id = :owner_id AND tenant_id IS NULL" in sql:
            return [
                {
                    "name": "github",
                    "enabled": False,
                    "transport_type": "http",
                    "command": None,
                    "args": [],
                    "env": {},
                    "url": "https://github.example.com",
                    "headers": {},
                    "oauth": None,
                    "description": "global override",
                }
            ]
        if "WHERE user_id = :owner_id AND tenant_id = :tenant_id" in sql:
            return [
                {
                    "name": "slack",
                    "enabled": True,
                    "transport_type": "http",
                    "command": None,
                    "args": [],
                    "env": {},
                    "url": "https://slack.example.com",
                    "headers": {},
                    "oauth": None,
                    "description": "tenant shared",
                }
            ]
        if "WHERE user_id = :user_id AND tenant_id = :tenant_id" in sql:
            return [
                {
                    "name": "filesystem",
                    "enabled": False,
                    "transport_type": "stdio",
                    "command": "fs",
                    "args": [],
                    "env": {},
                    "url": None,
                    "headers": {},
                    "oauth": None,
                    "description": "tenant toggle",
                }
            ]
        if "FROM tenant_skills" in sql:
            return []
        return []

    monkeypatch.setattr(store, "_query_rows", fake_query)

    payload = store.load_user_config_payload("u1", tenant_id="tenant-a")
    assert payload is not None
    _app_payload, ext_payload = payload
    assert ext_payload["mcpServers"]["filesystem"]["enabled"] is False
    assert ext_payload["mcpServers"]["github"]["enabled"] is False
    assert ext_payload["mcpServers"]["slack"]["url"] == "https://slack.example.com"


def test_load_user_skill_records_scopes_by_tenant(monkeypatch):
    monkeypatch.setattr(store, "_resolve_db_url_from_config", lambda: "postgresql+psycopg://u:p@h/db")

    captured: list[dict | None] = []

    def fake_query(_db_url, sql, params=None):
        if "FROM tenant_skills" in sql:
            captured.append(params)
        return []

    monkeypatch.setattr(store, "_query_rows", fake_query)

    store.load_user_skill_records("u1", tenant_id="tenant-a")
    assert captured == [{"user_id": "u1", "tenant_id": "tenant-a"}]


def test_load_user_config_payload_decrypts_encrypted_secrets(monkeypatch):
    monkeypatch.setenv("DEERFLOW_SECRETS_ENCRYPTION_KEY", "unit-test-key")
    reset_crypto_cache()
    monkeypatch.setattr(store, "_resolve_db_url_from_config", lambda: "postgresql+psycopg://u:p@h/db")

    encrypted_settings = encrypt_model_settings(
        {
            "name": "demo",
            "model": "gpt-4o",
            "api_key": "sk-secret",
        }
    )
    encrypted_mcp = encrypt_mcp_server_payload(
        {
            "enabled": True,
            "type": "http",
            "url": "https://example.com",
            "env": {"OPENAI_API_KEY": "k-1"},
            "headers": {"Authorization": "Bearer token"},
            "oauth": {"client_secret": "oauth-secret"},
            "description": "",
        }
    )

    def fake_query(_db_url, sql, params=None):
        if "FROM user_configs" in sql:
            return [{"app_config": {}, "extensions_config": {}}]
        if "FROM tenant_model_configs" in sql:
            return [
                {
                    "name": "demo",
                    "model": "gpt-4o",
                    "use": "langchain_openai.ChatOpenAI",
                    "display_name": "Demo",
                    "description": "desc",
                    "supports_thinking": True,
                    "supports_reasoning_effort": False,
                    "supports_vision": True,
                    "settings": encrypted_settings,
                }
            ]
        if "FROM tenant_mcp_servers" in sql:
            return [
                {
                    "name": "server-a",
                    "enabled": encrypted_mcp["enabled"],
                    "transport_type": encrypted_mcp["type"],
                    "command": encrypted_mcp.get("command"),
                    "args": encrypted_mcp.get("args", []),
                    "env": encrypted_mcp["env"],
                    "url": encrypted_mcp["url"],
                    "headers": encrypted_mcp["headers"],
                    "oauth": encrypted_mcp["oauth"],
                    "description": encrypted_mcp.get("description", ""),
                }
            ]
        if "FROM tenant_skills" in sql:
            return []
        return []

    monkeypatch.setattr(store, "_query_rows", fake_query)

    payload = store.load_user_config_payload("u1")
    assert payload is not None
    app_payload, ext_payload = payload
    assert app_payload["models"][0]["api_key"] == "sk-secret"
    assert ext_payload["mcpServers"]["server-a"]["env"]["OPENAI_API_KEY"] == "k-1"
    assert ext_payload["mcpServers"]["server-a"]["headers"]["Authorization"] == "Bearer token"
    assert ext_payload["mcpServers"]["server-a"]["oauth"]["client_secret"] == "oauth-secret"


def test_resolve_db_url_from_config_falls_back_to_default_when_database_missing(monkeypatch, tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("config_version: 3\n", encoding="utf-8")

    monkeypatch.setattr(store, "_resolve_config_path", lambda: config_file)

    assert store._resolve_db_url_from_config() == "sqlite+pysqlite:///.opsintech/tenant.db"


def test_resolve_db_url_from_config_supports_env_placeholder(monkeypatch, tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("database:\n  url: $TEST_DB_URL\n", encoding="utf-8")

    monkeypatch.setenv("TEST_DB_URL", "postgresql+psycopg://u:p@h/db")
    monkeypatch.setattr(store, "_resolve_config_path", lambda: config_file)

    assert store._resolve_db_url_from_config() == "postgresql+psycopg://u:p@h/db"


def test_resolve_db_url_from_config_converts_async_sqlite_url_to_sync(monkeypatch, tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text("database:\n  url: sqlite+aiosqlite:///./.opsintech/tenant.db\n", encoding="utf-8")

    monkeypatch.setattr(store, "_resolve_config_path", lambda: config_file)

    assert store._resolve_db_url_from_config() == "sqlite+pysqlite:///./.opsintech/tenant.db"
