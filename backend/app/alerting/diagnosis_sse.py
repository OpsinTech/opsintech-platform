"""AG-UI Protocol SSE helpers for incident diagnosis streaming.

Implements a subset of the AG-UI (Agent-User Interaction Protocol) standard:
  Lifecycle:   RUN_STARTED, RUN_FINISHED, RUN_ERROR
  Text:        TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END
  Tool calls:  TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT
  Steps:       STEP_STARTED, STEP_FINISHED

Ref: https://github.com/ag-ui-protocol/ag-ui
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# SSE formatting
# ---------------------------------------------------------------------------

def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------

def msg_thread(thread_id: str, agent_name: str) -> str:
    """RUN_STARTED — signals the beginning of a streaming run."""
    return _sse({
        "type": "RUN_STARTED",
        "threadId": thread_id,
        "agentName": agent_name,
    })


def msg_done(_thread_id: str, _full_text: str = "") -> str:
    """RUN_FINISHED — signals the run completed successfully."""
    return _sse({"type": "RUN_FINISHED"})


def msg_error(message: str) -> str:
    """RUN_ERROR — signals an unrecoverable error."""
    return _sse({"type": "RUN_ERROR", "message": message})


# ---------------------------------------------------------------------------
# Text message events
# ---------------------------------------------------------------------------

def _text_message_start(message_id: str, role: str = "assistant") -> str:
    return _sse({"type": "TEXT_MESSAGE_START", "messageId": message_id, "role": role})


def _text_message_content(message_id: str, delta: str) -> str:
    return _sse({"type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": delta})


def _text_message_end(message_id: str) -> str:
    return _sse({"type": "TEXT_MESSAGE_END", "messageId": message_id})


# ---------------------------------------------------------------------------
# Thinking message events (AG-UI extension)
# ---------------------------------------------------------------------------

def _thinking_start(message_id: str) -> str:
    return _sse({"type": "THINKING_START", "messageId": message_id})


def _thinking_content(message_id: str, delta: str) -> str:
    return _sse({"type": "THINKING_CONTENT", "messageId": message_id, "delta": delta})


def _thinking_end(message_id: str) -> str:
    return _sse({"type": "THINKING_END", "messageId": message_id})


# ---------------------------------------------------------------------------
# Tool call events
# ---------------------------------------------------------------------------

def _tool_call_start(tool_call_id: str, tool_name: str, parent_message_id: str | None = None) -> str:
    payload: dict[str, Any] = {
        "type": "TOOL_CALL_START",
        "toolCallId": tool_call_id,
        "toolCallName": tool_name,
    }
    if parent_message_id:
        payload["parentMessageId"] = parent_message_id
    return _sse(payload)


def _tool_call_args(tool_call_id: str, delta: str) -> str:
    return _sse({"type": "TOOL_CALL_ARGS", "toolCallId": tool_call_id, "delta": delta})


def _tool_call_end(tool_call_id: str) -> str:
    return _sse({"type": "TOOL_CALL_END", "toolCallId": tool_call_id})


def _tool_call_result(tool_call_id: str, content: str, is_error: bool = False) -> str:
    payload: dict[str, Any] = {
        "type": "TOOL_CALL_RESULT",
        "toolCallId": tool_call_id,
        "content": content[:5000],
    }
    if is_error:
        payload["isError"] = True
    return _sse(payload)


# ---------------------------------------------------------------------------
# Step events
# ---------------------------------------------------------------------------

def _step_started(step_name: str) -> str:
    return _sse({"type": "STEP_STARTED", "stepName": step_name})


def _step_finished(step_name: str) -> str:
    return _sse({"type": "STEP_FINISHED", "stepName": step_name})


# ---------------------------------------------------------------------------
# Clarification / HITL events (Human-In-The-Loop)
# ---------------------------------------------------------------------------

def _clarification_request(message_id: str, question: str, options: list[str] | None = None) -> str:
    """Request user input — pauses the agent until user responds."""
    payload: dict[str, Any] = {
        "type": "CLARIFICATION_REQUEST",
        "messageId": message_id,
        "question": question,
    }
    if options:
        payload["options"] = options
    return _sse(payload)


def _clarification_response(message_id: str, response: str) -> str:
    """User's response to a clarification request."""
    return _sse({
        "type": "CLARIFICATION_RESPONSE",
        "messageId": message_id,
        "response": response,
    })


# ---------------------------------------------------------------------------
# StreamState
# ---------------------------------------------------------------------------

