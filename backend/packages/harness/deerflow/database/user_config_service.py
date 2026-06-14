import logging
import os
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from sqlalchemy.exc import OperationalError
from sqlmodel import delete, select

from deerflow.config.app_config import AppConfig
from deerflow.config.extensions_config import ExtensionsConfig
from deerflow.database.models import TenantMcpServer, TenantModelConfig, TenantSkill, UserConfig
from deerflow.database.user_config_store import _build_default_payloads
from deerflow.database.secrets_crypto import (
    decrypt_app_payload,
    decrypt_extensions_payload,
    decrypt_mcp_server_payload,
    decrypt_model_settings,
    encrypt_app_payload,
    encrypt_extensions_payload,
    encrypt_mcp_server_payload,
    encrypt_model_settings,
)
from deerflow.database.session import get_session_factory
from deerflow.skills import get_skills_root_path, load_skills


def _config_scope_clause(model, tenant_id: str | None):
    """Build a reusable tenant scope filter for normalized config tables."""
    if tenant_id is None:
        return model.tenant_id.is_(None)
    return model.tenant_id == tenant_id


async def _get_user_config_record(session, user_id: str, tenant_id: str | None) -> UserConfig | None:
    """Return the legacy/scoped user config row for a specific user+tenant scope."""
    return await session.scalar(
        select(UserConfig).where(
            UserConfig.user_id == user_id,
            _config_scope_clause(UserConfig, tenant_id),
        )
    )


def _is_missing_user_configs_table_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "no such table" in message and "user_configs" in message


def _is_tenant_config_strict_enabled() -> bool:
    value = str(os.getenv("DEERFLOW_TENANT_CONFIG_STRICT", "") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _extract_model_rows(
    user_id: str,
    app_payload: dict[str, Any],
    *,
    tenant_id: str | None = None,
) -> list[TenantModelConfig]:
    payload = decrypt_app_payload(dict(app_payload or {}))
    raw_models = payload.get("models")
    if not isinstance(raw_models, list):
        return []

    rows: list[TenantModelConfig] = []
    for item in raw_models:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "") or "").strip()
        model_name = str(item.get("model", "") or "").strip()
        use = str(item.get("use", "") or "").strip() or "langchain_openai.ChatOpenAI"
        if not name or not model_name:
            continue

        settings = dict(item)
        settings["name"] = name
        settings["model"] = model_name
        settings["use"] = use

        rows.append(
            TenantModelConfig(
                user_id=user_id,
                tenant_id=tenant_id,
                name=name,
                model=model_name,
                use=use,
                display_name=item.get("display_name"),
                description=item.get("description"),
                supports_thinking=bool(item.get("supports_thinking", False)),
                supports_reasoning_effort=bool(item.get("supports_reasoning_effort", False)),
                supports_vision=bool(item.get("supports_vision", False)),
                settings=encrypt_model_settings(settings),
            )
        )

    return rows


def _model_rows_to_payload(rows: Iterable[TenantModelConfig]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for row in rows:
        settings = decrypt_model_settings(dict(row.settings or {}))
        item = dict(settings)
        item["name"] = row.name
        item["model"] = row.model
        item["use"] = row.use
        item["display_name"] = row.display_name
        item["description"] = row.description
        item["supports_thinking"] = bool(row.supports_thinking)
        item["supports_reasoning_effort"] = bool(row.supports_reasoning_effort)
        item["supports_vision"] = bool(row.supports_vision)
        item["enabled"] = bool(settings.get("enabled", True))
        payload.append(item)
    return payload


def _extract_mcp_rows(
    user_id: str,
    ext_payload: dict[str, Any],
    *,
    tenant_id: str | None = None,
) -> list[TenantMcpServer]:
    payload = decrypt_extensions_payload(dict(ext_payload or {}))
    raw_servers = payload.get("mcpServers")
    if not isinstance(raw_servers, dict):
        raw_servers = payload.get("mcp_servers")
    if not isinstance(raw_servers, dict):
        return []

    rows: list[TenantMcpServer] = []
    for name, server in raw_servers.items():
        if not isinstance(server, dict):
            continue

        server_name = str(name or "").strip()
        if not server_name:
            continue

        secured = encrypt_mcp_server_payload(server)
        rows.append(
            TenantMcpServer(
                user_id=user_id,
                tenant_id=tenant_id,
                name=server_name,
                enabled=bool(secured.get("enabled", True)),
                transport_type=str(secured.get("type", "stdio")),
                command=secured.get("command"),
                args=secured.get("args") if isinstance(secured.get("args"), list) else [],
                env=secured.get("env") if isinstance(secured.get("env"), dict) else {},
                url=secured.get("url"),
                headers=secured.get("headers") if isinstance(secured.get("headers"), dict) else {},
                oauth=secured.get("oauth") if isinstance(secured.get("oauth"), dict) else None,
                description=str(secured.get("description", "")),
            )
        )

    return rows


def _mcp_rows_to_payload(rows: Iterable[TenantMcpServer]) -> dict[str, dict[str, Any]]:
    return {row.name: _mcp_row_to_payload(row) for row in rows}


def _extract_skill_rows(
    user_id: str,
    ext_payload: dict[str, Any],
    *,
    tenant_id: str | None = None,
) -> list[TenantSkill]:
    payload = decrypt_extensions_payload(dict(ext_payload or {}))
    raw_skills = payload.get("skills")
    if not isinstance(raw_skills, dict):
        return []

    rows: list[TenantSkill] = []
    for name, config in raw_skills.items():
        skill_name = str(name or "").strip()
        if not skill_name:
            continue

        enabled = True
        category, relative_path, install_dir = _resolve_skill_fs_metadata(skill_name)
        if isinstance(config, dict):
            enabled = bool(config.get("enabled", True))
            if isinstance(config.get("category"), str) and config.get("category", "").strip():
                category = str(config["category"]).strip()
            if isinstance(config.get("relative_path"), str) and config.get("relative_path", "").strip():
                relative_path = str(config["relative_path"]).strip()
            if isinstance(config.get("install_dir"), str) and config.get("install_dir", "").strip():
                install_dir = str(config["install_dir"]).strip()

        rows.append(
            TenantSkill(
                user_id=user_id,
                tenant_id=tenant_id,
                name=skill_name,
                enabled=enabled,
                category=category,
                relative_path=relative_path,
                install_dir=install_dir,
            )
        )

    return rows


def _skill_rows_to_payload(rows: Iterable[TenantSkill]) -> dict[str, dict[str, Any]]:
    return {row.name: {"enabled": row.enabled} for row in rows}


async def _sync_user_models_to_scope(session, user_id: str, tenant_id: str | None) -> None:
    """Sync normalized model rows back to app_config.models for one scope."""
    config_row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
    if config_row is None:
        return

    model_rows = (
        await session.execute(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == user_id,
                _config_scope_clause(TenantModelConfig, tenant_id),
            )
        )
    ).scalars().all()
    app_payload = decrypt_app_payload(dict(config_row.app_config or {}))
    app_payload["models"] = _model_rows_to_payload(model_rows)
    config_row.app_config = encrypt_app_payload(app_payload)
    session.add(config_row)
    await session.commit()


def _resolve_skill_fs_metadata(skill_name: str) -> tuple[str, str, str]:
    """Resolve skill category, relative path and install dir from filesystem."""
    discovered = next((skill for skill in load_skills(use_config=False, enabled_only=False) if skill.name == skill_name), None)
    if discovered is None:
        fallback_dir = get_skills_root_path() / "custom" / skill_name
        return "custom", skill_name, str(fallback_dir)

    relative = discovered.relative_path.as_posix()
    if relative == ".":
        relative = ""
    return discovered.category, relative, str(discovered.skill_dir)


async def _seed_structured_if_empty(
    session,
    user_id: str,
    app_payload: dict,
    ext_payload: dict,
    tenant_id: str | None,
) -> None:
    existing_model = await session.scalar(
        select(TenantModelConfig.id)
        .where(TenantModelConfig.user_id == user_id, _config_scope_clause(TenantModelConfig, tenant_id))
        .limit(1)
    )
    existing_mcp = await session.scalar(
        select(TenantMcpServer.id)
        .where(TenantMcpServer.user_id == user_id, _config_scope_clause(TenantMcpServer, tenant_id))
        .limit(1)
    )
    existing_skill = await session.scalar(
        select(TenantSkill.id)
        .where(TenantSkill.user_id == user_id, _config_scope_clause(TenantSkill, tenant_id))
        .limit(1)
    )

    if existing_model is None:
        for row in _extract_model_rows(user_id, app_payload, tenant_id=tenant_id):
            session.add(row)

    if existing_mcp is None:
        for row in _extract_mcp_rows(user_id, ext_payload, tenant_id=tenant_id):
            session.add(row)

    if existing_skill is None:
        for row in _extract_skill_rows(user_id, ext_payload, tenant_id=tenant_id):
            session.add(row)


