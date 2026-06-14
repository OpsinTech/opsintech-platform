"""Fingerprint generation and dedup — inspired by alerta's dedup approach.

Each signal receives a fingerprint computed from its stable attributes.
Duplicate signals (same tenant + fingerprint within time window) are
linked to the same incident rather than creating new ones.
"""

import hashlib
import json


def compute_fingerprint(
    source: str,
    service: str,
    environment: str,
    severity: str,
    labels: dict,
) -> str:
    """Compute a stable dedup fingerprint for a signal.

    The fingerprint is based on source, service, environment, severity,
    and a sorted subset of stable labels.  This follows alerta's approach
    of using identity attributes rather than the full payload.

    Returns:
        A hex-encoded SHA-256 fingerprint string.
    """
    stable_labels = _stable_label_subset(labels)
    key_parts = [
        source or "",
        service or "",
        environment or "",
        severity or "",
        json.dumps(stable_labels, sort_keys=True, default=str),
    ]
    key = "|".join(key_parts)
    return hashlib.sha256(key.encode()).hexdigest()


def compute_correlation_key(service: str, environment: str) -> str:
    """Compute a correlation key for grouping signals into incidents.

    Signals sharing the same service + environment are candidates
    for aggregation into the same incident.
    """
    key = f"{service or ''}|{environment or ''}"
    return hashlib.sha256(key.encode()).hexdigest()


def compute_payload_hash(payload: dict) -> str:
    """Compute a content hash for the raw payload (idempotency check)."""
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _stable_label_subset(labels: dict) -> dict:
    """Return the stable subset of labels used for fingerprinting."""
    if not labels:
        return {}
    stable_keys = {"alertname", "instance", "job", "service", "severity"}
    return {k: v for k, v in labels.items() if k in stable_keys}