@dataclass
class StreamState:
    """Tracks message & tool-call lifecycle across LangGraph stream chunks."""

    # Text message tracking
    text_message_open: bool = False
    text_message_id: str | None = None
    text_message_counter: int = 0

    # Tool call tracking
    active_tool_call_id: str | None = None
    emitted_tool_call_ids: set[str] = field(default_factory=set)
    emitted_tool_results: set[str] = field(default_factory=set)

    # Step tracking
    emitted_steps: set[str] = field(default_factory=set)

    # Accumulated full text
    full_text_buffer: str = ""

    def next_text_message_id(self) -> str:
        self.text_message_counter += 1
        return f"txt-{self.text_message_counter}"

    def open_text_message(self) -> tuple[str, str]:
        """Open a new text message. Returns (message_id, SSE start event)."""
        if self.text_message_open:
            raise RuntimeError("Text message already open")
        self.text_message_id = self.next_text_message_id()
        self.text_message_open = True
        return self.text_message_id, _text_message_start(self.text_message_id)

    def close_text_message(self) -> str | None:
        """Close current text message. Returns SSE end event if one was open."""
        if not self.text_message_open:
            return None
        mid = self.text_message_id
        self.text_message_open = False
        self.text_message_id = None
        return _text_message_end(mid or "")


# ---------------------------------------------------------------------------
# Content extraction
# ---------------------------------------------------------------------------

