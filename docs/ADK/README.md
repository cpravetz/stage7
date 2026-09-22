# Agent Development Kit (ADK) - Current Implementation

This document describes the ADK that is actually implemented in this repository. The active implementation is not the historical microservice-only design described in older docs; it lives in the TypeScript composition layer under the tool executor and is validated by the ADK composition tests.

## What is the current ADK?

The active ADK is a builder-based composition model that defines:

- Tools and code skills
- Workflow stages and lanes
- Context and approval policies
- Assistant definitions and runtime persistence policies

The primary implementation lives here:

- [../../services/tool-executor/src/adk/contracts.ts](../../services/tool-executor/src/adk/contracts.ts)
- [../../services/tool-executor/src/adk/builders.ts](../../services/tool-executor/src/adk/builders.ts)
- [../../services/tool-executor/src/adk/index.ts](../../services/tool-executor/src/adk/index.ts)

## Quick start: create a custom assistant

```ts
import {
  createAssistant,
  createApprovalPolicy,
  createContextPolicy,
  createPersistencePolicy,
  createSkill,
  createTool,
  createWorkflow,
  createWorkflowLane,
  createWorkflowStage,
} from '../services/tool-executor/src/adk';

const planningTool = createTool({
  id: 'event_planning_budgeting',
  name: 'Event Planning & Budgeting',
  description: 'Create an event plan and budget.',
  type: 'code',
  inputSchema: {
    type: 'object',
    properties: { eventName: { type: 'string' } },
    required: ['eventName'],
  },
  outputSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' } },
  },
});

const workflow = createWorkflow({
  assistantId: 'event',
  productObject: 'event / vendor',
  flow: 'plan -> vendors -> day-of',
  stages: [
    createWorkflowStage({
      id: 'plan',
      name: 'Plan',
      description: 'Create the event plan and budget.',
      skillIds: [planningTool.id],
      transitions: ['vendors'],
    }),
    createWorkflowStage({
      id: 'vendors',
      name: 'Vendors',
      description: 'Manage vendor contracts.',
      skillIds: [],
      transitions: ['day-of'],
    }),
    createWorkflowStage({
      id: 'day-of',
      name: 'Day-of',
      description: 'Run event operations.',
      skillIds: [],
    }),
  ],
  lanes: [
    createWorkflowLane({
      id: 'planning',
      name: 'Planning',
      description: 'Plan the event.',
      stageIds: ['plan'],
      modes: ['draft'],
    }),
    createWorkflowLane({
      id: 'execution',
      name: 'Execution',
      description: 'Execute the event.',
      stageIds: ['vendors', 'day-of'],
      modes: ['review', 'live'],
    }),
  ],
});

const assistant = createAssistant({
  identity: { id: 'event', name: 'Event', description: 'Event operations assistant' },
  productObjects: ['event / vendor'],
  workflow,
  skills: [createSkill({ tool: planningTool, laneId: 'planning', stageId: 'plan' })],
  configuration: { defaults: { region: 'us-east' }, requiredKeys: ['region'] },
  contextPolicy: { objectKeys: ['eventId'] },
  approvalPolicy: {
    requiresConfirmation: (request) => request.action === 'book',
    dryRunByDefault: true,
    allowedStates: ['draft'],
  },
  persistence: createPersistencePolicy(new Map() as any),
});
```

This pattern is validated in [../../services/tool-executor/src/__tests__/adk-composition.test.ts](../../services/tool-executor/src/__tests__/adk-composition.test.ts).

## Core ADK concepts

### Tool

Tools are structured runtime capabilities with a manifest, input schema, output schema, and optional approval settings.

```ts
const tool = createTool({
  id: 'send_email',
  name: 'Send Email',
  description: 'Send a customer email.',
  type: 'code',
  inputSchema: {
    type: 'object',
    properties: { email: { type: 'string' }, subject: { type: 'string' } },
    required: ['email', 'subject'],
  },
});
```

### Workflow

A workflow is a set of stages and lanes bound to a product object and flow name. The builder validates stage IDs, lane IDs, and transitions.

