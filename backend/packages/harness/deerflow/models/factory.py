import logging
import functools

import httpx
from langchain.chat_models import BaseChatModel

from deerflow.config import get_app_config, get_tracing_config, is_tracing_enabled
from deerflow.reflection import resolve_class

logger = logging.getLogger(__name__)

OPENAI_COMPATIBLE_MAX_TOKENS = 65536


def _is_openai_compatible_use(use_path: str) -> bool:
    return (
        use_path.startswith("langchain_openai:")
        or use_path.startswith("langchain_openai.")
        or use_path.startswith("langchain_deepseek:")
        or use_path.startswith("langchain_deepseek.")
    )


def _normalize_openai_compatible_max_tokens(model_name: str, use_path: str, settings: dict) -> None:
    """Clamp max_tokens for OpenAI-compatible providers to avoid provider 400 errors."""
    if not _is_openai_compatible_use(use_path):
        return

    max_tokens = settings.get("max_tokens")
    if not isinstance(max_tokens, int):
        return

    if max_tokens < 1:
        logger.warning(
            "Model '%s' configured max_tokens=%s is invalid; clamped to 1 for OpenAI-compatible provider.",
            model_name,
            max_tokens,
        )
        settings["max_tokens"] = 1
        return

    if max_tokens > OPENAI_COMPATIBLE_MAX_TOKENS:
        logger.warning(
            "Model '%s' configured max_tokens=%s exceeds OpenAI-compatible limit %s; clamped.",
            model_name,
            max_tokens,
            OPENAI_COMPATIBLE_MAX_TOKENS,
        )
        settings["max_tokens"] = OPENAI_COMPATIBLE_MAX_TOKENS


def _is_deepseek_model_class(model_class: type[BaseChatModel]) -> bool:
    """Check if the model class is ChatDeepSeek (which defaults to thinking ON)."""
    try:
        from langchain_deepseek import ChatDeepSeek
        return issubclass(model_class, ChatDeepSeek)
    except Exception:
        return False


def _maybe_patch_openai_model_class(use_path: str, model_class: type[BaseChatModel]) -> type[BaseChatModel]:
    """Wrap langchain_openai.ChatOpenAI with DeerFlow compatibility fixes."""
    if not _is_openai_compatible_use(use_path):
        return model_class

    try:
        from langchain_openai import ChatOpenAI

        from deerflow.models.patched_openai import PatchedChatOpenAI
        from deerflow.models.patched_minimax import PatchedChatMiniMax
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.debug("Failed to load PatchedChatOpenAI, using model class as-is: %s", exc)
        return model_class

    if issubclass(model_class, ChatOpenAI):
        if "minimax" in use_path.lower():
            return PatchedChatMiniMax
        return PatchedChatOpenAI
    return model_class


def _maybe_patch_deepseek_model_class(model_class: type[BaseChatModel]) -> type[BaseChatModel]:
    """Wrap langchain_deepseek.ChatDeepSeek with reasoning_content preservation."""
    try:
        from langchain_deepseek import ChatDeepSeek

        from deerflow.models.patched_deepseek import PatchedChatDeepSeek
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.debug("Failed to load PatchedChatDeepSeek, using model class as-is: %s", exc)
        return model_class

    if issubclass(model_class, ChatDeepSeek):
        return PatchedChatDeepSeek
    return model_class


# 数据库模型配置中可能存在的非模型构造参数字段
# 这些字段不应传递给模型构造函数
DATABASE_CONFIG_FIELDS = {
    "enabled",  # 租户分配启用状态
    "assigned_from_global",  # 是否从全局分配
    "assigned_global_model",  # 分配的全局模型名称
    "owner_id",  # 所有者ID
    "tenant_id",  # 租户ID
    "id",  # 数据库主键
    "created_at",  # 创建时间
    "updated_at",  # 更新时间
}


