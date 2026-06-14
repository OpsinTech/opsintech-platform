"""Alert source provider abstraction — inspired by Keep's Provider pattern.

Each provider knows how to parse an external payload into a RawAlert
and then normalise it into a Signal.
"""

from abc import ABC, abstractmethod

from app.models.alerting import RawAlert, Signal


class BaseAlertProvider(ABC):
    """Abstract base for alert source providers.

    Subclasses implement parse_raw_payload() for their specific
    external format.  The base class provides a default normalize()
    that can be overridden per provider.
    """

    provider_type: str  # "alertmanager", "webhook", "grafana", etc.

    @abstractmethod
    def parse_raw_payload(self, body: dict, headers: dict) -> RawAlert:
        """Parse an external payload into the platform's RawAlert model.

        Args:
            body: The parsed JSON body from the incoming request.
            headers: The request headers (for auth validation, etc.).

        Returns:
            A populated RawAlert instance (not yet persisted).
        """
        ...

    def normalize(self, raw_alert: RawAlert, source_config: dict | None = None) -> Signal:
        """Convert a RawAlert into a normalised Signal.

        The default implementation extracts common fields from the
        raw alert's payload.  Providers may override to handle
        provider-specific conventions.

        Args:
            raw_alert: The persisted RawAlert.
            source_config: The alert source's config_json (field_mapping, auth, etc.).

        Returns:
            A Signal instance ready for dedup / correlation.
        """
        payload = raw_alert.payload_json or {}
        return Signal(
            id="",  # assigned on flush
            tenant_id=raw_alert.tenant_id,
            raw_alert_id=raw_alert.id,
            source=self.provider_type,
            severity=payload.get("severity", "warning"),
            status=payload.get("status", "firing"),
            title=payload.get("title") or payload.get("summary", ""),
            summary=payload.get("summary", ""),
            labels_json=payload.get("labels", {}),
            fingerprint="",  # computed by dedup engine
            correlation_key="",  # computed by correlation engine
            occurred_at=raw_alert.received_at,
        )

    def validate_auth(self, headers: dict, config: dict) -> bool:
        """Validate authentication for the incoming request.

        Args:
            headers: Request headers.
            config: The alert_source config_json.

        Returns:
            True if the request is authenticated.
        """
        auth_mode = config.get("auth_mode", "none")
        if auth_mode == "none":
            return True
        if auth_mode == "token":
            token_header = config.get("token_header", "X-Alert-Token")
            expected = config.get("token", "")
            if not expected:
                return False
            # Headers are lowercased by the ingest route; match case-insensitively.
            return headers.get(token_header.lower(), "") == expected
        return True  # future: signature verification