### Context policy

Context policies enforce object identity and stage continuity. They can reject a changed object ID or cross-object handoff when configured.

### Approval policy

Approval policies decide whether a tool action requires confirmation. They also support dry-run defaults and allowed workflow states.

### Persistence policy

The ADK supports in-memory or custom persistence ports, with revision tracking and namespace scoping.

## Sample assistants already in the repo

The project includes a set of concrete workflow definitions under [../../services/tool-executor/src/data/skills](../../services/tool-executor/src/data/skills):

- [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts) — event planning, vendor management, day-of operations
- [../../services/tool-executor/src/data/skills/sales/index.ts](../../services/tool-executor/src/data/skills/sales/index.ts) — sales workflow
- [../../services/tool-executor/src/data/skills/support/index.ts](../../services/tool-executor/src/data/skills/support/index.ts) — support workflow
- [../../services/tool-executor/src/data/skills/product/index.ts](../../services/tool-executor/src/data/skills/product/index.ts) — product workflow
- [../../services/tool-executor/src/data/skills/healthcare/index.ts](../../services/tool-executor/src/data/skills/healthcare/index.ts) — healthcare workflow

The registry exports the full set through [../../services/tool-executor/src/data/skills/index.ts](../../services/tool-executor/src/data/skills/index.ts), and the runtime routes expose quick access through the workflow API in [../../services/tool-executor/src/routes/workflows.ts](../../services/tool-executor/src/routes/workflows.ts).

Example event workflow:

```ts
export const eventWorkflow = createWorkflow({
  assistant: 'Event',
  productObject: 'event / vendor',
  flow: 'plan → vendors → day-of',
  stages: [
    { name: 'plan', description: 'Event planning and budgeting', stageIds: ['event_planning_budgeting'] },
    { name: 'vendors', description: 'Vendor and contract management', stageIds: ['event_vendor_contract_management'] },
    { name: 'day-of', description: 'Day-of operations', stageIds: ['event_day_of_operations'] },
  ],
}, eventSkills);
```

The actual file is [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts).

## How to use the sample assistant runtime

The service exposes workflow endpoints for listing workflows and building runtime workflow views:

- GET /workflows
- GET /workflows/:assistant
- GET /workflows/:assistant/runtime
- POST /workflows/:assistant/runtime

These routes are defined in [../../services/tool-executor/src/routes/workflows.ts](../../services/tool-executor/src/routes/workflows.ts).

The workspace-level API allows creating or resuming workspaces and moving them through workflow states in [../../services/tool-executor/src/routes/workspaces.ts](../../services/tool-executor/src/routes/workspaces.ts).

## Validation and testing

The current ADK implementation is verified by the test suite:

```bash
cd services/tool-executor
npm test -- --runInBand src/__tests__/adk-composition.test.ts
```

The repository also includes governance and schema validation tests relevant to workflow composition and overlap rules.

## Important clarification

Older ADK documents in this folder describe a superseded architecture. They are historical reference material, not the source of truth for the active runtime. Current code and tests in the tool executor should be treated as the canonical guide for assistant creation in this workspace.

### Worker Pool API

Base URL: `http://localhost:3200/api/workers`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check |
| `POST` | `/assistants` | Register assistant definition |
| `GET` | `/assistants` | List all assistants |
| `GET` | `/assistants/:id` | Get assistant by ID |
| `DELETE` | `/assistants/:id` | Unregister assistant |
| `POST` | `/assistants/:id/runtime` | Configure runtime (worker, queue, timeout) |
| `POST` | `/assistants/:id/execute` | Execute assistant with prompt |
| `POST` | `/assistants/:id/tools/execute` | Execute tool by name |
| `POST` | `/workers` | Register worker |
| `GET` | `/workers` | List workers |
| `POST` | `/tasks` | Submit task to queue |
| `GET` | `/tasks/:taskId` | Get task status |
| `POST` | `/workers/:workerId/process` | Process next task |
| `POST` | `/workers/:workerId/complete` | Mark task complete |
| `POST` | `/workers/:workerId/fail` | Mark task failed |
| `GET` | `/queue/size` | Get queue depth |
| `GET` | `/config` | Get pool configuration |

