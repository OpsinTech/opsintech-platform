import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from deerflow.database.secrets_crypto import (
    decrypt_app_payload,
    decrypt_extensions_payload,
    decrypt_mcp_server_payload,
    decrypt_model_settings,
)

_DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///.opsintech/tenant.db"


def _to_sync_db_url(db_url: str) -> str:
    normalized = db_url.strip()
    if normalized.startswith("sqlite+aiosqlite://"):
        return normalized.replace("sqlite+aiosqlite://", "sqlite+pysqlite://", 1)
    if normalized.startswith("postgresql+asyncpg://"):
        return normalized.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    return normalized


def _sqlite_db_path_from_url(db_url: str) -> Path | None:
    """Extract filesystem path from sqlite URL, if URL is sqlite."""
    if not db_url.startswith("sqlite"):
        return None

    raw_path = db_url.split(":///", maxsplit=1)[-1]
    normalized_path = raw_path[1:] if raw_path.startswith("/") else raw_path
    return Path(normalized_path)


def _resolve_config_path() -> Path | None:
    if os.getenv("OPSINTECH_CONFIG_PATH"):
        path = Path(os.getenv("OPSINTECH_CONFIG_PATH"))
        return path if path.exists() else None

    cwd = Path(os.getcwd())
    for candidate in [cwd / "config.yaml", cwd.parent / "config.yaml"]:
        if candidate.exists():
            return candidate
    return None


def _resolve_db_url_from_config() -> str | None:
    config_path = _resolve_config_path()
    if config_path is None:
        return _to_sync_db_url(_DEFAULT_DATABASE_URL)

    with open(config_path, encoding="utf-8") as f:
        config_data = yaml.safe_load(f) or {}

    db_url = config_data.get("database", {}).get("url")
    if not isinstance(db_url, str) or not db_url.strip():
        return _to_sync_db_url(_DEFAULT_DATABASE_URL)

    normalized = db_url.strip()
    if normalized.startswith("$"):
        env_value = os.getenv(normalized[1:])
        if env_value:
            normalized = env_value.strip()
        else:
            return _to_sync_db_url(_DEFAULT_DATABASE_URL)

    if normalized.startswith("sqlite"):
        sqlite_path = _sqlite_db_path_from_url(normalized)
        if sqlite_path is not None:
            if not sqlite_path.exists() or sqlite_path.stat().st_size == 0:
                if "data/" in str(sqlite_path):
                    backend_root = Path(__file__).resolve().parents[4]
                    opsintech_db = backend_root / ".opsintech" / "tenant.db"
                    if opsintech_db.exists() and opsintech_db.stat().st_size > 0:
                        return f"sqlite+pysqlite:///{opsintech_db}"

    return _to_sync_db_url(normalized)


@lru_cache(maxsize=4)
def _get_engine(db_url: str):
    return create_engine(db_url, future=True, pool_pre_ping=True)


def _json_value(raw):
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw


def _query_rows(db_url: str, sql: str, params: dict | None = None) -> list[dict]:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params or {}).fetchall()
    return [dict(row._mapping) for row in rows]


def _scope_where_clause(tenant_id: str | None) -> str:
    if tenant_id is None:
        return "tenant_id IS NULL"
    return "tenant_id = :tenant_id"


def _scope_params(user_id: str, tenant_id: str | None) -> dict[str, str]:
    params = {"user_id": user_id}
    if tenant_id is not None:
        params["tenant_id"] = tenant_id
    return params


def _tenant_shared_model_owner_id(tenant_id: str) -> str:
    return f"__tenant_shared__:{tenant_id}"


def _tenant_shared_mcp_owner_id(tenant_id: str) -> str:
    return f"__tenant_shared_mcp__:{tenant_id}"


def _platform_mcp_owner_id() -> str:
    return "__platform__"