async def _get_scoped_model_rows(session, user_id: str, tenant_id: str | None) -> list[TenantModelConfig]:
    if not tenant_id:
        return (
            await session.execute(
                select(TenantModelConfig).where(TenantModelConfig.user_id == user_id, TenantModelConfig.tenant_id.is_(None))
            )
        ).scalars().all()

    rows = (
        await session.execute(
            select(TenantModelConfig).where(TenantModelConfig.user_id == user_id, TenantModelConfig.tenant_id == tenant_id)
        )
    ).scalars().all()
    if rows or _is_tenant_config_strict_enabled():
        return rows

    return (
        await session.execute(
            select(TenantModelConfig).where(TenantModelConfig.user_id == user_id, TenantModelConfig.tenant_id.is_(None))
        )
    ).scalars().all()


async def _get_scoped_mcp_rows(session, user_id: str, tenant_id: str | None) -> list[TenantMcpServer]:
    if not tenant_id:
        return (
            await session.execute(
                select(TenantMcpServer).where(TenantMcpServer.user_id == user_id, TenantMcpServer.tenant_id.is_(None))
            )
        ).scalars().all()

    rows = (
        await session.execute(
            select(TenantMcpServer).where(TenantMcpServer.user_id == user_id, TenantMcpServer.tenant_id == tenant_id)
        )
    ).scalars().all()
    if rows or _is_tenant_config_strict_enabled():
        return rows

    return (
        await session.execute(
            select(TenantMcpServer).where(TenantMcpServer.user_id == user_id, TenantMcpServer.tenant_id.is_(None))
        )
    ).scalars().all()


async def _get_scoped_skill_rows(session, user_id: str, tenant_id: str | None) -> list[TenantSkill]:
    if not tenant_id:
        return (
            await session.execute(
                select(TenantSkill).where(TenantSkill.user_id == user_id, TenantSkill.tenant_id.is_(None))
            )
        ).scalars().all()

    rows = (
        await session.execute(
            select(TenantSkill).where(TenantSkill.user_id == user_id, TenantSkill.tenant_id == tenant_id)
        )
    ).scalars().all()
    if rows or _is_tenant_config_strict_enabled():
        return rows

    return (
        await session.execute(
            select(TenantSkill).where(TenantSkill.user_id == user_id, TenantSkill.tenant_id.is_(None))
        )
    ).scalars().all()


async def _cleanup_legacy_structured_fields(session, user_id: str, tenant_id: str | None) -> None:
    """Remove already-migrated model/mcp/skill fields from legacy config to prevent re-seeding."""
    config_row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
    if config_row is None:
        return

    cleaned_app = decrypt_app_payload(dict(config_row.app_config or {}))
    cleaned_ext = decrypt_extensions_payload(dict(config_row.extensions_config or {}))
    app_dirty = False
    ext_dirty = False

    if "models" in cleaned_app:
        del cleaned_app["models"]
        app_dirty = True
    for key in ("mcpServers", "mcp_servers", "skills"):
        if key in cleaned_ext:
            del cleaned_ext[key]
            ext_dirty = True

    if app_dirty:
        config_row.app_config = encrypt_app_payload(cleaned_app)
    if ext_dirty:
        config_row.extensions_config = encrypt_extensions_payload(cleaned_ext)
    if app_dirty or ext_dirty:
        session.add(config_row)


async def ensure_user_config(user_id: str, tenant_id: str | None = None) -> UserConfig:
    """Ensure scoped user config row exists and structured rows are seeded."""
    session_factory = get_session_factory()

    async with session_factory() as session:
        existing = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if existing is None:
            fallback = None
            if tenant_id is not None:
                fallback = await _get_user_config_record(session, user_id=user_id, tenant_id=None)

            if fallback is None:
                app_payload, ext_payload = _build_default_payloads()
            else:
                app_payload = decrypt_app_payload(dict(fallback.app_config or {}))
                ext_payload = decrypt_extensions_payload(dict(fallback.extensions_config or {}))

            if tenant_id is not None:
                # Keep only non-structured compatibility fields when creating a new
                # tenant-scoped row; structured tables are tenant-owned and must not
                # inherit another scope's model/mcp/skill rows.
                app_payload = dict(app_payload)
                ext_payload = dict(ext_payload)
                app_payload["models"] = []
                ext_payload["mcpServers"] = {}
                ext_payload["mcp_servers"] = {}
                ext_payload["skills"] = {}

            existing = UserConfig(
                user_id=user_id,
                tenant_id=tenant_id,
                app_config=encrypt_app_payload(app_payload),
                extensions_config=encrypt_extensions_payload(ext_payload),
            )
            session.add(existing)
        else:
            app_payload = decrypt_app_payload(existing.app_config or {})
            ext_payload = decrypt_extensions_payload(existing.extensions_config or {})

        await _seed_structured_if_empty(session, user_id, app_payload, ext_payload, tenant_id=tenant_id)

        await _cleanup_legacy_structured_fields(session, user_id, tenant_id)

        await session.commit()
        await session.refresh(existing)
        return existing


async def get_user_payloads(user_id: str, tenant_id: str | None = None) -> tuple[dict, dict]:
    """Get app/extensions payloads composed from structured tables.

    Tenant-scoped payloads are built from defaults plus tenant-scoped rows.
    Legacy user_configs is used only as a compatibility fallback for non-model/
    non-mcp/non-skill fields.
    """
    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        legacy = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if legacy is None and tenant_id is not None and not _is_tenant_config_strict_enabled():
            legacy = await _get_user_config_record(session, user_id=user_id, tenant_id=None)
        legacy_app = decrypt_app_payload((legacy.app_config if legacy else {}) or {})
        legacy_ext = decrypt_extensions_payload((legacy.extensions_config if legacy else {}) or {})
        default_app, default_ext = _build_default_payloads()

        model_rows = await _get_scoped_model_rows(session, user_id, tenant_id)
        mcp_rows = await _get_scoped_mcp_rows(session, user_id, tenant_id)
        skill_rows = await _get_scoped_skill_rows(session, user_id, tenant_id)

        if tenant_id is not None and not _is_tenant_config_strict_enabled():
            global_legacy = await _get_user_config_record(session, user_id=user_id, tenant_id=None)
            global_app = decrypt_app_payload((global_legacy.app_config if global_legacy else {}) or {})
            global_ext = decrypt_extensions_payload((global_legacy.extensions_config if global_legacy else {}) or {})

            if not model_rows:
                model_rows = _extract_model_rows(user_id=user_id, app_payload=global_app, tenant_id=None)
            if not mcp_rows:
                mcp_rows = _extract_mcp_rows(user_id=user_id, ext_payload=global_ext, tenant_id=None)
            if not skill_rows:
                skill_rows = _extract_skill_rows(user_id=user_id, ext_payload=global_ext, tenant_id=None)

        app_payload = dict(default_app)
        ext_payload = dict(default_ext)
        app_payload.update(legacy_app)
        ext_payload.update(legacy_ext)
        app_payload["models"] = _model_rows_to_payload(model_rows)
        ext_payload["mcpServers"] = _mcp_rows_to_payload(mcp_rows)
        ext_payload["skills"] = _skill_rows_to_payload(skill_rows)
        return app_payload, ext_payload


