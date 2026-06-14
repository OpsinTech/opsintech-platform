"""Rule engine — evaluates alert_rules against signals.

Condition format (JSON):
  {
    "conditions": [
      {"field": "severity", "op": "in", "value": ["warning", "info"]},
      {"field": "service", "op": "eq", "value": "postgres"}
    ],
    "logic": "and"
  }

Supported operators: eq, neq, in, not_in, contains, starts_with, regex, gt, lt.

Action format varies by rule_type:
  - suppression: {"action": "suppress"}
  - aggregation: {"group_by": ["service", "environment"], "window_minutes": 30}
  - dedup: {"window_minutes": 10}
"""

import logging
import operator
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.models.alerting import AlertRule, Signal

logger = logging.getLogger(__name__)

_OPS: dict[str, Any] = {
    "eq": operator.eq,
    "neq": operator.ne,
    "gt": operator.gt,
    "lt": operator.lt,
    "in": lambda v, vs: v in vs if isinstance(vs, (list, tuple, set)) else False,
    "not_in": lambda v, vs: v not in vs if isinstance(vs, (list, tuple, set)) else True,
    "contains": lambda v, sub: isinstance(v, str) and isinstance(sub, str) and sub.lower() in v.lower(),
    "starts_with": lambda v, prefix: isinstance(v, str) and isinstance(prefix, str) and v.lower().startswith(prefix.lower()),
    "regex": lambda v, pat: bool(re.search(pat, str(v))) if isinstance(v, str) else False,
}


@dataclass
class MatchResult:
    matched: bool
    rule: AlertRule | None = None


def _resolve_field(data: dict[str, Any], field_path: str) -> Any:
    """Resolve a dotted field path against a dict.

    Supports 'labels.xxx' to reach into labels_json.  First attempts
    nested traversal (data["labels"]["team"]), then falls back to the
    flattened key (data["labels.team"]) for compatibility with both
    representations.
    """
    if "." in field_path:
        parts = field_path.split(".")
        current: Any = data
        for p in parts:
            if isinstance(current, dict):
                current = current.get(p)
            else:
                return data.get(field_path)
        if current is not None:
            return current
        return data.get(field_path)
    return data.get(field_path)


def _evaluate_condition(condition: dict, data: dict[str, Any]) -> bool:
    """Evaluate a single condition against signal data."""
    field = condition.get("field", "")
    op_name = condition.get("op", "eq")
    expected = condition.get("value")

    actual = _resolve_field(data, field)
    op_fn = _OPS.get(op_name)
    if op_fn is None:
        logger.warning("Unknown operator '%s' in rule condition", op_name)
        return False

    try:
        return bool(op_fn(actual, expected))
    except Exception:
        logger.debug("Condition eval failed: field=%s op=%s value=%r actual=%r", field, op_name, expected, actual)
        return False


def evaluate_rule(rule: AlertRule, signal: Signal) -> bool:
    """Evaluate whether a rule matches a signal.

    Returns True if the rule's conditions match the signal.
    """
    condition_json = rule.condition_json or {}
    if not condition_json:
        return False

    conditions = condition_json.get("conditions", [])
    if not conditions:
        return False

    logic = condition_json.get("logic", "and")

    # Build a flat dict from the signal for field resolution
    data: dict[str, Any] = {
        "source": signal.source,
        "service": signal.service,
        "environment": signal.environment,
        "severity": signal.severity,
        "status": signal.status,
        "title": signal.title,
        "summary": signal.summary,
    }
    # Merge labels so "labels.xxx" works
    for k, v in (signal.labels_json or {}).items():
        data[f"labels.{k}"] = v

    results = [_evaluate_condition(c, data) for c in conditions]

    condition_matched = any(results) if logic == "or" else all(results)
    if not condition_matched:
        return False

    # Time-based schedule (maintenance window)
    schedule = condition_json.get("schedule")
    if schedule:
        return _check_schedule(schedule)

    return True


def _check_schedule(schedule: dict) -> bool:
    """Check if current time falls within a maintenance window schedule.

    Schedule format:
      {"days": [0, 6], "start": "02:00", "end": "04:00"}
      - days: list of day-of-week (0=Monday .. 6=Sunday). Omit = all days.
      - start/end: HH:MM in local time. start inclusive, end exclusive.
    """
    now = datetime.now(UTC)

    # Day check
    days = schedule.get("days")
    if days:
        if now.weekday() not in days:
            return False

    # Time check
    start_str = schedule.get("start")
    end_str = schedule.get("end")
    if start_str and end_str:
        current_minutes = now.hour * 60 + now.minute
        try:
            sh, sm = map(int, start_str.split(":"))
            eh, em = map(int, end_str.split(":"))
            start_minutes = sh * 60 + sm
            end_minutes = eh * 60 + em
        except (ValueError, AttributeError):
            logger.warning("Invalid schedule time format: start=%s end=%s", start_str, end_str)
            return True  # malformed schedule → always match

        if start_minutes <= end_minutes:
            # Normal range e.g. 02:00-04:00
            return start_minutes <= current_minutes < end_minutes
        else:
            # Overnight range e.g. 22:00-06:00
            return current_minutes >= start_minutes or current_minutes < end_minutes

    return True


def evaluate_rules(rules: list[AlertRule], signal: Signal) -> list[AlertRule]:
    """Return the subset of rules that match this signal."""
    return [r for r in rules if r.enabled and evaluate_rule(r, signal)]


def get_suppression_action(matched_rules: list[AlertRule]) -> dict | None:
    """Return the first suppression action from matched rules, or None."""
    for r in matched_rules:
        if r.rule_type == "suppression":
            return r.action_json or {"action": "suppress"}
    return None


def get_aggregation_config(matched_rules: list[AlertRule]) -> dict | None:
    """Return aggregation config from matched rules, or None."""
    for r in matched_rules:
        if r.rule_type == "aggregation":
            return r.action_json or {}
    return None
