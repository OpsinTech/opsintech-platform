"""AWS CloudWatch alarm provider (via SNS HTTP subscription).

CloudWatch alarms are delivered through SNS. The HTTP endpoint receives
SNS messages directly.  Two message types arrive:

* ``SubscriptionConfirmation`` — sent once to confirm the HTTP endpoint.
  The provider returns it as a special-case raw alert so the caller can
  auto-confirm.
* ``Notification`` — contains the CloudWatch alarm JSON in the ``Message``
  field (JSON-escaped string, needs double-parse).
"""

import json
import logging

from app.alerting.providers.base import BaseAlertProvider
from app.models.alerting import RawAlert, Signal

logger = logging.getLogger(__name__)


class CloudWatchProvider(BaseAlertProvider):
    """Provider for AWS CloudWatch alarms delivered via SNS HTTP subscription."""

    provider_type = "cloudwatch"

    def parse_raw_payload(self, body: dict, headers: dict) -> RawAlert:
        msg_type = body.get("Type", "")
        if msg_type == "SubscriptionConfirmation":
            return RawAlert(
                id="",
                tenant_id="",
                source_id="",
                external_event_id="sns-subscription-confirmation",
                payload_hash="",
                payload_json=body,
                ingest_status="received",
            )

        message_str = body.get("Message", "{}")
        alarm = {}
        try:
            alarm = json.loads(message_str) if isinstance(message_str, str) else message_str
        except json.JSONDecodeError:
            logger.warning("cloudwatch: failed to parse Message JSON")

        return RawAlert(
            id="",
            tenant_id="",
            source_id="",
            external_event_id=alarm.get("AlarmArn", body.get("MessageId", "")),
            payload_hash="",
            payload_json=body,
            ingest_status="received",
        )

    def normalize(self, raw_alert: RawAlert, source_config: dict | None = None) -> Signal:
        body = raw_alert.payload_json or {}
        msg_type = body.get("Type", "")

        if msg_type == "SubscriptionConfirmation":
            return Signal(
                id="",
                tenant_id="",
                raw_alert_id=raw_alert.id,
                source=self.provider_type,
                severity="info",
                status="firing",
                title="SNS Subscription Confirmation",
                summary=f"SubscribeURL: {body.get('SubscribeURL', '')}",
                labels_json={"type": "subscription_confirmation"},
                fingerprint="",
                correlation_key="",
            )

        message_str = body.get("Message", "{}")
        alarm = {}
        try:
            alarm = json.loads(message_str) if isinstance(message_str, str) else message_str
        except json.JSONDecodeError:
            alarm = {}

        new_state = alarm.get("NewStateValue", "ALARM")
        trigger = alarm.get("Trigger", {})

        severity_map = {"ALARM": "critical", "OK": "info", "INSUFFICIENT_DATA": "warning"}
        severity = severity_map.get(new_state, "warning")

        dimensions = trigger.get("Dimensions", [])
        service = ""
        for d in dimensions:
            if d.get("name") in ("InstanceId", "FunctionName", "LoadBalancerName"):
                service = d.get("value", "")
                break
        if not service and dimensions:
            service = dimensions[0].get("value", "")

        return Signal(
            id="",
            tenant_id="",
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            service=service or None,
            environment=alarm.get("Region", ""),
            severity=severity,
            status="resolved" if new_state == "OK" else "firing",
            title=alarm.get("AlarmName", ""),
            summary=alarm.get("NewStateReason", ""),
            labels_json={
                "alarm_arn": alarm.get("AlarmArn", ""),
                "aws_account_id": alarm.get("AWSAccountId", ""),
                "region": alarm.get("Region", ""),
                "metric_name": trigger.get("MetricName", ""),
                "namespace": trigger.get("Namespace", ""),
                "threshold": trigger.get("Threshold"),
                "comparison_operator": trigger.get("ComparisonOperator", ""),
                "old_state": alarm.get("OldStateValue", ""),
                "new_state": new_state,
            },
            fingerprint="",
            correlation_key="",
            occurred_at=None,
        )
