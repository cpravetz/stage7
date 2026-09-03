Stage7 NextGen — Deployment Guide
================================

This document describes recommended deployment patterns for Stage7 NextGen: production-ready configuration, required infrastructure, and quick deployment steps.

Supported Topology
------------------

- Unified API Gateway (HTTP/WS)
- Worker Pool (serverless/shared workers) running assistant runtimes
- Durable workflow engine (Temporal)
- Persistence: Document DB (MongoDB or Postgres for Temporal), Vector store (Chroma/Redis/Weaviate), Redis cache
- Secrets: HashiCorp Vault (recommended) or cloud KMS-backed vault
- Observability: OpenTelemetry + Jaeger/Datadog

Prerequisites
-------------

- Linux host or container platform (Kubernetes, ECS, or docker-compose for small deployments)
- Docker & docker-compose (or k8s manifests)
- A Temporal cluster (managed or self-hosted)
- Vault server for secret envelope encryption
- Object storage (S3/GCS) for artifact storage (optional)

Environment & Configuration
---------------------------

- Use environment variables or a secret manager to provide service credentials. Do NOT store provider keys in plain `.env` files for production.
- Configure `GATEWAY_HOST`, `TEMPORAL_ENDPOINT`, `VAULT_ADDR`, and `REDIS_URL` prior to service start.

Quick Deploy (Docker Compose - small deployments)
------------------------------------------------

1. Create or copy an environment file with production values (example: `.env.prod`).

2. Start infrastructure and platform services:

```bash
docker-compose up -d
```

3. Verify health endpoints on the Gateway and Worker Pool. Check Temporal namespaces and Vault secrets store.

Kubernetes Recommendations (production)
--------------------------------------

- Deploy Temporal as a stateful set or use a managed Temporal Cloud.
- Deploy Vault in HA mode or use a cloud KMS-backed secret system. Ensure Vault policies restrict secret access by service identity.
- Use Horizontal Pod Autoscaler (HPA) for the Worker Pool and Gateway. Configure resource limits and request reservations.
- Use OTel instrumentation and sidecar collectors to forward traces to your APM backend.

Security & Secrets
------------------

- Store provider API keys in Vault and inject short-lived credentials into runtime tasks.
- Use mTLS for internal service-to-service communication where possible.
- Apply row-level tenancy checks at persistence and encrypt sensitive fields at rest.

Upgrades & Backups
------------------

- Backup Temporal and persistence stores (DB snapshots). Use scheduled backups.
- Deploy rolling upgrades for Gateway and Workers. Temporal workflows are durable across worker restarts.

Validation
----------

- Run integration tests that exercise mission flows, tool calls, and approval gating. See `tests/integration` for reference suites.

Support
-------

- Architecture overview: docs/STAGE7_NEXTGEN_REBUILD_PROPOSAL.md
- ADK developer documentation: docs/ADK/ADK_DEVELOPER_GUIDE.md
