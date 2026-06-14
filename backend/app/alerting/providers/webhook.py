"""Generic webhook provider.

Accepts arbitrary JSON and uses user-configured JSONPath field_mapping
to extract alert fields.
"""

import re

from app.alerting.providers.base import BaseAlertProvider
from app.models.alerting import RawAlert, Signal


class WebhookProvider(BaseAlertProvider):
    """Provider for generic webhook payloads with configurable field mapping."""

    provider_type = "webhook"

    def parse_raw_payload(self, body: dict, headers: dict) -> RawAlert:
        return RawAlert(
            id="",
            tenant_id="",
            source_id="",
            external_event_id=headers.get("X-Event-Id"),
            payload_hash="",
            payload_json=body,
            ingest_status="received",
        )

    def normalize(self, raw_alert: RawAlert, source_config: dict | None = None) -> Signal:
        config = source_config or {}
        mapping = config.get("field_mapping", {})
        payload = raw_alert.payload_json or {}

        title = _resolve(payload, mapping.get("title", "")) or _resolve(payload, "$.alert.name") or "webhook alert"
        summary = _resolve(payload, mapping.get("summary", "")) or title
        severity = _resolve(payload, mapping.get("severity", "")) or _resolve(payload, "$.alert.severity") or "warning"
        service = _resolve(payload, mapping.get("service", "")) or _resolve(payload, "$.labels.service") or ""
        environment = _resolve(payload, mapping.get("environment", "")) or _resolve(payload, "$.labels.env") or ""
        status = _resolve(payload, mapping.get("status", "")) or "firing"

        labels = _resolve(payload, mapping.get("labels", ""))
        if isinstance(labels, str):
            labels = {}

        return Signal(
            id="",
            tenant_id=raw_alert.tenant_id,
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            service=service or None,
            environment=environment or None,
            severity=severity,
            status=status,
            title=title,
            summary=summary,
            labels_json=labels if isinstance(labels, dict) else {},
            fingerprint="",
            correlation_key="",
            occurred_at=raw_alert.received_at,
        )


def _resolve(data: dict, jsonpath: str) -> str:
    """Resolve a simple JSONPath expression against a dict.

    Supports dotted paths like ``$.labels.service`` or ``$.alert.name``.
    Returns the value as a string, or the raw value if it's a dict/list,
    or empty string if not found.
    """
    if not jsonpath:
        return ""

    # Strip leading "$." if present
    path = re.sub(r"^\$\.", "", jsonpath)
    keys = path.split(".")
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
            if current is None:
                return ""
        else:
            return ""
    if isinstance(current, str):
        return current
    if isinstance(current, (dict, list)):
        return current  # let caller decide
    return str(current) if current else ""