async def get_user_models(user_id: str, tenant_id: str | None = None) -> list[TenantModelConfig]:
    await ensure_user_config(user_id, tenant_id=tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        return await _get_scoped_model_rows(session, user_id, tenant_id)


async def create_user_model(
    user_id: str,
    model_payload: dict[str, Any],
    tenant_id: str | None = None,
) -> TenantModelConfig:
    """Create a user model row and sync it to the legacy app_config mirror."""
    await ensure_user_config(user_id, tenant_id=tenant_id)

    name = str(model_payload.get("name", "")).strip()
    model_name = str(model_payload.get("model", "")).strip()
    use = str(model_payload.get("use", "")).strip() or "langchain_openai.ChatOpenAI"

    if not name:
        raise ValueError("Model name is required")
    if not model_name:
        raise ValueError("Model identifier is required")

    session_factory = get_session_factory()
    async with session_factory() as session:
        existing = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == user_id,
                TenantModelConfig.name == name,
                TenantModelConfig.tenant_id == tenant_id,
            )
        )
        if existing is not None:
            raise RuntimeError(f"Model '{name}' already exists")

        settings = dict(model_payload)
        settings["name"] = name
        settings["model"] = model_name
        settings["use"] = use
        settings["display_name"] = model_payload.get("display_name")
        settings["description"] = model_payload.get("description")
        settings["supports_thinking"] = bool(model_payload.get("supports_thinking", False))
        settings["supports_reasoning_effort"] = bool(model_payload.get("supports_reasoning_effort", False))
        settings["supports_vision"] = bool(model_payload.get("supports_vision", False))
        settings["supports_tools"] = bool(model_payload.get("supports_tools", True))

        secured_settings = encrypt_model_settings(settings)
        row = TenantModelConfig(
            user_id=user_id,
            tenant_id=tenant_id,
            name=name,
            model=model_name,
            use=use,
            display_name=model_payload.get("display_name"),
            description=model_payload.get("description"),
            supports_thinking=bool(model_payload.get("supports_thinking", False)),
            supports_reasoning_effort=bool(model_payload.get("supports_reasoning_effort", False)),
            supports_vision=bool(model_payload.get("supports_vision", False)),
            settings=secured_settings,
        )
        session.add(row)

        config_row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if config_row is not None:
            app_payload = decrypt_app_payload(dict(config_row.app_config or {}))
            legacy_models = app_payload.get("models") if isinstance(app_payload.get("models"), list) else []
            app_payload["models"] = [*legacy_models, settings]
            config_row.app_config = encrypt_app_payload(app_payload)
            session.add(config_row)

        await session.commit()
        await session.refresh(row)
        return row


async def get_user_mcp_servers(user_id: str, tenant_id: str | None = None) -> list[TenantMcpServer]:
    await ensure_user_config(user_id, tenant_id=tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = await _get_scoped_mcp_rows(session, user_id, tenant_id)
        for row in rows:
            secure = decrypt_mcp_server_payload(
                {
                    "env": row.env or {},
                    "headers": row.headers or {},
                    "oauth": row.oauth,
                }
            )
            row.env = secure.get("env") or {}
            row.headers = secure.get("headers") or {}
            row.oauth = secure.get("oauth") if isinstance(secure.get("oauth"), dict) else None
        return rows


async def replace_user_mcp_servers(
    user_id: str,
    mcp_servers: dict[str, dict[str, Any]],
    tenant_id: str | None = None,
) -> None:
    """Replace all MCP server rows for a user and sync legacy mirror."""
    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        if tenant_id is None:
            await session.execute(delete(TenantMcpServer).where(TenantMcpServer.user_id == user_id))
        else:
            await session.execute(
                delete(TenantMcpServer).where(TenantMcpServer.user_id == user_id, TenantMcpServer.tenant_id == tenant_id)
            )
        for name, server in mcp_servers.items():
            if not isinstance(server, dict):
                continue
            secured = encrypt_mcp_server_payload(server)
            session.add(
                TenantMcpServer(
                    user_id=user_id,
                    tenant_id=tenant_id,
                    name=name,
                    enabled=bool(secured.get("enabled", True)),
                    transport_type=str(secured.get("type", "stdio")),
                    command=secured.get("command"),
                    args=secured.get("args") if isinstance(secured.get("args"), list) else [],
                    env=secured.get("env") if isinstance(secured.get("env"), dict) else {},
                    url=secured.get("url"),
                    headers=secured.get("headers") if isinstance(secured.get("headers"), dict) else {},
                    oauth=secured.get("oauth") if isinstance(secured.get("oauth"), dict) else None,
                    description=str(secured.get("description", "")),
                )
            )

        # keep legacy mirror for existing runtime config getters
        config_row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if config_row is not None:
            ext_payload = decrypt_extensions_payload(dict(config_row.extensions_config or {}))
            ext_payload["mcpServers"] = mcp_servers
            config_row.extensions_config = encrypt_extensions_payload(ext_payload)
            session.add(config_row)

        await session.commit()


async def set_user_skill_enabled(
    user_id: str,
    skill_name: str,
    enabled: bool,
    tenant_id: str | None = None,
) -> None:
    """Upsert a single skill state for a user and sync legacy mirror."""
    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        category, relative_path, install_dir = _resolve_skill_fs_metadata(skill_name)
        row = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == user_id,
                TenantSkill.name == skill_name,
                TenantSkill.tenant_id == tenant_id,
            )
        )
        if row is None:
            row = TenantSkill(
                user_id=user_id,
                tenant_id=tenant_id,
                name=skill_name,
                enabled=enabled,
                category=category,
                relative_path=relative_path,
                install_dir=install_dir,
            )
            session.add(row)
        else:
            row.enabled = enabled
            if not row.install_dir:
                row.category = category
                row.relative_path = relative_path
                row.install_dir = install_dir
            session.add(row)

        config_row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if config_row is not None:
            ext_payload = decrypt_extensions_payload(dict(config_row.extensions_config or {}))
            skills_payload = ext_payload.get("skills") if isinstance(ext_payload.get("skills"), dict) else {}
            skills_payload = dict(skills_payload)
            skills_payload[skill_name] = {"enabled": enabled}
            ext_payload["skills"] = skills_payload
            config_row.extensions_config = encrypt_extensions_payload(ext_payload)
            session.add(config_row)

        await session.commit()


async def update_extensions_payload(user_id: str, payload: dict) -> UserConfig:
    """Compatibility API: replace legacy payload and sync structured rows."""
    await ensure_user_config(user_id, tenant_id=None)

    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(delete(TenantMcpServer).where(TenantMcpServer.user_id == user_id))
        await session.execute(delete(TenantSkill).where(TenantSkill.user_id == user_id))

        for row in _extract_mcp_rows(user_id, payload):
            session.add(row)
        for row in _extract_skill_rows(user_id, payload):
            session.add(row)

        record = await _get_user_config_record(session, user_id=user_id, tenant_id=None)
        if record is None:
            app_payload, _ = _build_default_payloads()
            record = UserConfig(
                user_id=user_id,
                app_config=encrypt_app_payload(app_payload),
                extensions_config=encrypt_extensions_payload(payload),
            )
        else:
            record.extensions_config = encrypt_extensions_payload(payload)
        session.add(record)

        await session.commit()
        await session.refresh(record)
        return record


async def backfill_all_users_from_legacy_payloads() -> int:
    """Backfill normalized tables from legacy user_configs JSON payloads."""
    session_factory = get_session_factory()
    migrated = 0

    async with session_factory() as session:
        users = (await session.execute(select(UserConfig))).scalars().all()
        for user in users:
            if user.tenant_id is not None:
                continue

            await session.execute(
                delete(TenantModelConfig).where(TenantModelConfig.user_id == user.user_id, TenantModelConfig.tenant_id.is_(None))
            )
            await session.execute(
                delete(TenantMcpServer).where(TenantMcpServer.user_id == user.user_id, TenantMcpServer.tenant_id.is_(None))
            )
            await session.execute(
                delete(TenantSkill).where(TenantSkill.user_id == user.user_id, TenantSkill.tenant_id.is_(None))
            )

            for row in _extract_model_rows(user.user_id, user.app_config or {}, tenant_id=None):
                session.add(row)
            for row in _extract_mcp_rows(user.user_id, user.extensions_config or {}, tenant_id=None):
                session.add(row)
            for row in _extract_skill_rows(user.user_id, user.extensions_config or {}, tenant_id=None):
                session.add(row)
            migrated += 1

        await session.commit()

    return migrated


async def upsert_user_skill_record(
    user_id: str,
    skill_name: str,
    *,
    enabled: bool,
    category: str,
    relative_path: str,
    install_dir: str,
    tenant_id: str | None = None,
) -> None:
    """Upsert skill record with explicit install directory metadata."""
    await ensure_user_config(user_id, tenant_id=tenant_id)
    session_factory = get_session_factory()

    async with session_factory() as session:
        row = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == user_id,
                TenantSkill.name == skill_name,
                TenantSkill.tenant_id == tenant_id,
            )
        )
        if row is None:
            row = TenantSkill(
                user_id=user_id,
                tenant_id=tenant_id,
                name=skill_name,
                enabled=enabled,
                category=category,
                relative_path=relative_path,
                install_dir=install_dir,
            )
        else:
            row.enabled = enabled
            row.category = category
            row.relative_path = relative_path
            row.install_dir = install_dir
        session.add(row)

        config_row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if config_row is not None:
            ext_payload = decrypt_extensions_payload(dict(config_row.extensions_config or {}))
            skills_payload = ext_payload.get("skills") if isinstance(ext_payload.get("skills"), dict) else {}
            skills_payload = dict(skills_payload)
            skills_payload[skill_name] = {"enabled": enabled}
            ext_payload["skills"] = skills_payload
            config_row.extensions_config = encrypt_extensions_payload(ext_payload)
            session.add(config_row)

        await session.commit()


