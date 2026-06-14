"""Alert source provider package."""

from app.alerting.providers.alertmanager import AlertmanagerProvider
from app.alerting.providers.base import BaseAlertProvider
from app.alerting.providers.cloudwatch import CloudWatchProvider
from app.alerting.providers.datadog import DatadogProvider
from app.alerting.providers.grafana import GrafanaProvider
from app.alerting.providers.webhook import WebhookProvider

_providers: dict[str, BaseAlertProvider] = {
    "webhook": WebhookProvider(),
    "alertmanager": AlertmanagerProvider(),
    "grafana": GrafanaProvider(),
    "cloudwatch": CloudWatchProvider(),
    "datadog": DatadogProvider(),
}


def get_provider(provider_type: str) -> BaseAlertProvider | None:
    """Look up a provider by type string."""
    return _providers.get(provider_type)


__all__ = [
    "BaseAlertProvider",
    "AlertmanagerProvider",
    "CloudWatchProvider",
    "DatadogProvider",
    "GrafanaProvider",
    "WebhookProvider",
    "get_provider",
]
