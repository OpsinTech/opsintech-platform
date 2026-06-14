"""AI incident interpretation — async, non-blocking summary generation.

Produces the "alert translator" three-sentence output:
  - ai_summary:    what the alert data shows
  - ai_impact:     what services/environments are affected
  - ai_suggestion: what to check first (based on data, NOT guessed root cause)
  - data_quality:  "sufficient" or "limited" (based on signal count & labels availability)

Design principles:
  - Only restate what's in the alert data — never fabricate root causes
  - When data is insufficient, say so honestly
  - Every suggestion must reference concrete entities from the alert (service names,
    metric names, labels) — never generic advice

Trigger modes (per alert_source config_json.analysis_trigger):
  - auto:        always generate on incident creation (default for critical/major)
  - conditional: generate when severity matches the configured list
  - manual:      only via POST /api/incidents/{id}/analyze
"""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alerting import Incident, IncidentAction, IncidentContextSnapshot

logger = logging.getLogger(__name__)

DEFAULT_AUTO_SEVERITIES = {"critical", "major"}
LLM_TIMEOUT_SECONDS = 120  # Self-hosted models (e.g. Qwen 35B) may take 60-90s for full triage response


def should_auto_analyze(source_config: dict | None, severity: str) -> bool:
    """Determine whether AI analysis should trigger automatically.

    Reads analysis_trigger from the alert source config_json.
    Defaults to auto for critical and major when not configured.
    """
    trigger = (source_config or {}).get("analysis_trigger", {})
    mode = trigger.get("mode", "conditional")

    if mode == "manual":
        return False
    if mode == "auto":
        return True

    # conditional mode (default)
    allowed = set(trigger.get("conditions", {}).get("severity", list(DEFAULT_AUTO_SEVERITIES)))
    return severity in allowed


async def run_analysis(
    incident: Incident,
    signals_data: list[dict],
    raw_payload: dict | None,
    session: AsyncSession,
    model_name: str | None = None,
) -> None:
    """Run AI analysis for an incident (fire-and-forget, called via asyncio.create_task).

    This function runs in its own task.  It opens a fresh session, calls the
    LLM, writes results back to the incident, and creates an audit action.
    """
    try:
        prompt = _build_prompt(incident, signals_data, raw_payload)
        result = await asyncio.wait_for(_call_llm(prompt, model_name), timeout=LLM_TIMEOUT_SECONDS)
        parsed = _parse_response(result)

        # Determine data quality
        has_labels = any(s.get("labels_json") for s in signals_data)
        data_quality = "sufficient" if len(signals_data) >= 2 and has_labels else "limited"

        incident.ai_summary = parsed.get("summary", "")
        incident.ai_impact = parsed.get("impact", "")
        incident.ai_suggestion = parsed.get("suggestion", "")

        snapshot = IncidentContextSnapshot(
            id=str(uuid.uuid4()),
            tenant_id=incident.tenant_id,
            incident_id=incident.id,
            context_json={
                "signal_count": len(signals_data),
                "data_quality": data_quality,
                "analysis_prompt": prompt,
                "analysis_raw": result,
            },
            version=1,
        )
        session.add(snapshot)

        action = IncidentAction(
            id=str(uuid.uuid4()),
            tenant_id=incident.tenant_id,
            incident_id=incident.id,
            actor_id="system",
            action_type="ai_triage",
            action_payload={"trigger": "auto", "signals_analyzed": len(signals_data), "data_quality": data_quality},
        )
        session.add(action)

        session.add(incident)
        await session.commit()

        logger.info("ai_analysis: completed for incident=%s", incident.incident_key)

    except asyncio.TimeoutError:
        logger.error("ai_analysis: timed out after %ds for incident=%s", LLM_TIMEOUT_SECONDS, incident.incident_key)
        incident.ai_summary = "AI 解读超时，请稍后重试"
        session.add(incident)
        await session.commit()

    except Exception:
        logger.exception("ai_analysis: failed for incident=%s", incident.incident_key)
        incident.ai_summary = "AI 解读生成失败，请稍后重试"
        session.add(incident)
        await session.commit()