async def update_user_model(
    user_id: str,
    model_name: str,
    model_payload: dict[str, Any],
    tenant_id: str | None = None,
) -> TenantModelConfig:
    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == user_id,
                TenantModelConfig.name == model_name,
                TenantModelConfig.tenant_id == tenant_id,
            )
        )
        if not row and tenant_id is not None and not _is_tenant_config_strict_enabled():
            row = await session.scalar(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == user_id,
                    TenantModelConfig.name == model_name,
                    TenantModelConfig.tenant_id.is_(None),
                )
            )
        if not row:
            raise ValueError(f"Model '{model_name}' not found")
        
        # update fields
        if "display_name" in model_payload:
            row.display_name = model_payload["display_name"]
        if "description" in model_payload:
            row.description = model_payload["description"]
        if "model" in model_payload and model_payload["model"] is not None:
            row.model = str(model_payload["model"])
        if "use" in model_payload and model_payload["use"] is not None:
            row.use = str(model_payload["use"])
        if "supports_thinking" in model_payload:
            row.supports_thinking = bool(model_payload["supports_thinking"])
        if "supports_reasoning_effort" in model_payload:
            row.supports_reasoning_effort = bool(model_payload["supports_reasoning_effort"])
        if "supports_vision" in model_payload:
            row.supports_vision = bool(model_payload["supports_vision"])
            
        # Update extra settings in JSON blob
        settings = dict(row.settings or {})
        settings = decrypt_model_settings(settings)
        for k, v in model_payload.items():
            if k != "name":
                settings[k] = v
        settings["model"] = row.model
        settings["use"] = row.use
        row.settings = encrypt_model_settings(settings)
        
        await session.commit()
        await session.refresh(row)
        
        # Sync legacy mirror only for global-scope model updates.
        await _sync_user_models_to_scope(session, user_id, tenant_id)
        
        return row

async def delete_user_model(user_id: str, model_name: str, tenant_id: str | None = None) -> None:
    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == user_id,
                TenantModelConfig.name == model_name,
                TenantModelConfig.tenant_id == tenant_id,
            )
        )
        if not row and tenant_id is not None and not _is_tenant_config_strict_enabled():
            row = await session.scalar(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == user_id,
                    TenantModelConfig.name == model_name,
                    TenantModelConfig.tenant_id.is_(None),
                )
            )
        if not row:
            raise ValueError(f"Model '{model_name}' not found")

        await session.delete(row)
        await session.commit()

        # Sync legacy mirror only for global-scope model deletes.
        await _sync_user_models_to_scope(session, user_id, tenant_id)


async def delete_global_model_with_assignments(model_name: str) -> list[str]:
    """Delete a global model and all its tenant assignments.

    Returns:
        List of tenant IDs where the model was deleted from.

    Raises:
        ValueError: If the global model doesn't exist.
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        # Find the global model
        global_row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == PLATFORM_MODEL_OWNER_ID,
                TenantModelConfig.tenant_id.is_(None),
                TenantModelConfig.name == model_name,
            )
        )
        if not global_row:
            raise ValueError(f"Global model '{model_name}' not found")

        # Find all assigned rows (tenant_id is not null)
        assigned_rows = await session.scalars(
            select(TenantModelConfig).where(
                TenantModelConfig.name == model_name,
                TenantModelConfig.tenant_id.isnot(None),
            )
        )
        assigned_list = list(assigned_rows)
        affected_tenants = [row.tenant_id for row in assigned_list if row.tenant_id]

        # Delete all assigned rows
        for row in assigned_list:
            await session.delete(row)

        # Delete global model
        await session.delete(global_row)
        await session.commit()

        # Sync for each affected tenant
        for tenant_id in affected_tenants:
            owner_id = _tenant_shared_model_owner_id(tenant_id)
            await _sync_user_models_to_scope(session, owner_id, tenant_id)

        return affected_tenants


async def get_current_tenant_id(user_id: str) -> str | None:
    """Get persisted current tenant id for a user, if set."""
    try:
        await ensure_user_config(user_id, tenant_id=None)
    except OperationalError as exc:
        if _is_missing_user_configs_table_error(exc):
            return None
        raise

    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            record = await _get_user_config_record(session, user_id=user_id, tenant_id=None)
        except OperationalError as exc:
            if _is_missing_user_configs_table_error(exc):
                return None
            raise
        if record is None:
            return None

        app_payload = decrypt_app_payload(dict(record.app_config or {}))
        current_tenant_id = app_payload.get("current_tenant_id")
        if isinstance(current_tenant_id, str) and current_tenant_id.strip():
            return current_tenant_id.strip()
        return None


async def set_current_tenant_id(user_id: str, tenant_id: str) -> None:
    """Persist current tenant id for a user."""
    try:
        await ensure_user_config(user_id, tenant_id=None)
    except OperationalError as exc:
        if _is_missing_user_configs_table_error(exc):
            return
        raise

    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            record = await _get_user_config_record(session, user_id=user_id, tenant_id=None)
        except OperationalError as exc:
            if _is_missing_user_configs_table_error(exc):
                return
            raise
        if record is None:
            app_payload, ext_payload = _build_default_payloads()
            app_payload["current_tenant_id"] = tenant_id
            record = UserConfig(
                user_id=user_id,
                tenant_id=None,
                app_config=encrypt_app_payload(app_payload),
                extensions_config=encrypt_extensions_payload(ext_payload),
            )
            session.add(record)
            await session.commit()
            return

        app_payload = decrypt_app_payload(dict(record.app_config or {}))
        app_payload["current_tenant_id"] = tenant_id
        record.app_config = encrypt_app_payload(app_payload)
        session.add(record)
        await session.commit()


PLATFORM_MODEL_OWNER_ID = "__platform__"


def _tenant_shared_model_owner_id(tenant_id: str) -> str:
    return f"__tenant_shared__:{tenant_id}"


def _is_model_enabled(row: TenantModelConfig) -> bool:
    settings = decrypt_model_settings(dict(row.settings or {}))
    return bool(settings.get("enabled", True))


def _effective_permissions_for_scope(
    *,
    scope: str,
    is_tenant_admin: bool,
    is_platform_admin: bool,
) -> list[str]:
    if scope == "global":
        return ["read", "use", "manage"] if is_platform_admin else ["read", "use"]
    if scope == "tenant":
        return ["read", "use", "manage"] if is_tenant_admin else ["read", "use"]
    return ["read", "use", "manage"]


async def get_available_models(
    user_id: str,
    tenant_id: str,
    *,
    is_tenant_admin: bool = False,
    is_platform_admin: bool = False,
) -> list[dict[str, Any]]:
    """Return merged global/tenant/user model list with scope metadata."""
    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        global_rows = (
            await session.execute(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == PLATFORM_MODEL_OWNER_ID,
                    TenantModelConfig.tenant_id.is_(None),
                )
            )
        ).scalars().all()

        tenant_rows = (
            await session.execute(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == _tenant_shared_model_owner_id(tenant_id),
                    TenantModelConfig.tenant_id == tenant_id,
                )
            )
        ).scalars().all()

        user_rows = await _get_scoped_model_rows(session, user_id, tenant_id)

    def _row_to_item(row: TenantModelConfig, scope: str, source: str) -> dict[str, Any]:
        enabled = _is_model_enabled(row)
        return {
            "name": row.name,
            "model": row.model,
            "display_name": row.display_name,
            "description": row.description,
            "supports_thinking": row.supports_thinking,
            "supports_reasoning_effort": row.supports_reasoning_effort,
            "enabled": enabled,
            "scope": scope,
            "source": source,
            "managed_by_current_user": "manage" in _effective_permissions_for_scope(
                scope=scope,
                is_tenant_admin=is_tenant_admin,
                is_platform_admin=is_platform_admin,
            ),
            "effective_permissions": _effective_permissions_for_scope(
                scope=scope,
                is_tenant_admin=is_tenant_admin,
                is_platform_admin=is_platform_admin,
            ),
        }

    items: list[dict[str, Any]] = []
    if is_platform_admin:
        items.extend(_row_to_item(row, "global", "platform_builtin") for row in global_rows)

    for row in tenant_rows:
        item = _row_to_item(row, "tenant", "tenant_shared")
        if item["enabled"] or is_tenant_admin or is_platform_admin:
            items.append(item)

    items.extend(_row_to_item(row, "user", "user_private") for row in user_rows)

    scope_order = {"global": 0, "tenant": 1, "user": 2}
    items.sort(key=lambda item: (scope_order.get(str(item.get("scope")), 99), str(item.get("name", ""))))
    return items


async def list_tenant_shared_models(tenant_id: str) -> list[TenantModelConfig]:
    """List tenant shared models, filtering out orphaned models (those without a global parent)."""
    logger = logging.getLogger(__name__)
    logger.info(f"[list_tenant_shared_models] Processing tenant '{tenant_id}'")
    
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == _tenant_shared_model_owner_id(tenant_id),
                    TenantModelConfig.tenant_id == tenant_id,
                )
            )
        ).scalars().all()
        
        logger.info(f"[list_tenant_shared_models] Found {len(rows)} total rows for tenant '{tenant_id}'")
        for row in list(rows):
            logger.info(f"[list_tenant_shared_models] Row: name={row.name}, user_id={row.user_id}, settings={row.settings}")
        
        # Filter out orphaned models (those whose global parent was deleted)
        valid_rows: list[TenantModelConfig] = []
        for row in list(rows):
            settings = decrypt_model_settings(dict(row.settings or {}))
            logger.info(f"[list_tenant_shared_models] Model '{row.name}': settings={settings}")
            
            if settings.get("assigned_from_global", False):
                # Check if global model still exists
                global_model_name = settings.get("assigned_global_model") or row.name
                logger.info(f"[list_tenant_shared_models] Checking global model '{global_model_name}'")
                
                global_model = await session.scalar(
                    select(TenantModelConfig).where(
                        TenantModelConfig.user_id == PLATFORM_MODEL_OWNER_ID,
                        TenantModelConfig.tenant_id.is_(None),
                        TenantModelConfig.name == global_model_name,
                    )
                )
                if global_model:
                    valid_rows.append(row)
                    logger.info(f"[list_tenant_shared_models] Global model exists, keeping")
                else:
                    # Orphaned model - delete it
                    logger.info(f"[list_tenant_shared_models] Global model NOT found, deleting orphaned model")
                    await session.delete(row)
            else:
                # Not from global - keep it
                logger.info(f"[list_tenant_shared_models] Not from global, keeping")
                valid_rows.append(row)
        
        if len(valid_rows) < len(rows):
            await session.commit()
            logger.info(f"[list_tenant_shared_models] Deleted {len(rows) - len(valid_rows)} orphaned models")
        
        return valid_rows


async def list_platform_assigned_models_for_tenant(tenant_id: str) -> list[TenantModelConfig]:
    owner_id = _tenant_shared_model_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == owner_id,
                    TenantModelConfig.tenant_id == tenant_id,
                )
            )
        ).scalars().all()

        filtered: list[TenantModelConfig] = []
        for row in rows:
            settings = decrypt_model_settings(dict(row.settings or {}))
            if bool(settings.get("assigned_from_global", False)):
                filtered.append(row)
        return filtered


async def list_platform_global_models() -> list[TenantModelConfig]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == PLATFORM_MODEL_OWNER_ID,
                    TenantModelConfig.tenant_id.is_(None),
                )
            )
        ).scalars().all()
        return list(rows)


async def cleanup_orphaned_tenant_models(tenant_id: str) -> list[str]:
    """Clean up tenant model configs that no longer have a corresponding global model.

    This is useful when a global model was deleted but the tenant assignment wasn't cleaned up.

    Returns:
        List of model names that were cleaned up.
    """
    logger = logging.getLogger(__name__)
    logger.info(f"[cleanup_orphaned_tenant_models] Cleaning up orphaned models for tenant '{tenant_id}'")

    session_factory = get_session_factory()
    async with session_factory() as session:
        # Get all tenant shared models for this tenant
        tenant_owner_id = _tenant_shared_model_owner_id(tenant_id)
        tenant_models = await session.scalars(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == tenant_owner_id,
                TenantModelConfig.tenant_id == tenant_id,
            )
        )
        tenant_models_list = list(tenant_models)

        # Check each model to see if the global model still exists
        cleaned_models: list[str] = []
        for model_config in tenant_models_list:
            settings = decrypt_model_settings(dict(model_config.settings or {}))
            assigned_from_global = settings.get("assigned_from_global", False)

            if assigned_from_global:
                # Check if the global model still exists
                global_model_name = settings.get("assigned_global_model") or model_config.name
                global_model = await session.scalar(
                    select(TenantModelConfig).where(
                        TenantModelConfig.user_id == PLATFORM_MODEL_OWNER_ID,
                        TenantModelConfig.tenant_id.is_(None),
                        TenantModelConfig.name == global_model_name,
                    )
                )
                if not global_model:
                    logger.info(f"[cleanup_orphaned_tenant_models] Found orphaned model: {model_config.name} (global model '{global_model_name}' not found)")
                    await session.delete(model_config)
                    cleaned_models.append(model_config.name)

        if cleaned_models:
            await session.commit()
            logger.info(f"[cleanup_orphaned_tenant_models] Cleaned up models: {cleaned_models}")
        else:
            logger.info(f"[cleanup_orphaned_tenant_models] No orphaned models found")

        return cleaned_models


async def delete_orphaned_tenant_model(tenant_id: str, model_name: str | None = None) -> str | None:
    """Delete a specific orphaned tenant model or all orphaned models if model_name is None.

    Returns:
        The deleted model name, or list of deleted model names if model_name was None.
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        tenant_owner_id = _tenant_shared_model_owner_id(tenant_id)

        if model_name:
            # Delete specific model
            row = await session.scalar(
                select(TenantModelConfig).where(
                    TenantModelConfig.user_id == tenant_owner_id,
                    TenantModelConfig.tenant_id == tenant_id,
                    TenantModelConfig.name == model_name,
                )
            )
            if not row:
                raise ValueError(f"Model '{model_name}' not found for tenant '{tenant_id}'")

            await session.delete(row)
            await session.commit()
            return model_name
        else:
            # Delete all orphaned models
            cleaned = await cleanup_orphaned_tenant_models(tenant_id)
            return cleaned if cleaned else None


