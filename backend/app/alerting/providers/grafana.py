"""Grafana Alerting webhook provider.

Handles both Grafana v9+ (embedded Alertmanager) and legacy Grafana
alerting webhook formats.
"""

from app.alerting.providers.base import BaseAlertProvider
from app.models.alerting import RawAlert, Signal


class GrafanaProvider(BaseAlertProvider):
    """Provider for Grafana Alerting webhook payloads.

    Grafana v9+ uses the embedded Alertmanager format (alerts[] array).
    This provider also handles the legacy Grafana alerting format.
    """

    provider_type = "grafana"

    def parse_raw_payload(self, body: dict, headers: dict) -> RawAlert:
        external_event_id = body.get("groupKey") or ""
        return RawAlert(
            id="",
            tenant_id="",
            source_id="",
            external_event_id=external_event_id or None,
            payload_hash="",
            payload_json=body,
            ingest_status="received",
        )

    def normalize(self, raw_alert: RawAlert, source_config: dict | None = None) -> Signal:
        payload = raw_alert.payload_json or {}
        alerts = payload.get("alerts", [])
        common_labels = payload.get("commonLabels", {})

        if alerts:
            # Grafana v9+ embedded Alertmanager format
            return self._normalize_v9(payload, alerts, common_labels)
        # Legacy Grafana format
        return self._normalize_legacy(raw_alert, payload)

    def _normalize_v9(self, payload: dict, alerts: list, common_labels: dict) -> Signal:
        first = alerts[0] if alerts else {}
        annotations = first.get("annotations", {})
        labels = {**common_labels, **first.get("labels", {})}

        severity = _grafana_severity(labels)
        status = payload.get("status") or first.get("status", "firing")

        return Signal(
            id="",
            tenant_id="",
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            service=labels.get("service", ""),
            environment=labels.get("environment") or labels.get("env", ""),
            severity=severity,
            status="firing" if status == "firing" else "resolved",
            title=annotations.get("summary") or annotations.get("description") or payload.get("title", ""),
            summary=annotations.get("description") or annotations.get("summary", ""),
            labels_json={**labels, "grafana_dashboard_url": first.get("dashboardURL", ""),
                         "grafana_panel_url": first.get("panelURL", ""),
                         "grafana_rule_url": first.get("generatorURL", "")},
            fingerprint="",
            correlation_key="",
            occurred_at=None,
        )

    def _normalize_legacy(self, raw_alert: RawAlert, payload: dict) -> Signal:
        state = payload.get("state", "alerting")
        return Signal(
            id="",
            tenant_id="",
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            severity="critical" if state == "alerting" else "info",
            status="firing" if state == "alerting" else "resolved",
            title=payload.get("ruleName") or payload.get("title", ""),
            summary=payload.get("message", ""),
            labels_json={
                "rule_id": payload.get("ruleId"),
                "rule_url": payload.get("ruleUrl", ""),
                "dashboard_id": payload.get("dashboardId"),
                "tags": payload.get("tags", {}),
            },
            fingerprint="",
            correlation_key="",
            occurred_at=None,
        )


def _grafana_severity(labels: dict) -> str:
    mapping = {
        "critical": "critical",
        "page": "critical",
        "severe": "major",
        "major": "major",
        "warning": "warning",
        "warn": "warning",
        "minor": "minor",
        "info": "info",
    }
    raw = (labels.get("severity") or labels.get("priority") or "warning").lower()
    return mapping.get(raw, "warning")
