# Agent Development Kit (ADK) - NextGen

**Last Updated**: September 3, 2026

## Getting Started

### Prerequisites

- Node.js 22+
- Docker & Docker Compose (v2)

### Option A: Run an Existing Assistant

```bash
# 1. Start NextGen services
./setup.sh

# 2. Start the frontend (in a new terminal)
cd frontend-nextgen
npm install
npm run dev

# 3. Open browser
http://localhost:8080
```

### Option B: Create a Custom Assistant

```bash
# 1. Start NextGen services
./setup.sh

# 2. Register your assistant via the Worker Pool API
curl -X POST http://localhost:3200/api/workers/assistants \
  -H "Content-Type: application/json" \
  -d '{"id":"my-assistant","tenantId":"tenant-1","name":"My Assistant","description":"Custom assistant","model":"llama3","capabilities":["chat"],"systemPrompt":"You are helpful.","tools":[],"metadata":{}}'

# 3. Execute the assistant
curl -X POST http://localhost:3200/api/workers/assistants/my-assistant/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello!"}'
```

### Setup Script

`./setup.sh` performs the following:
- Validates Docker and Docker Compose are installed
- Creates `.env` from `.env.example` and generates `SHARED_SECRET` and `ADMIN_SECRET` if blank
- Generates RSA key pairs under `shared/keys/`
- Builds Docker images
- Starts services with `docker compose up -d --wait --timeout 300`

To stop services: `docker compose down`

---

## Creating Assistants

### Assistant Registration Pattern

Assistants are registered dynamically via the Worker Pool API. There is no separate process or SDK bootstrap required.

```bash
POST /api/workers/assistants
```

**Request Body:**

```json
{
  "id": "my-assistant",
  "tenantId": "tenant-1",
  "name": "My Assistant",
  "description": "Handles domain-specific tasks",
  "model": "llama3",
  "capabilities": ["chat", "tools"],
  "systemPrompt": "You are a helpful domain expert.",
  "tools": [],
  "metadata": {}
}
```

**Response:** `201 Created` with the registered `AssistantDefinition`.

### Executing an Assistant

```bash
POST /api/workers/assistants/:id/execute
```

**Request Body:**

```json
{
  "prompt": "What is the weather today?",
  "context": {
    "userId": "user-123",
    "sessionId": "session-456"
  }
}
```

**Response:**

```json
{
  "assistantId": "my-assistant",
  "success": true,
  "output": "I cannot check real-time weather...",
  "tokensUsed": 42,
  "durationMs": 1200
}
```

### Registering MCP Tools

Tools are registered with the MCP Runtime service and referenced in the assistant definition.

```bash
# Register an MCP tool
POST http://localhost:3300/tools
Content-Type: application/json

{
  "name": "get-weather",
  "description": "Get current weather for a location",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": { "type": "string" }
    },
    "required": ["location"]
  }
}
```

Then include the tool in the assistant definition:

```json
{
  "tools": [
    {
      "name": "get-weather",
      "description": "Get current weather for a location",
      "inputSchema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ]
}
```

---

## Architecture Overview

### NextGen Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                     │
│                        Port 8080                             │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP + WebSocket
┌────────────────────────────┴────────────────────────────────┐
│                         Gateway                              │
│                     Port 3000                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Proxy     │  │   WebSocket │  │   Message Router    │  │
│  │  Routes     │  │   Gateway   │  │   (internal)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Worker Pool    │ │  Agent Runtime  │ │  Tool Executor  │
│    Port 3200    │ │    Port 3400    │ │    Port 3500    │
│                 │ │                 │ │                 │
│  • Assistant    │ │  • Agent state  │ │  • Sandboxed    │
│    registry     │ │    machine      │ │    execution    │
│  • Task queue   │ │  • Mission mgr  │ │  • API clients  │
│  • Executor     │ │  • Collaboration│ │  • Code runner  │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     Brain       │ │   Temporal      │ │   MCP Runtime   │
│   (LLM/Orch)    │ │   Port 4100     │ │    Port 3300    │
│                 │ │                 │ │                 │
│  • Model select │ │  • Workflows    │ │  • Tool registry│
│  • Prompt mgr   │ │  • Retries      │ │  • Stdio/HTTP   │
│  • Token track  │ │  • Scheduling   │ │    transports   │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     Shared Infrastructure                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │   Auth   │ │  Vault   │ │ Persist  │ │    Redis     │  │
│  │ :4300    │ │  :4000   │ │  :4200   │ │    :6379     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐                                             │
│  │  Mongo   │                                             │
│  │ :27017   │                                             │
│  └──────────┘                                             │
└─────────────────────────────────────────────────────────────┘
```

### Message Flow

```
User Input
    ↓
Frontend (React)
    ↓
HTTP POST /api/workers/assistants/:id/execute
    ↓
Gateway (port 3000)
    ↓
Worker Pool (port 3200)
    ↓
AssistantExecutor
    ↓
Brain (LLM orchestration + tool selection)
    ↓
MCP Runtime (port 3300) / Tool Executor (port 3500)
    ↓
Agent Runtime (port 3400) for stateful workflows
    ↓
Temporal (port 4100) for durable workflows
    ↓
Response returned through Worker Pool → Gateway → Frontend
```

### Service Responsibilities

| Service | Port | Responsibility |
|---------|------|----------------|
| **Frontend** | 8080 | React UI, chat interface |
| **Gateway** | 3000 | Unified entry point, proxy routing, WebSocket |
| **Worker Pool** | 3200 | Assistant registry, task queue, execution |
| **Brain** | internal | LLM selection, prompt management, token tracking |
| **MCP Runtime** | 3300 | MCP tool registry, stdio/HTTP transports |
| **Agent Runtime** | 3400 | Agent state machines, missions, collaboration |
| **Tool Executor** | 3500 | Sandboxed code execution, API clients |
| **Temporal** | 4100 | Durable workflow orchestration |
| **Auth** | 4300 | JWT, RBAC, service tokens |
| **Vault** | 4000 | Envelope encryption, secrets management |
| **Persistence** | 4200 | Session storage, tenant isolation |
| **Redis** | 6379 | Cache, pub/sub, queues |
| **Mongo** | 27017 | Document persistence |

---

## API Reference

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
