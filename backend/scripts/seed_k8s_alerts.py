"""Seed 10 common Kubernetes alerts into the database.

Each alert is injected as an Incident + Signal + IncidentSignalLink
so it appears correctly on the incidents dashboard.

Usage:
  cd backend
  PYTHONPATH=. uv run python scripts/seed_k8s_alerts.py
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
import uuid
from datetime import UTC, datetime, timedelta

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlmodel import Session

from app.alerting.dedup import compute_fingerprint, compute_payload_hash
from app.models.alerting import AlertSource, Incident, IncidentSignalLink, RawAlert, Signal
from deerflow.database.session import get_session_factory

# ---------------------------------------------------------------------------
# K8s alert definitions — 10 common Kubernetes alerts
# ---------------------------------------------------------------------------

K8S_ALERTS: list[dict] = [
    {
        "title": "Pod CrashLoopBackOff",
        "summary": "Pod default/nginx-deployment-7b9f8c6d5-x8j2k has been in CrashLoopBackOff for more than 15 minutes.",
        "severity": "critical",
        "service": "nginx-ingress",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubePodCrashLooping",
            "namespace": "default",
            "pod": "nginx-deployment-7b9f8c6d5-x8j2k",
            "container": "nginx",
            "severity": "critical",
            "team": "platform-eng",
            "instance": "node-1",
            "job": "kube-state-metrics",
        },
    },
    {
        "title": "Node Disk Pressure",
        "summary": "Node worker-3 is experiencing disk pressure — filesystem /var/lib/docker usage is at 92%.",
        "severity": "warning",
        "service": "kubernetes",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeNodeDiskPressure",
            "node": "worker-3",
            "severity": "warning",
            "team": "infra",
            "instance": "worker-3",
            "job": "node-exporter",
        },
    },
    {
        "title": "CPU Throttling High",
        "summary": "Container payment-service in namespace payments is experiencing high CPU throttling (85%) over the last 10 minutes.",
        "severity": "warning",
        "service": "payment-service",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeCPUThrottlingHigh",
            "namespace": "payments",
            "pod": "payment-service-6c8b9d7f4-abc12",
            "container": "payment-service",
            "severity": "warning",
            "team": "payments",
            "instance": "node-2",
            "job": "cadvisor",
        },
    },
    {
        "title": "Deployment Replicas Mismatch",
        "summary": "Deployment auth-service in namespace auth has 2 available replicas but 5 are desired.",
        "severity": "major",
        "service": "auth-service",
        "environment": "staging",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeDeploymentReplicasMismatch",
            "namespace": "auth",
            "deployment": "auth-service",
            "severity": "major",
            "team": "identity",
            "instance": "kube-state-metrics-0",
            "job": "kube-state-metrics",
        },
    },
    {
        "title": "PersistentVolume Filling Up",
        "summary": "PersistentVolume pvc-7f8a9b2c-data is 88% full (88 GiB / 100 GiB) on PVC postgres-data.",
        "severity": "warning",
        "service": "postgres",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubePersistentVolumeFillingUp",
            "namespace": "database",
            "persistentvolumeclaim": "postgres-data",
            "severity": "warning",
            "team": "dba",
            "instance": "pvc-monitor-0",
            "job": "kubelet",
        },
    },
    {
        "title": "HPA Max Replicas Reached",
        "summary": "HorizontalPodAutoscaler api-gateway-hpa in namespace gateway has reached its maximum of 20 replicas.",
        "severity": "major",
        "service": "api-gateway",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeHpaMaxReplicasReached",
            "namespace": "gateway",
            "hpa": "api-gateway-hpa",
            "severity": "major",
            "team": "platform-eng",
            "instance": "kube-state-metrics-1",
            "job": "kube-state-metrics",
        },
    },
    {
        "title": "Job Failed",
        "summary": "CronJob nightly-cleanup (job nightly-cleanup-28175340) in namespace ops has failed after 3 retries.",
        "severity": "minor",
        "service": "cron-jobs",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeJobFailed",
            "namespace": "ops",
            "job_name": "nightly-cleanup",
            "severity": "minor",
            "team": "sre",
            "instance": "kube-state-metrics-2",
            "job": "kube-state-metrics",
        },
    },
    {
        "title": "OOMKilled Container",
        "summary": "Container ml-inference in pod ml-inference-5d4c8b6f7-zx98w was OOMKilled — memory limit 512Mi exceeded.",
        "severity": "critical",
        "service": "ml-inference",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeContainerOOMKilled",
            "namespace": "ml",
            "pod": "ml-inference-5d4c8b6f7-zx98w",
            "container": "ml-inference",
            "severity": "critical",
            "team": "ml-eng",
            "instance": "node-5",
            "job": "kube-state-metrics",
        },
    },
    {
        "title": "Certificate Expiring Soon",
        "summary": "TLS certificate for ingress public-api.example.com will expire in 7 days (not after 2026-06-18).",
        "severity": "critical",
        "service": "cert-manager",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeCertificateExpiringSoon",
            "namespace": "cert-manager",
            "certificate": "public-api-tls",
            "domain": "public-api.example.com",
            "severity": "critical",
            "team": "platform-eng",
            "instance": "cert-manager-0",
            "job": "cert-manager",
        },
    },
    {
        "title": "etcd Leader Changes Frequently",
        "summary": "etcd cluster has experienced 5 leader elections in the last 10 minutes — possible network partition.",
        "severity": "critical",
        "service": "etcd",
        "environment": "production",
        "source": "prometheus",
        "labels": {
            "alertname": "KubeEtcdHighNumberOfLeaderChanges",
            "namespace": "kube-system",
            "severity": "critical",
            "team": "infra",
            "instance": "etcd-0",
            "job": "etcd-metrics",
        },
    },
]


def _make_incident_key(now: datetime, index: int) -> str:
    """Generate a stable incident key."""
    short_hex = uuid.uuid4().hex[:6].upper()
    return f"INC-{now.strftime('%Y%m%d')}-{short_hex}"


async def seed_k8s_alerts(tenant_id: str) -> list[Incident]:
    """Inject 10 K8s alerts as Incidents with linked Signals for the given tenant."""
    factory = get_session_factory()
    now = datetime.now(UTC)

    alerts_staggered: list[dict] = []
    for i, alert in enumerate(K8S_ALERTS):
        data = dict(alert)
        data["occurred_at"] = now - timedelta(minutes=30 - i * 3)
        data["index"] = i
        alerts_staggered.append(data)

    # --- Check for existing alert source, create if absent ---
    prom_source_id: str | None = None
    async with factory() as session:
        src_result = await session.exec(
            select(AlertSource).where(
                AlertSource.tenant_id == tenant_id,
                AlertSource.name == "prometheus-k8s",
            ).limit(1)
        )
        prom_source = src_result.scalars().first()
        if prom_source is None:
            prom_source = AlertSource(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                name="prometheus-k8s",
                type="prometheus",
                status="active",
                auth_mode="none",
                config_json={
                    "analysis_trigger": {
                        "mode": "auto",
                    },
                },
            )
            session.add(prom_source)
            await session.commit()
        prom_source_id = prom_source.id

    # --- Insert each alert individually ---
    severity_to_priority = {
        "critical": "p1", "major": "p2", "warning": "p3", "minor": "p4", "info": "p4",
    }
    incidents: list[Incident] = []

    for data in alerts_staggered:
        async with factory() as session:
            occurred_at = data["occurred_at"]
            fingerprint = compute_fingerprint(
                source=data["source"], service=data["service"],
                environment=data["environment"], severity=data["severity"],
                labels=data["labels"],
            )
            payload = {
                "title": data["title"], "summary": data["summary"],
                "severity": data["severity"], "service": data["service"],
                "environment": data["environment"], "source": data["source"],
                "labels": data["labels"],
            }

            # RawAlert
            raw_alert_id = str(uuid.uuid4())
            raw_alert = RawAlert(
                id=raw_alert_id, tenant_id=tenant_id,
                source_id=prom_source_id,
                payload_hash=compute_payload_hash(payload),
                payload_json=payload,
                received_at=occurred_at, ingest_status="normalized",
            )
            session.add(raw_alert)

            # Signal
            signal_id = str(uuid.uuid4())
            signal = Signal(
                id=signal_id, tenant_id=tenant_id, raw_alert_id=raw_alert_id,
                source=data["source"], service=data["service"],
                environment=data["environment"], severity=data["severity"],
                status="firing", title=data["title"], summary=data["summary"],
                labels_json=data["labels"], fingerprint=fingerprint,
                correlation_key=fingerprint, occurred_at=occurred_at,
            )
            session.add(signal)

            # Incident
            incident_id = str(uuid.uuid4())
            incident = Incident(
                id=incident_id, tenant_id=tenant_id,
                incident_key=_make_incident_key(now, data["index"]),
                title=data["title"], summary=data["summary"],
                severity=data["severity"],
                priority=severity_to_priority.get(data["severity"], "p3"),
                status="firing", service=data["service"],
                environment=data["environment"],
                owner_team_id=data["labels"].get("team"),
                signal_count=1,
                first_seen_at=occurred_at, last_seen_at=occurred_at,
            )
            session.add(incident)

            # IncidentSignalLink
            link = IncidentSignalLink(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                incident_id=incident_id, signal_id=signal_id,
                linked_at=occurred_at,
            )
            session.add(link)
            await session.commit()

            # Re-read the committed incident so the returned object has correct IDs
            committed = await session.get(Incident, incident_id)
            incidents.append(committed)

    return incidents


async def _get_docker_departments_tenant_id() -> str | None:
    """Retrieve the 'docker departments' tenant ID by slug."""
    from sqlalchemy import text

    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            text("SELECT id FROM tenants WHERE slug = 'docker-departments-384876' LIMIT 1")
        )
        row = result.first()
        return str(row[0]) if row else None


async def _run() -> None:
    tenant_id = await _get_docker_departments_tenant_id()
    if not tenant_id:
        print("ERROR: 'docker departments' tenant not found. Run backfill_default_tenants.py first.")
        sys.exit(1)

    print(f"Using tenant_id={tenant_id}")
    incidents = await seed_k8s_alerts(tenant_id)
    print(f"Seeded {len(incidents)} K8s alerts as incidents:")
    for inc in incidents:
        print(f"  [{inc.priority}] {inc.incident_key} — {inc.title}  [{inc.severity}] {inc.service}/{inc.environment}")


if __name__ == "__main__":
    asyncio.run(_run())
