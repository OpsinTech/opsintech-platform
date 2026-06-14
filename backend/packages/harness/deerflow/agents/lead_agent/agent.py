from __future__ import annotations

import logging

from langchain.agents import create_agent

from deerflow.agents.lead_agent.prompt import apply_prompt_template
from deerflow.agents.middlewares.summarization_middleware import DeerflowSummarizationMiddleware
from deerflow.agents.middlewares.title_middleware import TitleMiddleware
from deerflow.agents.middlewares.todo_middleware import TodoMiddleware
from deerflow.agents.middlewares.tool_error_handling_middleware import build_lead_runtime_middlewares
from deerflow.agents.middlewares.view_image_middleware import ViewImageMiddleware
from deerflow.config.summarization_config import get_summarization_config
from deerflow.config.title_config import get_title_config
from deerflow.agents.thread_state import ThreadState
from deerflow.config import get_app_config
from deerflow.config.agents_config import load_agent_config
from deerflow.config.tenant_context import tenant_context
from deerflow.database.user_config_store import load_enabled_tenant_model_names
from deerflow.models.factory import create_chat_model

logger = logging.getLogger(__name__)


def _create_summarization_middleware(model_name: str):
    """Create summarization middleware if enabled in config."""
    config = get_summarization_config()
    if config.enabled:
        return DeerflowSummarizationMiddleware(conversation_model_name=model_name)
    return None


def _create_todo_list_middleware(is_plan_mode: bool):
    return TodoMiddleware()


def _build_middlewares(config, model_name: str, agent_name: str | None = None):
    configurable = config.get("configurable", {})
    is_plan_mode = configurable.get("is_plan_mode", False)

    middlewares = list(build_lead_runtime_middlewares(lazy_init=True))

    summarization_middleware = _create_summarization_middleware(model_name)
    if summarization_middleware is not None:
        middlewares.append(summarization_middleware)

    todo_list_middleware = _create_todo_list_middleware(is_plan_mode)
    if todo_list_middleware is not None:
        middlewares.append(todo_list_middleware)

    model_config = get_app_config().get_model_config(model_name)
    if model_config and model_config.supports_vision:
        middlewares.append(ViewImageMiddleware())

    title_config = get_title_config()
    if title_config.enabled:
        middlewares.append(TitleMiddleware())

    return middlewares


def _resolve_model_name(requested_model_name: str | None, *, allowed_model_names: set[str] | None = None) -> str:
    app_config = get_app_config()
    available_names = [model.name for model in app_config.models]

    if not available_names:
        raise ValueError("No models configured")

    if requested_model_name:
        if allowed_model_names is not None and requested_model_name not in allowed_model_names:
            raise ValueError(f"Model '{requested_model_name}' is not available for the current tenant")
        if requested_model_name not in available_names:
            raise ValueError(f"Model '{requested_model_name}' not found in available models: {available_names}")
        return requested_model_name

    if allowed_model_names:
        for name in available_names:
            if name in allowed_model_names:
                return name
        raise ValueError("No tenant-allowed models configured")

    return available_names[0]