async def assign_platform_model_to_tenant(
    tenant_id: str,
    model_name: str,
    *,
    enabled: bool = True,
) -> TenantModelConfig:
    owner_id = _tenant_shared_model_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        global_row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == PLATFORM_MODEL_OWNER_ID,
                TenantModelConfig.tenant_id.is_(None),
                TenantModelConfig.name == model_name,
            )
        )
        if global_row is None:
            raise ValueError(f"Global model '{model_name}' not found")

        existing = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == owner_id,
                TenantModelConfig.tenant_id == tenant_id,
                TenantModelConfig.name == model_name,
            )
        )

        global_settings = decrypt_model_settings(dict(global_row.settings or {}))
        global_settings["enabled"] = bool(enabled)
        global_settings["assigned_from_global"] = True
        global_settings["assigned_global_model"] = global_row.name
        secured_settings = encrypt_model_settings(global_settings)

        if existing is None:
            existing = TenantModelConfig(
                user_id=owner_id,
                tenant_id=tenant_id,
                name=global_row.name,
                model=global_row.model,
                use=global_row.use,
                display_name=global_row.display_name,
                description=global_row.description,
                supports_thinking=global_row.supports_thinking,
                supports_reasoning_effort=global_row.supports_reasoning_effort,
                supports_vision=global_row.supports_vision,
                settings=secured_settings,
            )
            session.add(existing)
        else:
            existing.model = global_row.model
            existing.use = global_row.use
            existing.display_name = global_row.display_name
            existing.description = global_row.description
            existing.supports_thinking = global_row.supports_thinking
            existing.supports_reasoning_effort = global_row.supports_reasoning_effort
            existing.supports_vision = global_row.supports_vision
            existing.settings = secured_settings
            session.add(existing)

        await session.commit()
        await session.refresh(existing)
        return existing


async def unassign_platform_model_from_tenant(tenant_id: str, model_name: str) -> None:
    owner_id = _tenant_shared_model_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == owner_id,
                TenantModelConfig.tenant_id == tenant_id,
                TenantModelConfig.name == model_name,
            )
        )
        if row is None:
            raise ValueError(f"Model '{model_name}' not assigned to tenant")
        await session.delete(row)
        await session.commit()


