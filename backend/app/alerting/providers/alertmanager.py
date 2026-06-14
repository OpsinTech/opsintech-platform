"""Alertmanager webhook provider.

Parses the standard Alertmanager webhook JSON payload.
See: https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
"""

from app.alerting.providers.base import BaseAlertProvider
from app.models.alerting import RawAlert, Signal


class AlertmanagerProvider(BaseAlertProvider):
    """Provider for Alertmanager webhook payloads."""

    provider_type = "alertmanager"

    def parse_raw_payload(self, body: dict, headers: dict) -> RawAlert:
        alerts = body.get("alerts", [])
        first = alerts[0] if alerts else {}

        external_event_id = (
            body.get("externalURL", "")
            + "|"
            + (first.get("fingerprint", ""))
        )

        return RawAlert(
            id="",  # assigned on flush
            tenant_id="",  # filled by ingest endpoint
            source_id="",  # filled by ingest endpoint
            external_event_id=external_event_id or None,
            payload_hash="",  # computed by ingest
            payload_json=body,
            ingest_status="received",
        )

    def normalize(self, raw_alert: RawAlert, source_config: dict | None = None) -> Signal:
        alerts = raw_alert.payload_json.get("alerts", [])
        first = alerts[0] if alerts else {}
        annotations = first.get("annotations", {})
        labels = first.get("labels", {})

        return Signal(
            id="",
            tenant_id=raw_alert.tenant_id,
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            service=labels.get("service", ""),
            environment=labels.get("environment") or labels.get("env", ""),
            severity=_map_alertmanager_severity(labels.get("severity", "warning")),
            status="firing" if first.get("status") == "firing" else "resolved",
            title=annotations.get("summary") or annotations.get("description", ""),
            summary=annotations.get("description") or annotations.get("summary", ""),
            labels_json=labels,
            fingerprint="",
            correlation_key="",
            occurred_at=raw_alert.received_at,
        )


def _map_alertmanager_severity(severity: str) -> str:
    """Map Alertmanager severity to platform-normalised severity."""
    mapping = {
        "critical": "critical",
        "page": "critical",
        "major": "major",
        "warning": "warning",
        "minor": "minor",
        "info": "info",
    }
    return mapping.get(severity.lower(), "warning")