### Gateway API

Base URL: `http://localhost:3000`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Gateway health |
| `GET` | `/services` | List registered services |
| `GET` | `/services/:id/health` | Service health check |
| `*` | `/:service/*` | Proxy to backend service |
| `WS` | `/ws` | WebSocket gateway |

### MCP Runtime API

Base URL: `http://localhost:3300`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tools` | Register MCP tool |
| `DELETE` | `/tools/:name` | Unregister tool |
| `GET` | `/tools` | List tools |
| `POST` | `/rpc` | JSON-RPC endpoint (`tools/list`, `tools/call`) |

### Auth API

Base URL: `http://localhost:4300/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Auth service health |
| `POST` | `/login` | User login (email + password) |
| `POST` | `/service/auth` | Service authentication (serviceId + apiKey) |
| `POST` | `/refresh` | Refresh JWT token |
| `GET` | `/verify` | Verify current token |
| `POST` | `/users/:id/roles` | Assign role to user |

### Persistence API

Base URL: `http://localhost:4200`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Persistence health |
| *(see docs/CORE_SYSTEMS/ENTERPRISE_PERSISTENCE_STRATEGY.md)* | | Session & tenant data |

---

## Troubleshooting

### Common Issues

**Issue: Services fail to start**
```bash
# Check container status
docker compose ps

# View logs for a specific service
docker compose logs -f worker-pool
docker compose logs -f gateway
docker compose logs -f mcp-runtime
```

**Issue: Worker Pool health check failing**
```
curl http://localhost:3200/api/workers/health
```
Expected: `{"status":"ok","service":"worker-pool",...}`

**Issue: Assistant not found during execution**
```
{"error":"Assistant not found"}
```
Solution: Verify the assistant was registered with `GET /api/workers/assistants`.

**Issue: Frontend cannot reach Gateway**
```
Proxy error, ECONNREFUSED
```
Solution: Ensure Gateway is running on port 3000 and frontend is on 8080. Check `docker compose ps`.

**Issue: WebSocket connection fails**
Solution: Verify Gateway WebSocket is active at `ws://localhost:3000/ws`. Check browser console and Gateway logs.

### Health Check Endpoints

| Service | Endpoint |
|---------|----------|
| Gateway | `http://localhost:3000/health` |
| Worker Pool | `http://localhost:3200/api/workers/health` |
| MCP Runtime | `http://localhost:3300/health` |
| Auth | `http://localhost:4300/api/auth/health` |
| Vault | `http://localhost:4000/health` |
| Persistence | `http://localhost:4200/health` |
| Temporal | `http://localhost:4100/health` |
| Agent Runtime | `http://localhost:3400/health` |
| Tool Executor | `http://localhost:3500/health` |

---

## Security

### Authentication

The NextGen Auth service (port 4300) handles all authentication:

- **User Auth**: JWT tokens via `POST /api/auth/login`
- **Service Auth**: API key + serviceId via `POST /api/auth/service/auth`
- **Token Refresh**: `POST /api/auth/refresh`
- **Verification**: `GET /api/auth/verify`

### Secrets Management

Use Vault (port 4000) for secrets encryption and storage:

- Envelope encryption for sensitive data
- Secrets are never stored in plain text in configuration files
- `.env` should only contain non-sensitive configuration

**Best Practices:**
- Never commit secrets to version control
- Use `SHARED_SECRET` and `ADMIN_SECRET` generated by `setup.sh`
- Store API keys in Vault or environment variables
- Use Docker secrets for container deployments

### RBAC

The Auth service includes RBAC:

- Role assignment via `POST /api/auth/users/:id/roles`
- Permissions checked at Gateway and service levels
- Tenant isolation enforced at the data layer

---

## Performance