def _resolve_env_variables(value: Any) -> Any:
    if isinstance(value, str):
        if value.startswith("$"):
            env_value = os.getenv(value[1:])
            if env_value is None:
                return ""
            return env_value
        return value
    if isinstance(value, dict):
        return {key: _resolve_env_variables(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve_env_variables(item) for item in value]
    return value


def _resolve_extensions_path() -> Path | None:
    if os.getenv("OPSINTECH_EXTENSIONS_CONFIG_PATH"):
        path = Path(os.getenv("OPSINTECH_EXTENSIONS_CONFIG_PATH"))
        return path if path.exists() else None

    cwd = Path(os.getcwd())
    for candidate in [cwd / "extensions_config.json", cwd.parent / "extensions_config.json", cwd / "mcp_config.json", cwd.parent / "mcp_config.json"]:
        if candidate.exists():
            return candidate
    return None


def _build_default_payloads() -> tuple[dict[str, Any], dict[str, Any]]:
    config_path = _resolve_config_path()
    if config_path is None:
        app_payload: dict[str, Any] = {}
    else:
        with open(config_path, encoding="utf-8") as f:
            app_payload = _resolve_env_variables(yaml.safe_load(f) or {})

    # NOTE: MCP servers and skills are now managed by tenant administrators in the database,
    # not loaded from extensions_config.json file. Return empty defaults.
    ext_payload: dict[str, Any] = {"mcpServers": {}, "skills": {}}

    app_payload = dict(app_payload)
    app_payload["extensions"] = ext_payload
    return app_payload, ext_payload


def _default_mcp_servers() -> dict[str, dict]:
    _, default_ext = _build_default_payloads()
    servers = default_ext.get("mcp_servers") or default_ext.get("mcpServers", {})
    if not isinstance(servers, dict):
        return {}
    return {name: server for name, server in servers.items() if isinstance(server, dict)}


def _default_mcp_payload(server: dict) -> dict:
    return decrypt_mcp_server_payload(
        {
            "enabled": bool(server.get("enabled", True)),
            "type": str(server.get("type", "stdio")),
            "command": server.get("command"),
            "args": server.get("args") if isinstance(server.get("args"), list) else [],
            "env": server.get("env") if isinstance(server.get("env"), dict) else {},
            "url": server.get("url"),
            "headers": server.get("headers") if isinstance(server.get("headers"), dict) else {},
            "oauth": server.get("oauth") if isinstance(server.get("oauth"), dict) else None,
            "description": str(server.get("description", "")),
        }
    )


def _db_mcp_payload(row: dict) -> dict:
    raw_args = row.get("args")
    raw_env = row.get("env")
    raw_headers = row.get("headers")
    raw_oauth = row.get("oauth")
    return decrypt_mcp_server_payload(
        {
            "enabled": bool(row.get("enabled", True)),
            "type": row.get("transport_type") or "stdio",
            "command": row.get("command"),
            "args": _json_value(raw_args) if raw_args is not None else [],
            "env": _json_value(raw_env) if raw_env is not None else {},
            "url": row.get("url"),
            "headers": _json_value(raw_headers) if raw_headers is not None else {},
            "oauth": _json_value(raw_oauth) if raw_oauth is not None else None,
            "description": row.get("description") or "",
        }
    )


PLATFORM_MODEL_OWNER_ID = "__platform__"


def _normalize_use_field(use_value: str | None) -> str:
    """Normalize the 'use' field to use colon separator format.
    
    Converts 'langchain_openai.ChatOpenAI' to 'langchain_openai:ChatOpenAI'
    if the value uses dot notation instead of colon notation.
    """
    if not use_value:
        return "langchain_openai:ChatOpenAI"
    
    # If already has colon, return as-is
    if ":" in use_value:
        return use_value
    
    # Convert dot notation to colon notation
    # Find the last dot and replace with colon
    parts = use_value.rsplit(".", 1)
    if len(parts) == 2:
        return f"{parts[0]}:{parts[1]}"
    
    # Fallback to default if format is unexpected
    return "langchain_openai:ChatOpenAI"


def load_platform_models_from_db() -> list[dict]:
    """Load platform-level model configurations from database.

    Returns list of model config dicts suitable for creating ModelConfig instances.
    """
    db_url = _resolve_db_url_from_config()
    if db_url is None:
        return []

    sqlite_path = _sqlite_db_path_from_url(db_url)
    if sqlite_path is not None and not sqlite_path.exists():
        return []

    try:
        rows = _query_rows(
            db_url,
            """
            SELECT name, model, "use", display_name, description, 
                   supports_thinking, supports_reasoning_effort, supports_vision, supports_text2image, max_input_tokens, settings
            FROM tenant_model_configs
            WHERE user_id = :owner_id AND tenant_id IS NULL
            ORDER BY id
            """,
            {"owner_id": PLATFORM_MODEL_OWNER_ID},
        )
    except SQLAlchemyError:
        return []

    models = []
    for row in rows:
        raw_settings = row.get("settings")
        settings = _json_value(raw_settings) if raw_settings else {}
        if isinstance(settings, dict):
            settings = decrypt_model_settings(settings)
        else:
            settings = {}

        model_config = {
            "name": row["name"],
            "model": row["model"],
            "use": _normalize_use_field(row.get("use")),
            "display_name": row.get("display_name"),
            "description": row.get("description"),
            "supports_thinking": bool(row.get("supports_thinking", False)),
            "supports_reasoning_effort": bool(row.get("supports_reasoning_effort", False)),
            "supports_vision": bool(row.get("supports_vision", False)),
            "supports_text2image": bool(row.get("supports_text2image", False)),
            "max_input_tokens": row.get("max_input_tokens"),
        }
        model_config.update({k: v for k, v in settings.items() if k not in model_config})
        if "supports_tools" not in model_config:
            model_config["supports_tools"] = True
        models.append(model_config)

    return models


def load_enabled_tenant_model_names(tenant_id: str) -> list[str]:
    """Load enabled tenant-assigned model names for the given tenant.

    This reads tenant shared model rows directly from normalized table
    `tenant_model_configs` using the tenant shared owner id convention.
    """
    normalized_tenant_id = str(tenant_id or "").strip()
    if not normalized_tenant_id:
        return []

    db_url = _resolve_db_url_from_config()
    if db_url is None:
        return []

    sqlite_path = _sqlite_db_path_from_url(db_url)
    if sqlite_path is not None and not sqlite_path.exists():
        return []

    owner_id = _tenant_shared_model_owner_id(normalized_tenant_id)

    try:
        rows = _query_rows(
            db_url,
            """
            SELECT name, settings
            FROM tenant_model_configs
            WHERE user_id = :owner_id AND tenant_id = :tenant_id
            ORDER BY id
            """,
            {"owner_id": owner_id, "tenant_id": normalized_tenant_id},
        )
    except SQLAlchemyError:
        return []

    enabled_names: list[str] = []
    for row in rows:
        model_name = str(row.get("name") or "").strip()
        if not model_name:
            continue

        raw_settings = _json_value(row.get("settings")) or {}
        if isinstance(raw_settings, dict):
            settings = decrypt_model_settings(raw_settings)
        else:
            settings = {}

        if bool(settings.get("enabled", True)):
            enabled_names.append(model_name)

    return enabled_names


def load_user_config_payload(user_id: str, tenant_id: str | None = None) -> tuple[dict, dict] | None:
    """Load app/extensions config payloads for a specific user.

    Returns tuple `(app_config_payload, extensions_config_payload)` if found,
    otherwise `None`.

    Supports both sqlite and postgres URLs.
    """
    db_url = _resolve_db_url_from_config()
    if db_url is None:
        return None
    sqlite_path = _sqlite_db_path_from_url(db_url)
    if sqlite_path is not None and not sqlite_path.exists():
        return None

    try:
        try:
            legacy_rows = _query_rows(
                db_url,
                """
                SELECT app_config, extensions_config
                FROM user_configs
                WHERE user_id = :user_id AND tenant_id IS NULL
                LIMIT 1
                """,
                {"user_id": user_id},
            )
        except SQLAlchemyError:
            legacy_rows = _query_rows(
                db_url,
                """
                SELECT app_config, extensions_config
                FROM user_configs
                WHERE user_id = :user_id
                LIMIT 1
                """,
                {"user_id": user_id},
            )
    except SQLAlchemyError:
        return None

    row = legacy_rows[0] if legacy_rows else None

    try:
        model_rows = _query_rows(
            db_url,
            f"""
            SELECT name, model, "use", display_name, description, supports_thinking,
                   supports_reasoning_effort, supports_vision, supports_text2image, max_input_tokens, settings
            FROM tenant_model_configs
            WHERE user_id = :user_id AND {_scope_where_clause(tenant_id)}
            ORDER BY id
            """,
            _scope_params(user_id, tenant_id),
        )
        # Also load tenant-shared models when tenant_id is provided
        if tenant_id is not None:
            try:
                tenant_shared_model_rows = _query_rows(
                    db_url,
                    """
                     SELECT name, model, "use", display_name, description, supports_thinking,
                            supports_reasoning_effort, supports_vision, supports_text2image, max_input_tokens, settings
                     FROM tenant_model_configs
                     WHERE user_id = :owner_id AND tenant_id = :tenant_id
                    ORDER BY id
                    """,
                    {"owner_id": _tenant_shared_model_owner_id(str(tenant_id)), "tenant_id": tenant_id},
                )
                model_rows = model_rows + tenant_shared_model_rows
            except SQLAlchemyError:
                pass
        mcp_rows = _query_rows(
            db_url,
            f"""
            SELECT name, enabled, transport_type, command, args, env, url, headers, oauth, description
            FROM tenant_mcp_servers
            WHERE user_id = :user_id AND {_scope_where_clause(tenant_id)}
            ORDER BY id
            """,
            _scope_params(user_id, tenant_id),
        )
        # Also load tenant-shared MCP rows upfront (same pattern as tenant-shared models above),
        # so the early-return check below is aware of them.
        tenant_shared_mcp_rows: list[dict] = []
        if tenant_id is not None:
            try:
                tenant_shared_mcp_rows = _query_rows(
                    db_url,
                    """
                    SELECT name, enabled, transport_type, command, args, env, url, headers, oauth, description
                    FROM tenant_mcp_servers
                    WHERE user_id = :owner_id AND tenant_id = :tenant_id
                    ORDER BY id
                    """,
                    {"owner_id": _tenant_shared_mcp_owner_id(str(tenant_id)), "tenant_id": tenant_id},
                )
            except SQLAlchemyError:
                pass
        skill_rows = _query_rows(
            db_url,
            f"""
            SELECT name, enabled
            FROM tenant_skills
            WHERE user_id = :user_id AND {_scope_where_clause(tenant_id)}
            ORDER BY id
            """,
            _scope_params(user_id, tenant_id),
        )
    except SQLAlchemyError:
        model_rows = []
        mcp_rows = []
        tenant_shared_mcp_rows = []
        skill_rows = []

    if row is None and not model_rows and not mcp_rows and not tenant_shared_mcp_rows and not skill_rows:
        return None

    raw_app = row["app_config"] if row is not None else {}
    raw_ext = row["extensions_config"] if row is not None else {}

    app_payload = decrypt_app_payload(_json_value(raw_app) or {})
    ext_payload = decrypt_extensions_payload(_json_value(raw_ext) or {})

    if model_rows:
        models = []
        for item in model_rows:
            raw_settings = item["settings"]
            settings = _json_value(raw_settings) or {}
            if isinstance(settings, dict):
                settings = decrypt_model_settings(settings)
            if isinstance(settings, dict) and settings:
                models.append(settings)
            else:
                models.append(
                    {
                        "name": item["name"],
                        "model": item["model"],
                        "use": _normalize_use_field(item["use"]),
                        "display_name": item["display_name"],
                        "description": item["description"],
                        "supports_thinking": bool(item["supports_thinking"]),
                        "supports_reasoning_effort": bool(item["supports_reasoning_effort"]),
                        "supports_vision": bool(item["supports_vision"]),
                        "supports_text2image": bool(item["supports_text2image"]),
                        "max_input_tokens": item.get("max_input_tokens"),
                        "supports_tools": bool(settings.get("supports_tools", True)),
                    }
                )
        app_payload["models"] = models

    if tenant_id is not None:
        default_servers = _default_mcp_servers()
        servers = {name: _default_mcp_payload(server) for name, server in default_servers.items()}

        try:
            global_rows = _query_rows(
                db_url,
                """
                SELECT name, enabled, transport_type, command, args, env, url, headers, oauth, description
                FROM tenant_mcp_servers
                WHERE user_id = :owner_id AND tenant_id IS NULL
                ORDER BY id
                """,
                {"owner_id": _platform_mcp_owner_id()},
            )
        except SQLAlchemyError:
            global_rows = []

        for item in global_rows:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            servers[name] = _db_mcp_payload(item)

        for item in tenant_shared_mcp_rows:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            override_payload = _db_mcp_payload(item)
            if name in default_servers or name in servers:
                base_payload = dict(servers.get(name, {}))
                base_payload["enabled"] = bool(override_payload.get("enabled", True))
                servers[name] = base_payload
            else:
                servers[name] = override_payload

        for item in mcp_rows:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            servers[name] = _db_mcp_payload(item)

        ext_payload["mcpServers"] = servers
    elif mcp_rows:
        servers = {}
        for item in mcp_rows:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            servers[name] = _db_mcp_payload(item)
        ext_payload["mcpServers"] = servers

    if skill_rows:
        ext_payload["skills"] = {item["name"]: {"enabled": bool(item["enabled"])} for item in skill_rows}

    return app_payload, ext_payload


def load_user_skill_records(user_id: str, tenant_id: str | None = None) -> list[dict]:
    """Load per-user skill records from normalized tenant_skills table."""
    db_url = _resolve_db_url_from_config()
    if db_url is None:
        return []
    sqlite_path = _sqlite_db_path_from_url(db_url)
    if sqlite_path is not None and not sqlite_path.exists():
        return []

    try:
        rows = _query_rows(
            db_url,
            f"""
            SELECT name, enabled, category, relative_path, install_dir
            FROM tenant_skills
            WHERE user_id = :user_id AND {_scope_where_clause(tenant_id)}
            ORDER BY id
            """,
            _scope_params(user_id, tenant_id),
        )
    except SQLAlchemyError:
        return []

    result = []
    for row in rows:
        result.append(
            {
                "name": row["name"],
                "enabled": bool(row["enabled"]),
                "category": row.get("category") or "custom",
                "relative_path": row.get("relative_path") or row["name"],
                "install_dir": row.get("install_dir") or "",
            }
        )
    return result
