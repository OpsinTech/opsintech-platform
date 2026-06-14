"""Model error handling middleware that catches LLM call exceptions and converts them to user-friendly AIMessages.

This prevents graph-level failures that would otherwise result in generic
"Internal error" messages on the frontend. Instead, the error is surfaced as
an AI message in the conversation, allowing the user to understand what went
wrong and potentially retry.

When a context_length_exceeded error is detected, the middleware automatically
instructs the agent to summarize the conversation and retry, instead of just
reporting the error.
"""

import logging
from collections.abc import Awaitable, Callable
from typing import override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import ModelCallResult, ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, BaseMessage
from langgraph.errors import GraphBubbleUp

logger = logging.getLogger(__name__)

CONTEXT_BUDGET_WARN_RATIO = 0.8


def _estimate_message_tokens(messages: list[BaseMessage] | None) -> int:
    if not messages:
        return 0
    try:
        from deerflow.agents.memory.prompt import _count_tokens
    except ImportError:
        return 0
    total = 0
    for msg in messages:
        if isinstance(msg.content, str):
            total += _count_tokens(msg.content)
        elif isinstance(msg.content, list):
            for part in msg.content:
                if isinstance(part, dict) and "text" in part:
                    total += _count_tokens(str(part["text"]))
    return total


def _classify_model_error(exc: Exception) -> str:
    """Classify a model error and return a user-friendly message.

    Returns a Chinese message because the primary user base is Chinese-speaking.
    """
    exc_type = type(exc).__name__
    exc_module = type(exc).__module__
    exc_message = str(exc).strip()

    if exc_type == "RateLimitError" or "RateLimitError" in exc_type:
        if "429" in exc_message:
            return "模型请求已限速（429），请稍后重试。如果问题持续，请考虑使用其他模型。"
        return "模型请求已限速，请稍后重试。"

    if exc_type == "AuthenticationError" or "AuthenticationError" in exc_type:
        return "模型认证失败（401），请检查 API 密钥配置是否正确。"

    if exc_type == "BadRequestError" or "BadRequestError" in exc_type:
        if "context_length_exceeded" in exc_message or "max_tokens" in exc_message.lower():
            return (
                "输入内容过长，超出模型上下文限制。"
                "系统已自动触发对话摘要压缩，请重试。"
                "如果问题持续，建议：1) 减少单次请求的内容量 2) 将长文档保存为文件后引用路径 3) 使用更大 context 窗口的模型。"
            )
        if "model" in exc_message.lower() and ("not found" in exc_message.lower() or "does not exist" in exc_message.lower()):
            return f"请求的模型不可用：{_safe_extract_model_name(exc_message)}"
        return f"请求参数错误：{_truncate(exc_message, 200)}"

    if exc_type == "NotFoundError" or "NotFoundError" in exc_type:
        return f"请求的资源不存在：{_truncate(exc_message, 200)}"

    if exc_type == "APIConnectionError" or "APIConnectionError" in exc_type:
        return "无法连接到模型服务，请检查网络连接或稍后重试。"

    if exc_type == "APITimeoutError" or "APITimeoutError" in exc_type:
        return "模型请求超时，请稍后重试。"

    if exc_type == "InternalServerError" or "InternalServerError" in exc_type:
        return "模型服务内部错误，请稍后重试。"

    if exc_type == "TypeError" and "null" in exc_message and "choices" in exc_message:
        return "模型返回了无效响应（空结果），请重试。"

    if "rate limit" in exc_message.lower() or "ratelimit" in exc_message.lower():
        return "模型请求已限速，请稍后重试。"

    if "quota" in exc_message.lower():
        return "模型配额已用尽，请联系管理员或使用其他模型。"

    if "insufficient_quota" in exc_message or "billing" in exc_message.lower():
        return "模型配额不足，请联系管理员。"

    if "context_length" in exc_message or "max context" in exc_message.lower():
        return (
            "输入内容过长，超出模型上下文限制。"
            "系统已自动触发对话摘要压缩，请重试。"
            "如果问题持续，建议将长文档引用为文件路径而非内联内容。"
        )

    if "No model" in exc_message and "specified" in exc_message:
        return "未选择模型，请先选择一个可用的模型。"

    if "model" in exc_message.lower() and ("not found" in exc_message.lower() or "not available" in exc_message.lower()):
        return f"模型不可用：{_truncate(exc_message, 200)}"

    return f"模型调用失败（{exc_type}）：{_truncate(exc_message, 200)}"


def _safe_extract_model_name(message: str) -> str:
    try:
        import re
        match = re.search(r"model['\"\s:]+([a-zA-Z0-9_/\-\.]+)", message, re.IGNORECASE)
        if match:
            return match.group(1)
    except Exception:
        pass
    return ""


def _truncate(text: str, max_len: int = 200) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


class ModelErrorHandlingMiddleware(AgentMiddleware[AgentState]):
    """Catch model call exceptions and convert them to user-friendly AIMessages.

    When the LLM call fails (rate limit, auth error, invalid response, etc.),
    this middleware intercepts the exception and returns an AIMessage describing
    the error. This prevents the graph from failing with a generic "Internal error"
    and instead surfaces the actual problem to the user.

    Consecutive errors are tracked. When the same error type repeats 3+ times
    consecutively, the middleware stops converting and re-raises the exception
    to terminate the agent loop (preventing infinite replanning).
    """

    _MAX_CONSECUTIVE_ERRORS = 3

    def __init__(self) -> None:
        super().__init__()
        self._consecutive_errors = 0

    def _handle_error(self, exc: Exception) -> AIMessage:
        self._consecutive_errors += 1
        if self._consecutive_errors >= self._MAX_CONSECUTIVE_ERRORS:
            logger.error(
                "Model call failed %d times consecutively, re-raising to terminate agent loop: %s",
                self._consecutive_errors, exc,
            )
            raise

        user_message = _classify_model_error(exc)
        logger.exception(
            "Model call failed (attempt %d/%d), converting to error AIMessage: %s",
            self._consecutive_errors, self._MAX_CONSECUTIVE_ERRORS, user_message,
        )
        return AIMessage(content=f"⚠️ {user_message}")

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        estimated_tokens = _estimate_message_tokens(getattr(request, "messages", None))
        if estimated_tokens > 8000:
            logger.warning(
                "High token count detected before model call: ~%d tokens. "
                "Consider enabling summarization or reducing context.",
                estimated_tokens,
            )
        try:
            result = handler(request)
            self._consecutive_errors = 0
            return result
        except GraphBubbleUp:
            raise
        except Exception as exc:
            return self._handle_error(exc)

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        estimated_tokens = _estimate_message_tokens(getattr(request, "messages", None))
        if estimated_tokens > 8000:
            logger.warning(
                "High token count detected before model call: ~%d tokens. "
                "Consider enabling summarization or reducing context.",
                estimated_tokens,
            )
        try:
            result = await handler(request)
            self._consecutive_errors = 0
            return result
        except GraphBubbleUp:
            raise
        except Exception as exc:
            return self._handle_error(exc)
