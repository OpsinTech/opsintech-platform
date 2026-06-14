"""Datadog monitor webhook provider.

Datadog lets users define custom webhook payloads with $VARIABLE
substitution, so there is no single canonical format.  This provider
handles the most common patterns seen in the wild.
"""

from app.alerting.providers.base import BaseAlertProvider
from app.models.alerting import RawAlert, Signal


class DatadogProvider(BaseAlertProvider):
    """Provider for Datadog monitor webhook notifications."""

    provider_type = "datadog"

    def parse_raw_payload(self, body: dict, headers: dict) -> RawAlert:
        external_event_id = body.get("id") or body.get("alert_id") or body.get("unique_key") or ""
        return RawAlert(
            id="",
            tenant_id="",
            source_id="",
            external_event_id=str(external_event_id) if external_event_id else None,
            payload_hash="",
            payload_json=body,
            ingest_status="received",
        )

    def normalize(self, raw_alert: RawAlert, source_config: dict | None = None) -> Signal:
        payload = raw_alert.payload_json or {}

        title = (
            payload.get("title")
            or payload.get("event_title")
            or payload.get("summary")
            or ""
        )
        summary = payload.get("body") or payload.get("event_msg") or title

        transition = (payload.get("alert_transition") or "").lower()
        status = "resolved" if transition == "recovered" else "firing"

        dd_level = (payload.get("alert_type") or payload.get("level") or "").lower()
        severity = _datadog_severity(dd_level)

        tags_raw = payload.get("tags", "")
        if isinstance(tags_raw, str):
            tags_list = [t.strip() for t in tags_raw.split(",") if t.strip()]
        elif isinstance(tags_raw, list):
            tags_list = tags_raw
        else:
            tags_list = []

        labels = {"tags": tags_list}
        service = ""
        env = ""
        for t in tags_list:
            if ":" in t:
                k, v = t.split(":", 1)
                labels[k] = v
                if k == "service":
                    service = v
                elif k in ("env", "environment"):
                    env = v

        return Signal(
            id="",
            tenant_id="",
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            service=service or None,
            environment=env or None,
            severity=severity,
            status=status,
            title=title,
            summary=summary,
            labels_json=labels,
            fingerprint="",
            correlation_key="",
            occurred_at=None,
        )


def _datadog_severity(dd_level: str) -> str:
    mapping = {
        "error": "critical",
        "warning": "warning",
        "warn": "warning",
        "success": "info",
        "info": "info",
    }
    return mapping.get(dd_level, "warning")