async def create_tenant_shared_model(tenant_id: str, model_payload: dict[str, Any]) -> TenantModelConfig:
    name = str(model_payload.get("name", "")).strip()
    model_name = str(model_payload.get("model", "")).strip()
    use = str(model_payload.get("use", "")).strip() or "langchain_openai.ChatOpenAI"

    if not name:
        raise ValueError("Model name is required")
    if not model_name:
        raise ValueError("Model identifier is required")

    owner_id = _tenant_shared_model_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        existing = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == owner_id,
                TenantModelConfig.tenant_id == tenant_id,
                TenantModelConfig.name == name,
            )
        )
        if existing is not None:
            raise RuntimeError(f"Model '{name}' already exists")

        settings = dict(model_payload)
        settings["name"] = name
        settings["model"] = model_name
        settings["use"] = use
        settings["enabled"] = bool(model_payload.get("enabled", True))

        row = TenantModelConfig(
            user_id=owner_id,
            tenant_id=tenant_id,
            name=name,
            model=model_name,
            use=use,
            display_name=model_payload.get("display_name"),
            description=model_payload.get("description"),
            supports_thinking=bool(model_payload.get("supports_thinking", False)),
            supports_reasoning_effort=bool(model_payload.get("supports_reasoning_effort", False)),
            supports_vision=bool(model_payload.get("supports_vision", False)),
            settings=encrypt_model_settings(settings),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


async def update_tenant_shared_model(tenant_id: str, model_name: str, model_payload: dict[str, Any]) -> TenantModelConfig:
    owner_id = _tenant_shared_model_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == owner_id,
                TenantModelConfig.tenant_id == tenant_id,
                TenantModelConfig.name == model_name,
            )
        )
        if row is None:
            raise ValueError(f"Model '{model_name}' not found")

        if "display_name" in model_payload:
            row.display_name = model_payload["display_name"]
        if "description" in model_payload:
            row.description = model_payload["description"]
        if "supports_thinking" in model_payload:
            row.supports_thinking = bool(model_payload["supports_thinking"])
        if "supports_reasoning_effort" in model_payload:
            row.supports_reasoning_effort = bool(model_payload["supports_reasoning_effort"])
        if "supports_vision" in model_payload:
            row.supports_vision = bool(model_payload["supports_vision"])

        settings = decrypt_model_settings(dict(row.settings or {}))
        for key, value in model_payload.items():
            if key not in {"name", "model"}:
                settings[key] = value
        if "enabled" in model_payload:
            settings["enabled"] = bool(model_payload["enabled"])
        row.settings = encrypt_model_settings(settings)

        await session.commit()
        await session.refresh(row)
        return row


async def delete_tenant_shared_model(tenant_id: str, model_name: str) -> None:
    owner_id = _tenant_shared_model_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantModelConfig).where(
                TenantModelConfig.user_id == owner_id,
                TenantModelConfig.tenant_id == tenant_id,
                TenantModelConfig.name == model_name,
            )
        )
        if row is None:
            raise ValueError(f"Model '{model_name}' not found")
        await session.delete(row)
        await session.commit()


def _tenant_shared_skill_owner_id(tenant_id: str) -> str:
    return f"__tenant_shared_skill__:{tenant_id}"


def _normalize_tenant_skill_settings(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "bound_tools": [],
            "prompt_template": None,
            "strategy": None,
        }

    raw_tools = raw.get("bound_tools")
    if isinstance(raw_tools, list):
        tools = [str(item).strip() for item in raw_tools if str(item).strip()]
    else:
        tools = []

    raw_prompt = raw.get("prompt_template")
    prompt_template = str(raw_prompt).strip() if isinstance(raw_prompt, str) else None
    if prompt_template == "":
        prompt_template = None

    raw_strategy = raw.get("strategy")
    strategy = str(raw_strategy).strip() if isinstance(raw_strategy, str) else None
    if strategy == "":
        strategy = None

    return {
        "bound_tools": tools,
        "prompt_template": prompt_template,
        "strategy": strategy,
    }