def _wrap_no_tools_model(model_instance: BaseChatModel, model_name: str) -> None:
    if hasattr(model_instance, "_agenerate"):
        _orig_agenerate = model_instance._agenerate

        @functools.wraps(_orig_agenerate)
        async def _wrapped_agenerate(*args, **kwargs):
            try:
                async for chunk in _orig_agenerate(*args, **kwargs):
                    yield chunk
            except Exception as e:
                if _is_tool_not_supported_error(e):
                    raise ValueError(
                        f"模型 '{model_name}' 不支持工具/函数调用，请换用支持工具调用的模型"
                    ) from e
                raise
        model_instance._agenerate = _wrapped_agenerate

    if hasattr(model_instance, "_astream"):
        _orig_astream = model_instance._astream

        @functools.wraps(_orig_astream)
        async def _wrapped_astream(*args, **kwargs):
            try:
                async for chunk in _orig_astream(*args, **kwargs):
                    yield chunk
            except Exception as e:
                if _is_tool_not_supported_error(e):
                    raise ValueError(
                        f"模型 '{model_name}' 不支持工具/函数调用，请换用支持工具调用的模型"
                    ) from e
                raise
        model_instance._astream = _wrapped_astream


def _is_tool_not_supported_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    if "does not support tools" in msg:
        return True
    if "tool" in msg and "not support" in msg:
        return True
    try:
        from ollama._types import ResponseError
        if isinstance(exc, ResponseError):
            if "does not support tools" in str(exc).lower():
                return True
    except ImportError:
        pass
    return False