def make_lead_agent(config):
    from deerflow.tools import get_available_tools
    from deerflow.tools.builtins import setup_agent

    cfg = config.get("configurable", {})
    runtime_context = config.get("context", {})

    thinking_enabled = cfg.get("thinking_enabled", runtime_context.get("thinking_enabled", True))
    reasoning_effort = cfg.get("reasoning_effort", runtime_context.get("reasoning_effort", None))
    requested_model_name = (
        cfg.get("model_name")
        or cfg.get("model")
        or runtime_context.get("model_name")
        or runtime_context.get("model")
    )
    is_plan_mode = cfg.get("is_plan_mode", runtime_context.get("is_plan_mode", False))
    subagent_enabled = cfg.get("subagent_enabled", runtime_context.get("subagent_enabled", False))
    max_concurrent_subagents = cfg.get("max_concurrent_subagents", runtime_context.get("max_concurrent_subagents", 3))
    is_bootstrap = cfg.get("is_bootstrap", runtime_context.get("is_bootstrap", False))
    agent_name = cfg.get("agent_name") or runtime_context.get("agent_name")
    user_id = cfg.get("user_id") or runtime_context.get("user_id")
    tenant_id = cfg.get("tenant_id") or runtime_context.get("tenant_id")
    skill_name = cfg.get("skill_name") or runtime_context.get("skill_name")

    if runtime_context and "configurable" in config:
        cfg.setdefault("user_id", user_id)
        cfg.setdefault("tenant_id", tenant_id)
        cfg.setdefault("is_plan_mode", is_plan_mode)

    tenant_allowed_model_names: set[str] | None = None
    if isinstance(tenant_id, str) and tenant_id.strip():
        tenant_allowed_model_names = set(load_enabled_tenant_model_names(tenant_id.strip()))

    with tenant_context(user_id=user_id, tenant_id=tenant_id):
        agent_config = load_agent_config(agent_name, user_id=user_id) if not is_bootstrap else None
        agent_model_name = agent_config.model if agent_config and agent_config.model else None

        model_name = _resolve_model_name(
            requested_model_name or agent_model_name,
            allowed_model_names=tenant_allowed_model_names,
        )

        app_config = get_app_config()
        model_config = app_config.get_model_config(model_name) if model_name else None

        if model_config is None:
            raise ValueError("No chat model could be resolved. Please configure at least one model in config.yaml or provide a valid 'model_name'/'model' in the request.")
        if thinking_enabled and not model_config.supports_thinking:
            logger.warning("Thinking mode is enabled but model '%s' does not support it; fallback to non-thinking mode.", model_name)
            thinking_enabled = False

        logger.info(
            "Create Agent(%s) -> thinking_enabled: %s, reasoning_effort: %s, model_name: %s, is_plan_mode: %s, subagent_enabled: %s, max_concurrent_subagents: %s, tenant_id: %s, skill_name: %s",
            agent_name or "default",
            thinking_enabled,
            reasoning_effort,
            model_name,
            is_plan_mode,
            subagent_enabled,
            max_concurrent_subagents,
            tenant_id,
            skill_name,
        )

        if "metadata" not in config:
            config["metadata"] = {}

        config["metadata"].update(
            {
                "agent_name": agent_name or "default",
                "model_name": model_name or "default",
                "thinking_enabled": thinking_enabled,
                "reasoning_effort": reasoning_effort,
                "is_plan_mode": is_plan_mode,
                "subagent_enabled": subagent_enabled,
                "tenant_id": tenant_id,
            }
        )

        if is_bootstrap:
            return create_agent(
                model=create_chat_model(name=model_name, thinking_enabled=thinking_enabled),
                tools=get_available_tools(model_name=model_name, subagent_enabled=subagent_enabled) + [setup_agent],
                middleware=_build_middlewares(config, model_name=model_name),
                system_prompt=apply_prompt_template(
                    subagent_enabled=subagent_enabled,
                    max_concurrent_subagents=max_concurrent_subagents,
                    available_skills={"bootstrap"},
                    user_id=user_id,
                ),
                state_schema=ThreadState,
            )

        agent_skills = set(agent_config.skills) if (agent_config and agent_config.skills is not None) else None
        effective_skills = {skill_name} if skill_name else agent_skills

        return create_agent(
            model=create_chat_model(name=model_name, thinking_enabled=thinking_enabled, reasoning_effort=reasoning_effort),
            tools=get_available_tools(model_name=model_name, groups=agent_config.tool_groups if agent_config else None, subagent_enabled=subagent_enabled),
            middleware=_build_middlewares(config, model_name=model_name, agent_name=agent_name),
            system_prompt=apply_prompt_template(
                subagent_enabled=subagent_enabled,
                max_concurrent_subagents=max_concurrent_subagents,
                agent_name=agent_name,
                available_skills=effective_skills,
                user_id=user_id,
            ),
            state_schema=ThreadState,
        )