async def get_tenant_shared_skill_settings(tenant_id: str) -> dict[str, dict[str, Any]]:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    await ensure_user_config(owner_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await _get_user_config_record(session, user_id=owner_id, tenant_id=tenant_id)
        if row is None:
            return {}

        ext_payload = decrypt_extensions_payload(dict(row.extensions_config or {}))
        raw_settings = ext_payload.get("tenant_skill_settings")
        if not isinstance(raw_settings, dict):
            return {}

        settings: dict[str, dict[str, Any]] = {}
        for skill_name, value in raw_settings.items():
            if not isinstance(skill_name, str) or not skill_name.strip():
                continue
            settings[skill_name] = _normalize_tenant_skill_settings(value)
        return settings


async def update_tenant_shared_skill_settings(
    tenant_id: str,
    skill_name: str,
    *,
    bound_tools: list[str] | None = None,
    prompt_template: str | None = None,
    strategy: str | None = None,
) -> dict[str, Any]:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    name = skill_name.strip()
    if not name:
        raise ValueError("Skill name is required")

    await ensure_user_config(owner_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await _get_user_config_record(session, user_id=owner_id, tenant_id=tenant_id)
        if row is None:
            raise ValueError("Tenant skill config row not found")

        ext_payload = decrypt_extensions_payload(dict(row.extensions_config or {}))
        raw_settings = ext_payload.get("tenant_skill_settings")
        if not isinstance(raw_settings, dict):
            raw_settings = {}

        current = _normalize_tenant_skill_settings(raw_settings.get(name))
        if bound_tools is not None:
            current["bound_tools"] = [item.strip() for item in bound_tools if isinstance(item, str) and item.strip()]
        if prompt_template is not None:
            current["prompt_template"] = prompt_template.strip() or None
        if strategy is not None:
            current["strategy"] = strategy.strip() or None

        raw_settings[name] = current
        ext_payload["tenant_skill_settings"] = raw_settings
        row.extensions_config = encrypt_extensions_payload(ext_payload)
        session.add(row)
        await session.commit()
        return current


async def delete_tenant_shared_skill_settings(tenant_id: str, skill_name: str) -> None:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    name = skill_name.strip()
    if not name:
        return

    await ensure_user_config(owner_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await _get_user_config_record(session, user_id=owner_id, tenant_id=tenant_id)
        if row is None:
            return

        ext_payload = decrypt_extensions_payload(dict(row.extensions_config or {}))
        raw_settings = ext_payload.get("tenant_skill_settings")
        if not isinstance(raw_settings, dict):
            return

        if name in raw_settings:
            raw_settings.pop(name, None)
            ext_payload["tenant_skill_settings"] = raw_settings
        row.extensions_config = encrypt_extensions_payload(ext_payload)
        session.add(row)
        await session.commit()


async def get_tenant_personal_skill_settings(tenant_id: str, user_id: str) -> dict[str, dict[str, Any]]:
    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if row is None:
            return {}

        ext_payload = decrypt_extensions_payload(dict(row.extensions_config or {}))
        raw_settings = ext_payload.get("tenant_skill_settings")
        if not isinstance(raw_settings, dict):
            return {}

        settings: dict[str, dict[str, Any]] = {}
        for skill_name, value in raw_settings.items():
            if not isinstance(skill_name, str) or not skill_name.strip():
                continue
            settings[skill_name] = _normalize_tenant_skill_settings(value)
        return settings


async def update_tenant_personal_skill_settings(
    tenant_id: str,
    user_id: str,
    skill_name: str,
    *,
    bound_tools: list[str] | None = None,
    prompt_template: str | None = None,
    strategy: str | None = None,
) -> dict[str, Any]:
    name = skill_name.strip()
    if not name:
        raise ValueError("Skill name is required")

    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if row is None:
            raise ValueError("Personal skill config row not found")

        ext_payload = decrypt_extensions_payload(dict(row.extensions_config or {}))
        raw_settings = ext_payload.get("tenant_skill_settings")
        if not isinstance(raw_settings, dict):
            raw_settings = {}

        current = _normalize_tenant_skill_settings(raw_settings.get(name))
        if bound_tools is not None:
            current["bound_tools"] = [item.strip() for item in bound_tools if isinstance(item, str) and item.strip()]
        if prompt_template is not None:
            current["prompt_template"] = prompt_template.strip() or None
        if strategy is not None:
            current["strategy"] = strategy.strip() or None

        raw_settings[name] = current
        ext_payload["tenant_skill_settings"] = raw_settings
        row.extensions_config = encrypt_extensions_payload(ext_payload)
        session.add(row)
        await session.commit()
        return current


async def delete_tenant_personal_skill_settings(tenant_id: str, user_id: str, skill_name: str) -> None:
    name = skill_name.strip()
    if not name:
        return

    await ensure_user_config(user_id, tenant_id=tenant_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await _get_user_config_record(session, user_id=user_id, tenant_id=tenant_id)
        if row is None:
            return

        ext_payload = decrypt_extensions_payload(dict(row.extensions_config or {}))
        raw_settings = ext_payload.get("tenant_skill_settings")
        if not isinstance(raw_settings, dict) or name not in raw_settings:
            return

        del raw_settings[name]
        ext_payload["tenant_skill_settings"] = raw_settings
        row.extensions_config = encrypt_extensions_payload(ext_payload)
        session.add(row)
        await session.commit()


async def get_available_skills(
    user_id: str,
    tenant_id: str,
    *,
    is_tenant_admin: bool = False,
    is_platform_admin: bool = False,
) -> list[dict[str, Any]]:
    """Return platform-builtin and tenant-shared skills for the active tenant."""
    await ensure_user_config(user_id, tenant_id=tenant_id)

    discovered = load_skills(use_config=False, enabled_only=False)
    global_skills = [skill for skill in discovered if skill.category == "public"]
    discovered_by_name = {skill.name: skill for skill in discovered}

    tenant_skill_settings = await get_tenant_shared_skill_settings(tenant_id)
    personal_skill_settings = await get_tenant_personal_skill_settings(tenant_id, user_id)

    session_factory = get_session_factory()
    async with session_factory() as session:
        # Fetch both tenant shared skills and user's personal skills
        tenant_shared_id = _tenant_shared_skill_owner_id(tenant_id)
        db_rows = (
            await session.execute(
                select(TenantSkill).where(
                    TenantSkill.tenant_id == tenant_id,
                    TenantSkill.user_id.in_([tenant_shared_id, user_id]),
                )
            )
        ).scalars().all()

        global_skill_names = {skill.name for skill in global_skills}
        # To avoid name conflicts, we prioritize tenant shared skills over personal skills with the same name,
        # or maybe we should keep them separate? Actually, they shouldn't conflict because we enforce uniqueness 
        # on (tenant_id, user_id, name). But if a personal skill has the same name as a shared one, we should
        # probably just return both, or let the UI handle it. We will return all.

    items: list[dict[str, Any]] = []

    global_permissions = ["read", "use"]
    for skill in global_skills:
        # For global skills, we check if there's a tenant shared override to disable it
        override_row = next((r for r in db_rows if r.name == skill.name and r.user_id == tenant_shared_id), None)
        items.append(
            {
                "name": skill.name,
                "description": skill.description,
                "license": skill.license,
                "category": skill.category,
                "enabled": bool(override_row.enabled) if override_row is not None else skill.enabled,
                "scope": "global",
                "source": "platform_builtin",
                "managed_by_current_user": is_tenant_admin or is_platform_admin,
                "effective_permissions": global_permissions,
            }
        )

    tenant_permissions = ["read", "use", "manage"] if is_tenant_admin else ["read", "use"]
    personal_permissions = ["read", "use", "manage"]

    for row in db_rows:
        if row.name in global_skill_names and row.user_id == tenant_shared_id:
            continue  # Already handled as override for global

        resolved = discovered_by_name.get(row.name)
        
        if row.user_id == tenant_shared_id:
            scope = "tenant"
            source = "tenant_shared"
            managed = is_tenant_admin or is_platform_admin
            perms = tenant_permissions
            settings = _normalize_tenant_skill_settings(tenant_skill_settings.get(row.name))
        else:
            scope = "personal"
            source = "user_personal"
            managed = True
            perms = personal_permissions
            settings = _normalize_tenant_skill_settings(personal_skill_settings.get(row.name))

        items.append(
            {
                "name": row.name,
                "description": resolved.description if resolved is not None else "",
                "license": resolved.license if resolved is not None else None,
                "category": row.category,
                "enabled": row.enabled,
                "bound_tools": settings["bound_tools"],
                "prompt_template": settings["prompt_template"],
                "strategy": settings["strategy"],
                "scope": scope,
                "source": source,
                "managed_by_current_user": managed,
                "effective_permissions": perms,
                "install_dir": row.install_dir,
                "relative_path": row.relative_path,
            }
        )

    scope_order = {"global": 0, "tenant": 1}
    items.sort(key=lambda item: (scope_order.get(str(item.get("scope")), 99), str(item.get("name", ""))))
    return items


async def list_tenant_shared_skills(tenant_id: str) -> list[TenantSkill]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(TenantSkill).where(
                    TenantSkill.user_id == _tenant_shared_skill_owner_id(tenant_id),
                    TenantSkill.tenant_id == tenant_id,
                )
            )
        ).scalars().all()
        return list(rows)


async def create_tenant_shared_skill(
    tenant_id: str,
    *,
    skill_name: str,
    enabled: bool = True,
    category: str | None = None,
    relative_path: str | None = None,
    install_dir: str | None = None,
) -> TenantSkill:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    name = skill_name.strip()
    if not name:
        raise ValueError("Skill name is required")

    resolved_category, resolved_relative_path, resolved_install_dir = _resolve_skill_fs_metadata(name)
    final_category = (category or resolved_category or "custom").strip() or "custom"
    final_relative_path = (relative_path or resolved_relative_path or name).strip()
    final_install_dir = (install_dir or resolved_install_dir or "").strip()

    session_factory = get_session_factory()
    async with session_factory() as session:
        existing = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == owner_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == name,
            )
        )
        if existing is not None:
            raise RuntimeError(f"Skill '{name}' already exists")

        row = TenantSkill(
            user_id=owner_id,
            tenant_id=tenant_id,
            name=name,
            enabled=enabled,
            category=final_category,
            relative_path=final_relative_path,
            install_dir=final_install_dir,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

async def create_tenant_personal_skill(
    tenant_id: str,
    user_id: str,
    *,
    skill_name: str,
    enabled: bool = True,
    category: str | None = "personal",
    relative_path: str | None = None,
    install_dir: str | None = None,
) -> TenantSkill:
    name = skill_name.strip()
    if not name:
        raise ValueError("Skill name is required")

    # Use user_id as namespace for relative path if not specified
    final_category = (category or "personal").strip() or "personal"
    final_relative_path = (relative_path or f"{user_id}/{name}").strip()
    final_install_dir = (install_dir or "").strip()

    session_factory = get_session_factory()
    async with session_factory() as session:
        existing = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == user_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == name,
            )
        )
        if existing is not None:
            raise RuntimeError(f"Personal Skill '{name}' already exists")

        row = TenantSkill(
            user_id=user_id,
            tenant_id=tenant_id,
            name=name,
            enabled=enabled,
            category=final_category,
            relative_path=final_relative_path,
            install_dir=final_install_dir,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


async def update_tenant_shared_skill(
    tenant_id: str,
    skill_name: str,
    *,
    enabled: bool | None = None,
    category: str | None = None,
) -> TenantSkill:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    name = skill_name.strip()
    if not name:
        raise ValueError("Skill name is required")

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == owner_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == name,
            )
        )
        if row is None:
            raise ValueError(f"Skill '{name}' not found")

        if enabled is not None:
            row.enabled = bool(enabled)
        if category is not None and category.strip():
            row.category = category.strip()

        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

async def update_tenant_personal_skill(
    tenant_id: str,
    user_id: str,
    skill_name: str,
    *,
    enabled: bool | None = None,
    category: str | None = None,
) -> TenantSkill:
    name = skill_name.strip()
    if not name:
        raise ValueError("Skill name is required")

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == user_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == name,
            )
        )
        if row is None:
            raise ValueError(f"Personal Skill '{name}' not found")

        if enabled is not None:
            row.enabled = bool(enabled)
        if category is not None and category.strip():
            row.category = category.strip()

        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

async def delete_tenant_personal_skill(tenant_id: str, user_id: str, skill_name: str) -> None:
    name = skill_name.strip()
    if not name:
        return

    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(
            delete(TenantSkill).where(
                TenantSkill.user_id == user_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == name,
            )
        )
        await session.commit()


async def set_tenant_shared_skill_enabled(tenant_id: str, skill_name: str, enabled: bool) -> TenantSkill:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    category, relative_path, install_dir = _resolve_skill_fs_metadata(skill_name)

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == owner_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == skill_name,
            )
        )

        if row is None:
            row = TenantSkill(
                user_id=owner_id,
                tenant_id=tenant_id,
                name=skill_name,
                enabled=enabled,
                category=category,
                relative_path=relative_path,
                install_dir=install_dir,
            )
        else:
            row.enabled = enabled
            if not row.install_dir:
                row.category = category
                row.relative_path = relative_path
                row.install_dir = install_dir

        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


async def delete_tenant_shared_skill(tenant_id: str, skill_name: str) -> None:
    owner_id = _tenant_shared_skill_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantSkill).where(
                TenantSkill.user_id == owner_id,
                TenantSkill.tenant_id == tenant_id,
                TenantSkill.name == skill_name,
            )
        )
        if row is None:
            raise ValueError(f"Skill '{skill_name}' not found")
        await session.delete(row)
        await session.commit()

    await delete_tenant_shared_skill_settings(tenant_id, skill_name)


def _tenant_shared_mcp_owner_id(tenant_id: str) -> str:
    return f"__tenant_shared_mcp__:{tenant_id}"


def _default_mcp_servers() -> dict[str, dict[str, Any]]:
    _, default_ext = _build_default_payloads()
    servers = default_ext.get("mcp_servers") or default_ext.get("mcpServers", {})
    if not isinstance(servers, dict):
        return {}
    return {name: server for name, server in servers.items() if isinstance(server, dict)}