### Key Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Gateway Latency | < 50ms | Proxy overhead only |
| Worker Pool Task Submit | < 10ms | Redis-backed queue |
| Assistant Execution | < 5s | Depends on LLM latency |
| MCP Tool Call | < 2s | Local tool execution |
| Frontend Load | < 2s | Vite HMR in dev |

### Scaling

- **Worker Pool**: Horizontal scaling via multiple instances (minWorkers: 2, maxWorkers: 50)
- **Gateway**: Stateless proxy; scale behind load balancer
- **MCP Runtime**: Tool registry is in-memory; share via Redis pub/sub for multi-instance
- **Temporal**: Durable workflow engine; scales workers independently
- **Redis**: Shared queue backing; ensure persistence mode for reliability

### Optimization Tips

1. **Pool Config**: Tune `minWorkers`, `maxWorkers`, and `queueSize` in Worker Pool config
2. **Cache**: Use Redis for repeated model responses and tool results
3. **Batch**: Submit related tasks with the same `type` for sequential processing
4. **Monitor**: Track queue depth via `GET /api/workers/queue/size`

---

## Documentation Index

### Essential Guides

- [INDEX.md](./INDEX.md) - Complete documentation navigation
- [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) - ADK system overview
- [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) - Technical API reference
- [TOOL-DEVELOPMENT.md](./ADK/TOOL-DEVELOPMENT.md) - Build custom tools
- [DEPLOYMENT.md](./ADK/DEPLOYMENT.md) - Production deployment
- [ASSISTANT_STARTUP_GUIDE.md](./ADK/ASSISTANT_STARTUP_GUIDE.md) - Service reference

### Core Systems

- [../CORE_SYSTEMS/BRAIN_SERVICE.md](../CORE_SYSTEMS/BRAIN_SERVICE.md) - LLM model selection and health
- [../CORE_SYSTEMS/authentication.md](../CORE_SYSTEMS/authentication.md) - JWT, RBAC, credentials
- [../CORE_SYSTEMS/ENTERPRISE_PERSISTENCE_STRATEGY.md](../CORE_SYSTEMS/ENTERPRISE_PERSISTENCE_STRATEGY.md) - Session & persistence
- [../CORE_SYSTEMS/collaboration-services.md](../CORE_SYSTEMS/collaboration-services.md) - Multi-agent coordination
- [../CORE_SYSTEMS/plugin_config_and_secrets.md](../CORE_SYSTEMS/plugin_config_and_secrets.md) - Plugin configuration
- [../CORE_SYSTEMS/security_improvements.md](../CORE_SYSTEMS/security_improvements.md) - Security architecture
- [../CORE_SYSTEMS/message-queue.md](../CORE_SYSTEMS/message-queue.md) - Async messaging

### Architecture & Reference

- [../v2/v2-architecture-overview.md](../v2/v2-architecture-overview.md) - ⚠️ Superseded V2 architecture (replaced by NextGen)
- [../STAGE7_NEXTGEN_REBUILD_PROPOSAL.md](../STAGE7_NEXTGEN_REBUILD_PROPOSAL.md) - Current NextGen architectural blueprint
- [../ACTIVE_REFERENCE/Step Architecture.md](../ACTIVE_REFERENCE/Step%20Architecture.md) - Step lifecycle
- [../ACTIVE_REFERENCE/TASK_MANAGER_PLUGIN_DESIGN.md](../ACTIVE_REFERENCE/TASK_MANAGER_PLUGIN_DESIGN.md) - Task plugin spec

---

## ADK Features

- **Dynamic Registration**: Assistants registered at runtime via API
- **Worker Pool Execution**: Scalable task queue with retry and concurrency control
- **MCP Tool Integration**: Standard Model Context Protocol tool registry
- **Temporal Workflows**: Durable, long-running agent orchestration
- **Vault Secrets**: Centralized secrets and envelope encryption
- **NextGen Auth**: JWT + RBAC with service account support
- **Multi-Tenant**: Tenant isolation at data and service layers
- **Observable**: Structured logging with Pino, health checks on all services

---

**Version**: NextGen (2026-08-30)
**Status**: Active Development
