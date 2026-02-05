# Enterprise Persistence & Session Model (Single-Tenant)

**Last Updated**: February 3, 2026  
**Audience**: Platform, SDK, and API owners  
**Scope**: Enterprise (single-tenant) deployments only

---

## 1) Scope & Assumptions

- **Single-tenant**: one enterprise per deployment; no cross-tenant isolation requirements.
- **Multi-client is expected**: multiple users and concurrent sessions within the same enterprise.
- **SDK-first**: assistants use event-driven state and Librarian-backed persistence.
- **Goal**: reliable, enterprise-grade persistence and session isolation without multi-tenant complexity.

---

## 2) Session & Instance Model

### Definitions
- **User**: authenticated enterprise user (SSO/IdP backed).
- **Conversation**: a user session thread identified by `conversationId`.
- **Agent instance**: a running assistant runtime bound to a `conversationId` (and `userId`).
- **Agent class**: assistant type (Sales, HR, Legal, etc.).

### Rules
- **Default**: one active instance per user per agent class.
- **Allow multiple instances** when:
  - the user explicitly opens parallel workstreams,
  - tasks are long-running or background,
  - collaborative workflows require simultaneous sessions.

### Required identifiers (no tenant)
All SDK and service calls must carry:
- `userId`
- `conversationId`
- `agentClass` (e.g., `sales-assistant`)
- `instanceId` (optional; required for multi-instance)

---

## 3) Persistence Model (Enterprise)

### System of Record
- **Librarian** remains the primary persistence layer (MongoDB/Redis/Chroma).
- **AgentSet state** continues to save/load agent state via Librarian.

### Data Partitioning (single-tenant)
Partition by:
- `userId` + `conversationId` + `agentClass` (+ `instanceId` when present)

### Data Categories
- **Conversation state**: event stream + snapshots (per conversation).
- **Agent state**: runtime state, steps, outputs, and work products.
- **Artifacts**: files and deliverables (Librarian + storage). 

### Retention
- Default **30–90 days** configurable by enterprise policy.
- Support explicit **archive** and **hard delete** by user or admin policy.

---

## 4) SDK Requirements (Single-Tenant)

### Required SDK context
All SDK entry points that write or read state must include:
- `userId`, `conversationId`, `agentClass`, and optional `instanceId`.

### Required SDK behaviors
- **Session lifecycle**: create, resume, end, and TTL cleanup.
- **Instance lifecycle**: create/resume multi-instance and enumerate active instances.
- **State operations**: load/merge/get scoped to conversation + instance.

### Expected SDK API surface (minimal)
- `startConversation(userId, initialPrompt, { agentClass, instanceId? })`
- `getActiveSessions(userId, agentClass)`
- `getConversation(conversationId)`
- `endConversation(conversationId)`

---

## 5) Service Requirements

### AgentSet
- Persist and load agent state with explicit `userId`/`conversationId` scoping.
- Enforce **no cross-user read/write** within enterprise.

### Librarian
- Support collection partitioning with indexed `userId`, `conversationId`, `agentClass`, `instanceId`.
- Implement **query guardrails** to prevent cross-user state leakage.

### MissionControl / TrafficManager
- Route user messages by conversation + instance.
- Provide clean lifecycle operations (pause/resume/abort) per instance.

---

## 6) Enterprise-grade Persistence Strategy

1. **Durable event log + snapshots**
   - Append-only event store; periodic snapshots for fast resume.
2. **Tiered storage**
   - Redis hot cache; Mongo for durable state; object store for artifacts.
3. **Backups & recovery**
   - Automated nightly backups; restore by conversation scope.
4. **Auditability**
   - Event logs and access logs keyed by `userId` + `conversationId`.
5. **Policy controls**
   - Admin-configured retention, export, and deletion policies.

---

## 7) Implementation Checklist

- [ ] Add `userId` + `agentClass` + `instanceId` propagation to SDK events.
- [ ] Enforce scoped persistence in Librarian queries.
- [ ] Update AgentSet `saveAgent` / `loadAgent` to include user/conversation scope.
- [ ] Add lifecycle APIs for conversation/instance management.
- [ ] Add retention + archival jobs.

---

## 8) Non-Goals (Single-Tenant Simplifications)

- No cross-tenant isolation layer.
- No per-tenant billing or quota segregation.
- No tenant routing or tenancy sharding.

---

## 9) References

- SDK architecture and persistence model: [docs/ADK/SDK-ARCHITECTURE.md](../ADK/SDK-ARCHITECTURE.md)
- AgentSet API snapshot (persistence endpoints): [docs/CORE_SYSTEMS/API.md](./API.md)