def _default_mcp_payload(server: dict[str, Any]) -> dict[str, Any]:
    payload = decrypt_mcp_server_payload(
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
    payload["health_status"] = "unknown"
    payload["last_checked_at"] = None
    return payload


def _mcp_row_to_payload(row: TenantMcpServer) -> dict[str, Any]:
    payload = decrypt_mcp_server_payload(
        {
            "enabled": row.enabled,
            "type": row.transport_type,
            "command": row.command,
            "args": row.args or [],
            "env": row.env or {},
            "url": row.url,
            "headers": row.headers or {},
            "oauth": row.oauth,
            "description": row.description,
        }
    )
    payload["health_status"] = row.health_status
    payload["last_checked_at"] = row.last_checked_at.isoformat() if row.last_checked_at else None
    return payload


async def get_available_mcp_servers(
    user_id: str,
    tenant_id: str,
    *,
    is_tenant_admin: bool = False,
    is_platform_admin: bool = False,
) -> list[dict[str, Any]]:
    """Return merged global/tenant/user MCP server list with scope metadata."""
    await ensure_user_config(user_id, tenant_id=tenant_id)

    default_servers = _default_mcp_servers()

    session_factory = get_session_factory()
    async with session_factory() as session:
        global_rows = (
            await session.execute(
                select(TenantMcpServer).where(
                    TenantMcpServer.user_id == PLATFORM_MODEL_OWNER_ID,
                    TenantMcpServer.tenant_id.is_(None),
                )
            )
        ).scalars().all()

        tenant_shared_rows = (
            await session.execute(
                select(TenantMcpServer).where(
                    TenantMcpServer.user_id == _tenant_shared_mcp_owner_id(tenant_id),
                    TenantMcpServer.tenant_id == tenant_id,
                )
            )
        ).scalars().all()

        user_rows = await _get_scoped_mcp_rows(session, user_id, tenant_id)

    if is_platform_admin:
        global_permissions = ["read", "use", "manage"]
    elif is_tenant_admin:
        global_permissions = ["read", "use", "toggle"]
    else:
        global_permissions = ["read", "use"]
    tenant_permissions = ["read", "use", "manage"] if is_tenant_admin else ["read", "use"]

    def _to_item(
        row: TenantMcpServer,
        scope: str,
        source: str,
        permissions: list[str],
        *,
        managed_by_current_user: bool,
    ) -> dict[str, Any]:
        payload = _mcp_row_to_payload(row)
        payload.update(
            {
                "name": row.name,
                "scope": scope,
                "source": source,
                "managed_by_current_user": managed_by_current_user,
                "effective_permissions": permissions,
            }
        )
        return payload

    global_by_name = {row.name: row for row in global_rows}
    tenant_shared_by_name = {row.name: row for row in tenant_shared_rows}
    built_in_names = sorted(set(default_servers) | set(global_by_name))

    items: list[dict[str, Any]] = []
    for name in built_in_names:
        base_row = global_by_name.get(name)
        payload = _mcp_row_to_payload(base_row) if base_row is not None else _default_mcp_payload(default_servers[name])

        tenant_override = tenant_shared_by_name.get(name)
        if tenant_override is not None:
            payload["enabled"] = bool(tenant_override.enabled)

        payload.update(
            {
                "name": name,
                "scope": "global",
                "source": "platform_builtin",
                "is_builtin": True,
                "managed_by_current_user": ("manage" in global_permissions or "toggle" in global_permissions),
                "effective_permissions": global_permissions,
            }
        )
        items.append(payload)

    items.extend(
        _to_item(
            row,
            "tenant",
            "tenant_shared",
            tenant_permissions,
            managed_by_current_user=("manage" in tenant_permissions),
        )
        for row in tenant_shared_rows
        if row.name not in built_in_names
    )
    # Process user-private MCP servers
    # If tenant has disabled a tool with the same name, user's tool should also be disabled
    for row in user_rows:
        payload = _to_item(
            row,
            "user",
            "user_private",
            ["read", "use", "manage"],
            managed_by_current_user=True,
        )
        # Check if tenant has disabled this tool
        tenant_override = tenant_shared_by_name.get(row.name)
        if tenant_override is not None and not bool(tenant_override.enabled):
            payload["enabled"] = False
        items.append(payload)

    scope_order = {"global": 0, "tenant": 1, "user": 2}
    items.sort(key=lambda item: (scope_order.get(str(item.get("scope")), 99), str(item.get("name", ""))))
    return items


async def list_tenant_shared_mcp_servers(tenant_id: str) -> list[TenantMcpServer]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(TenantMcpServer).where(
                    TenantMcpServer.user_id == _tenant_shared_mcp_owner_id(tenant_id),
                    TenantMcpServer.tenant_id == tenant_id,
                )
            )
        ).scalars().all()
        return list(rows)


async def replace_tenant_shared_mcp_servers(tenant_id: str, mcp_servers: dict[str, dict[str, Any]]) -> None:
    owner_id = _tenant_shared_mcp_owner_id(tenant_id)
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(
            delete(TenantMcpServer).where(
                TenantMcpServer.user_id == owner_id,
                TenantMcpServer.tenant_id == tenant_id,
            )
        )

        for name, server in mcp_servers.items():
            if not isinstance(server, dict):
                continue
            secured = encrypt_mcp_server_payload(server)
            session.add(
                TenantMcpServer(
                    user_id=owner_id,
                    tenant_id=tenant_id,
                    name=name,
                    enabled=bool(secured.get("enabled", True)),
                    transport_type=str(secured.get("type", "stdio")),
                    command=secured.get("command"),
                    args=secured.get("args") if isinstance(secured.get("args"), list) else [],
                    env=secured.get("env") if isinstance(secured.get("env"), dict) else {},
                    url=secured.get("url"),
                    headers=secured.get("headers") if isinstance(secured.get("headers"), dict) else {},
                    oauth=secured.get("oauth") if isinstance(secured.get("oauth"), dict) else None,
                    description=str(secured.get("description", "")),
                )
            )

        await session.commit()


async def set_tenant_mcp_server_enabled(
    tenant_id: str,
    server_name: str,
    *,
    enabled: bool,
) -> tuple[TenantMcpServer, str]:
    """Enable or disable a tenant-scope MCP server.

    Returns the updated row and its source classification:
    - "tenant_shared": created and managed by tenant
    - "platform_builtin": system built-in MCP server enabled at tenant scope
    """
    owner_id = _tenant_shared_mcp_owner_id(tenant_id)
    name = server_name.strip()
    if not name:
        raise ValueError("MCP server name is required")

    default_servers = _default_mcp_servers()

    session_factory = get_session_factory()
    async with session_factory() as session:
        row = await session.scalar(
            select(TenantMcpServer).where(
                TenantMcpServer.user_id == owner_id,
                TenantMcpServer.tenant_id == tenant_id,
                TenantMcpServer.name == name,
            )
        )
        source = "tenant_shared"

        if row is None:
            base_row = await session.scalar(
                select(TenantMcpServer).where(
                    TenantMcpServer.user_id == PLATFORM_MODEL_OWNER_ID,
                    TenantMcpServer.tenant_id.is_(None),
                    TenantMcpServer.name == name,
                )
            )
            source = "platform_builtin"

            if base_row is not None:
                base_payload = _mcp_row_to_payload(base_row)
            else:
                default_payload = default_servers.get(name)
                if default_payload is None:
                    raise ValueError(f"MCP server '{name}' not found in tenant scope")
                base_payload = _default_mcp_payload(default_payload)

            row = TenantMcpServer(
                user_id=owner_id,
                tenant_id=tenant_id,
                name=name,
                enabled=bool(enabled),
                transport_type=str(base_payload.get("type", "stdio")),
                command=base_payload.get("command"),
                args=base_payload.get("args") if isinstance(base_payload.get("args"), list) else [],
                env=base_payload.get("env") if isinstance(base_payload.get("env"), dict) else {},
                url=base_payload.get("url"),
                headers=base_payload.get("headers") if isinstance(base_payload.get("headers"), dict) else {},
                oauth=base_payload.get("oauth") if isinstance(base_payload.get("oauth"), dict) else None,
                description=str(base_payload.get("description", "")),
            )
        else:
            row.enabled = bool(enabled)

        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row, source


async def update_mcp_server_health(
    tenant_id: str,
    server_name: str,
    health_status: str,
    last_checked_at: datetime,
) -> None:
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            select(TenantMcpServer).where(
                TenantMcpServer.name == server_name,
                TenantMcpServer.tenant_id == tenant_id,
            )
        )
        rows = result.scalars().all()
        for row in rows:
            row.health_status = health_status
            row.last_checked_at = last_checked_at
        await session.commit()