def _extract_text(content: Any) -> str:
    """Best-effort text extraction from LangChain message content."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            c.get("text", "") if isinstance(c, dict) else str(c) for c in content
        )
    return str(content) if content else ""


# ---------------------------------------------------------------------------
# Message tuple parser
# ---------------------------------------------------------------------------

def parse_messages_tuple_event(data: Any, state: StreamState) -> list[str]:
    """Parse a ``messages`` / ``messages-tuple`` stream event into AG-UI SSE strings.

    Handles:
      - AI text chunks  → TEXT_MESSAGE_START / CONTENT / END
      - Tool call chunks → TOOL_CALL_START / ARGS / END
      - Tool results    → TOOL_CALL_RESULT
      - Thinking content → THINKING_START / CONTENT / END
    """
    if not data:
        return []

    results: list[str] = []

    # Normalise to a flat list of message dicts
    messages: list[dict[str, Any]] = []
    if isinstance(data, (list, tuple)):
        for item in data:
            inner: Any = item
            if isinstance(item, (list, tuple)):
                if len(item) >= 2:
                    inner = item[1]
                elif item:
                    inner = item[0]
            if isinstance(inner, (list, tuple)) and len(inner) >= 2:
                inner = inner[1]
            if isinstance(inner, dict):
                messages.append(inner)
    elif isinstance(data, dict):
        messages.append(data)

    for msg in messages:
        msg_type = str(msg.get("type", "")).lower()
        content = msg.get("content")
        tool_call_chunks: list[dict[str, Any]] = msg.get("tool_call_chunks", []) or []

        # ---- AI message chunk ----
        if "ai" in msg_type and "tool" not in msg_type:
            # Check for thinking/reasoning content
            if "thinking" in msg_type or "reasoning" in msg_type:
                think_id = f"think-{state.text_message_counter + 1}"
                text = _extract_text(content) if content else ""
                results.append(_thinking_start(think_id))
                if text:
                    results.append(_thinking_content(think_id, text))
                results.append(_thinking_end(think_id))
                continue

            # Open text message if not already open
            if not state.text_message_open:
                mid, start_evt = state.open_text_message()
                results.append(start_evt)
            else:
                mid = state.text_message_id or ""

            # Handle content (string or list of blocks)
            if isinstance(content, str) and content:
                state.full_text_buffer += content
                results.append(_text_message_content(mid, content))
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    block_type = block.get("type", "")
                    block_text = block.get("text", "") or ""
                    if block_type in ("thinking", "reasoning"):
                        think_id = f"think-{state.text_message_counter + 1}"
                        results.append(_thinking_start(think_id))
                        if block_text:
                            results.append(_thinking_content(think_id, block_text))
                        results.append(_thinking_end(think_id))
                    elif block_text:
                        state.full_text_buffer += block_text
                        results.append(_text_message_content(mid, block_text))

            # Tool calls embedded in AI message
            _accepted_tc_name: str | None = None
            for tc in tool_call_chunks:
                tc_name = tc.get("name") or _accepted_tc_name or "unknown"
                tc_id = tc.get("id") or tc.get("tool_call_id") or ""
                tc_args = tc.get("args", "")

                # First chunk with an id defines the active tool call
                if tc_id:
                    _accepted_tc_name = tc_name
                    if state.active_tool_call_id and state.active_tool_call_id != tc_id:
                        results.append(_tool_call_end(state.active_tool_call_id))
                    if tc_id != state.active_tool_call_id:
                        state.active_tool_call_id = tc_id
                        results.append(_tool_call_start(tc_id, tc_name, mid))
                        state.emitted_tool_call_ids.add(tc_id)

                use_id = state.active_tool_call_id or tc_id
                if tc_args:
                    delta = json.dumps(tc_args, ensure_ascii=False) if isinstance(tc_args, dict) else str(tc_args)
                    results.append(_tool_call_args(use_id, delta))

            # Finish: response ended
            finish_reason = (msg.get("response_metadata") or {}).get("finish_reason", "")
            if finish_reason in ("stop", "end_turn"):
                if state.active_tool_call_id:
                    results.append(_tool_call_end(state.active_tool_call_id))
                    state.active_tool_call_id = None
                end_evt = state.close_text_message()
                if end_evt:
                    results.append(end_evt)

        # ---- Tool message (result) ----
        elif msg_type == "tool":
            tc_id = msg.get("tool_call_id", "") or msg.get("id", "")
            tool_name = str(msg.get("name", ""))
            if tc_id:
                result_key = f"{tc_id}:result"
                if result_key not in state.emitted_tool_results:
                    state.emitted_tool_results.add(result_key)
                    result_text = _extract_text(content) if content else ""
                    is_error = str(msg.get("status", "")).lower() == "error"
                    results.append(_tool_call_result(tc_id, result_text, is_error=is_error))

                # Emit clarification request for ask_clarification tool messages
                if tool_name == "ask_clarification":
                    result_key_clarify = f"{tc_id}:clarify"
                    if result_key_clarify not in state.emitted_tool_results:
                        state.emitted_tool_results.add(result_key_clarify)
                        question_text = _extract_text(content) if content else ""
                        results.append(_clarification_request(tc_id, question_text))

    return results


# ---------------------------------------------------------------------------
# Values / state snapshot parser
# ---------------------------------------------------------------------------

def parse_values_event(data: Any, state: StreamState) -> list[str]:
    """Parse a ``values`` snapshot event — extract steps and tool results."""
    if not isinstance(data, dict):
        return []

    results: list[str] = []
    messages: list[dict[str, Any]] = data.get("messages", []) or []

    # Scan for tool results we haven't emitted yet
    for msg in reversed(messages):
        if not isinstance(msg, dict):
            continue
        if str(msg.get("type", "")).lower() != "tool":
            continue
        tc_id = msg.get("tool_call_id", "") or msg.get("id", "")
        if not tc_id:
            continue
        result_key = f"{tc_id}:result"
        if result_key in state.emitted_tool_results:
            continue
        state.emitted_tool_results.add(result_key)
        result_text = _extract_text(msg.get("content", ""))
        is_error = str(msg.get("status", "")).lower() == "error"
        results.append(_tool_call_result(tc_id, result_text, is_error=is_error))

        # Emit clarification request for ask_clarification tool messages
        tool_name = str(msg.get("name", ""))
        if tool_name == "ask_clarification":
            result_key_clarify = f"{tc_id}:clarify"
            if result_key_clarify not in state.emitted_tool_results:
                state.emitted_tool_results.add(result_key_clarify)
                question_text = _extract_text(msg.get("content", "")) if "content" in msg else ""
                results.append(_clarification_request(tc_id, question_text))

    # Extract todos / steps
    todos: list[dict[str, Any]] = data.get("todos", []) or []
    if not todos:
        scratchpad = data.get("scratchpad") or data.get("plan") or {}
        if isinstance(scratchpad, dict):
            todos = scratchpad.get("todos") or scratchpad.get("steps") or []

    for todo in todos:
        if not isinstance(todo, dict):
            continue
        step_name = todo.get("name") or todo.get("title") or todo.get("content") or str(todo)
        step_status = str(todo.get("status", "")).lower()

        if step_name not in state.emitted_steps:
            state.emitted_steps.add(step_name)
            results.append(_step_started(step_name))

        if step_status in ("done", "completed", "finished", "success"):
            done_key = f"{step_name}:done"
            if done_key not in state.emitted_steps:
                state.emitted_steps.add(done_key)
                results.append(_step_finished(step_name))

    return results