def create_chat_model(name: str | None = None, thinking_enabled: bool = False, **kwargs) -> BaseChatModel:
    """Create a chat model instance from the config.

    Args:
        name: The name of the model to create. If None, the first model in the config will be used.

    Returns:
        A chat model instance.
    """
    config = get_app_config()
    if name is None:
        name = config.models[0].name
    model_config = config.get_model_config(name)
    if model_config is None:
        raise ValueError(f"Model {name} not found in config") from None
    model_class = resolve_class(model_config.use, BaseChatModel)
    model_class = _maybe_patch_openai_model_class(model_config.use, model_class)
    model_class = _maybe_patch_deepseek_model_class(model_class)
    model_settings_from_config = model_config.model_dump(
        exclude_none=True,
        exclude={
            "use",
            "name",
            "display_name",
            "description",
            "supports_thinking",
            "supports_reasoning_effort",
            "when_thinking_enabled",
            "thinking",
            "supports_vision",
            "supports_tools",
            "supports_text2image",
            "max_input_tokens",
            "reasoning_effort",
            "model_type",
        } | DATABASE_CONFIG_FIELDS,
    )
    # Compute effective when_thinking_enabled by merging in the `thinking` shortcut field.
    # The `thinking` shortcut is equivalent to setting when_thinking_enabled["thinking"].
    has_thinking_settings = (model_config.when_thinking_enabled is not None) or (model_config.thinking is not None)
    effective_wte: dict = dict(model_config.when_thinking_enabled) if model_config.when_thinking_enabled else {}
    if model_config.thinking is not None:
        merged_thinking = {**(effective_wte.get("thinking") or {}), **model_config.thinking}
        effective_wte = {**effective_wte, "thinking": merged_thinking}
    if thinking_enabled and has_thinking_settings:
        if not model_config.supports_thinking:
            raise ValueError(f"Model {name} does not support thinking. Set `supports_thinking` to true in the `config.yaml` to enable thinking.") from None
        if effective_wte:
            model_settings_from_config.update(effective_wte)
    if not thinking_enabled and has_thinking_settings:
        if effective_wte.get("extra_body", {}).get("thinking", {}).get("type"):
            # OpenAI-compatible gateway: thinking is nested under extra_body
            kwargs.update({"extra_body": {"thinking": {"type": "disabled"}}})
            if model_config.supports_reasoning_effort:
                kwargs.update({"reasoning_effort": "minimal"})
        elif effective_wte.get("thinking", {}).get("type"):
            # Native langchain_anthropic: thinking is a direct constructor parameter
            kwargs.update({"thinking": {"type": "disabled"}})
    elif not thinking_enabled and _is_deepseek_model_class(model_class):
        # DeepSeek models default to thinking ON. When thinking is not explicitly
        # configured but subagent/agent requests thinking disabled, send it explicitly.
        kwargs.update({"extra_body": {"thinking": {"type": "disabled"}}})
    if not model_config.supports_reasoning_effort and "reasoning_effort" in kwargs:
        del kwargs["reasoning_effort"]

    # For Codex Responses API models: map thinking mode to reasoning_effort
    from deerflow.models.openai_codex_provider import CodexChatModel

    if issubclass(model_class, CodexChatModel):
        # The ChatGPT Codex endpoint currently rejects max_tokens/max_output_tokens.
        model_settings_from_config.pop("max_tokens", None)

        # Use explicit reasoning_effort from frontend if provided (low/medium/high)
        explicit_effort = kwargs.pop("reasoning_effort", None)
        if not thinking_enabled:
            model_settings_from_config["reasoning_effort"] = "none"
        elif explicit_effort and explicit_effort in ("low", "medium", "high", "xhigh"):
            model_settings_from_config["reasoning_effort"] = explicit_effort
        elif "reasoning_effort" not in model_settings_from_config:
            model_settings_from_config["reasoning_effort"] = "medium"

    _normalize_openai_compatible_max_tokens(name, model_config.use, model_settings_from_config)

    verify_ssl = model_settings_from_config.pop("verify_ssl", False)
    if not verify_ssl:
        kwargs.setdefault("http_client", httpx.Client(verify=False, trust_env=False))
        kwargs.setdefault("http_async_client", httpx.AsyncClient(verify=False, trust_env=False))
    # Internal/custom endpoints may not require API keys — provide a dummy placeholder
    if not model_settings_from_config.get("api_key") and not model_settings_from_config.get("openai_api_key"):
        model_settings_from_config["api_key"] = "not-needed"

    # Map generic api_key to provider-specific parameter names
    _use_lower = model_config.use.lower()
    _api_key_val = model_settings_from_config.get("api_key")
    if "google_genai" in _use_lower and _api_key_val and not model_settings_from_config.get("google_api_key"):
        model_settings_from_config["google_api_key"] = model_settings_from_config.pop("api_key")
    if "anthropic" in _use_lower and _api_key_val and not model_settings_from_config.get("anthropic_api_key"):
        model_settings_from_config["anthropic_api_key"] = model_settings_from_config.pop("api_key")

    # Anthropic requires max_tokens — inject a safe default if not configured
    if "anthropic" in _use_lower and "max_tokens" not in model_settings_from_config:
        model_settings_from_config["max_tokens"] = 8192

    logger.info(
        "Creating model '%s': use=%s, base_url=%s, use_responses_api=%s, output_version=%s, verify_ssl=%s, settings_keys=%s",
        name,
        model_config.use,
        model_settings_from_config.get("base_url"),
        model_settings_from_config.get("use_responses_api"),
        model_settings_from_config.get("output_version"),
        verify_ssl,
        list(model_settings_from_config.keys()),
    )

    model_instance = model_class(**kwargs, **model_settings_from_config)

    if not model_config.supports_tools:
        logger.info("Model '%s' does not support tools; bind_tools will be a no-op.", name)
        model_instance.bind_tools = lambda tools=None, **kw: model_instance
        _wrap_no_tools_model(model_instance, name)

    if is_tracing_enabled():
        try:
            from langchain_core.tracers.langchain import LangChainTracer

            tracing_config = get_tracing_config()
            tracer = LangChainTracer(
                project_name=tracing_config.project,
            )
            existing_callbacks = model_instance.callbacks or []
            model_instance.callbacks = [*existing_callbacks, tracer]
            logger.debug(f"LangSmith tracing attached to model '{name}' (project='{tracing_config.project}')")
        except Exception as e:
            logger.warning(f"Failed to attach LangSmith tracing to model '{name}': {e}")
    return model_instance