def schedule_analysis(
    incident: Incident,
    signals_data: list[dict],
    raw_payload: dict | None,
    model_name: str | None = None,
):
    """Fire-and-forget: schedule async analysis in a background task.

    Must be called AFTER the incident has been committed to the DB.
    Silently skips if no models are configured.
    """
    from deerflow.config import get_app_config
    from deerflow.database.session import get_session_factory

    if not get_app_config().models:
        logger.debug("ai_analysis: skipped for incident=%s (no models configured)", incident.incident_key)
        return

    async def _task():
        async with get_session_factory()() as task_session:
            fresh = await task_session.get(Incident, incident.id)
            if fresh is None:
                logger.warning("ai_analysis: incident %s not found in task session", incident.id)
                return
            await run_analysis(fresh, signals_data, raw_payload, task_session, model_name)

    asyncio.create_task(_task())
    logger.debug("ai_analysis: scheduled for incident=%s (model=%s)", incident.incident_key, model_name or "default")


# ---------------------------------------------------------------------------
# Prompt & parsing
# ---------------------------------------------------------------------------


def _build_prompt(
    incident: Incident,
    signals_data: list[dict],
    raw_payload: dict | None,
) -> str:
    """Build the interpretation prompt from incident and signal data."""
    signal_summaries = []
    for s in signals_data:
        labels = s.get("labels_json", {}) or {}
        signal_summaries.append(
            f"- [{s.get('severity', '?')}] {s.get('title', 'untitled')} "
            f"(source={s.get('source', '?')}, fingerprint={s.get('fingerprint', '')[:12]}...) "
            f"labels={json.dumps(labels, ensure_ascii=False)}"
        )

    payload_section = ""
    if raw_payload:
        payload_section = f"\n\nRaw alert payload (first signal):\n```json\n{json.dumps(raw_payload, indent=2, ensure_ascii=False)[:3000]}\n```"

    return f"""你是一个告警解读助手，不是根因侦探。你的任务是用自然语言重新组织和归纳告警数据，帮助值班工程师快速理解当前状况。

严格规则：
1. 只使用下面提供的告警数据，不要补充外部知识或经验猜测
2. 如果数据不足以得出明确结论，直接说明「当前告警信息有限」
3. 不要编造根本原因（如"配置错误"、"代码 bug"等），只描述告警数据本身说明了什么
4. 建议的排查方向必须引用告警中实际出现的服务名、指标名或标签

Incident: {incident.incident_key}
标题: {incident.title or '无'}
严重度: {incident.severity}
服务: {incident.service or '未知'}
环境: {incident.environment or '未知'}
关联信号数: {incident.signal_count}

关联信号:
{chr(10).join(signal_summaries) or '(无)'}{payload_section}

请用中文回复，仅输出 JSON 格式（不要 markdown 代码块标记）:
{{"summary": "一句话描述告警数据说明了什么", "impact": "一句话说明影响了哪些服务或环境", "suggestion": "一句话建议值班工程师优先查看什么（引用告警中实际的实体名）"}}"""


async def _call_llm(prompt: str, model_name: str | None = None) -> str:
    """Call the LLM and return its response text.

    Uses the specified model_name if provided, otherwise falls back to
    the system default model.
    """
    from deerflow.config import get_app_config
    from deerflow.models import create_chat_model

    config = get_app_config()
    if not config.models:
        raise RuntimeError("No models configured — AI analysis requires at least one model")

    model = create_chat_model(name=model_name) if model_name else create_chat_model()
    response = await model.ainvoke(prompt)
    return response.content if hasattr(response, "content") else str(response)


def _parse_response(text: str) -> dict:
    """Extract JSON from LLM response, with robust fallback.

    Tries in order:
      1. Direct JSON parse
      2. Extract from markdown ```json ... ``` block
      3. Find outermost { ... } with balanced braces
      4. Raw text as summary fallback
    """
    import re

    cleaned = text.strip()

    # 1. Direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 2. Markdown code block
    md_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', cleaned, re.DOTALL)
    if md_match:
        try:
            return json.loads(md_match.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Find balanced outermost braces
    start = cleaned.find("{")
    if start >= 0:
        depth = 0
        end = -1
        for i in range(start, len(cleaned)):
            if cleaned[i] == "{":
                depth += 1
            elif cleaned[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end > start:
            try:
                return json.loads(cleaned[start:end + 1])
            except json.JSONDecodeError:
                pass

    # 4. Fallback
    return {"summary": cleaned[:500], "impact": "", "suggestion": ""}
