# stage7 codebase map

Depth-2 overview. All buildable packages are npm workspaces except `frontend-nextgen`.

| Path | What it is | Notable contents |
|---|---|---|
| `services/gateway/` | Unified API gateway: routing, service registry, health, WebSocket gateway (`/ws`) | `src/routes/` (gateway, proxy, messaging, workers), `src/services/WebSocketGateway` |
| `services/brain/` | LLM orchestration: structured sampling (Zod), semantic Redis cache, provider routing, circuit breakers | `src/providers/`, `src/routes/` |
| `services/worker-pool/` | Assistant task execution, Redis-backed task queue, assistant loader; requires MongoDB | `src/routes/`, `src/__tests__/`, `assistants/` (canonical assistant definitions + knowledge) |
| `services/agent-runtime/` | Agent lifecycle, role assignment, collaboration | `src/services/` (PersistentAgentRuntime) |
| `services/tool-executor/` | ADK tool/skill registry + execution, workflow/workspaces, trigger scheduler, plugin generation & sandboxing | `src/routes/`, `src/adk/`, `src/data/`, `scripts/copy-runtime-assets.js` |
| `services/temporal/` | Durable mission execution (artifacts-backed workflow runner), recurring schedules, recovery scans | `src/` |
| `services/vault/` | AES-256-GCM secret storage (Mongo-backed), `vault://` credential resolution | `src/routes/`, `src/services/SecretStore` |
| `services/artifacts/` | Document/mission persistence over Mongo; durable workspace artifacts | `src/routes/` (documents, missions, brainPersistence) |
| `services/auth/` | RS256 JWT auth, RBAC, user + service-account stores; seeds default admin | `src/routes/auth.ts`, `src/services/` (TokenService, RBACService) |
| `shared-nextgen/` | Shared TS library: logger, errors, types, assistant contracts | `src/`, `__tests__/` |
| `frontend-nextgen/` | React 18 + Vite SPA (dashboard, assistants, missions, brain metrics, vault, artifacts, tools) | `src/`, `dockerfile` (nginx-served build), own `package-lock.json` |
| `tests/` | Root jest integration suites (e2e mission flow, agent acceptance, collaboration) | `integration/` |
| `scripts/` | Repo tooling: skill schema docs, policy/registry audits, plugin signing, key management | `*.js`, `*.ts` |
| `docs/` | Guides: ADK docs, user/deployment guides, design history | `ADK/`, `ACTIVE_REFERENCE/`, `archive/` |
| `data/` | Seed JSON for workspaces/workspace revisions | `workspaces.json` |
| `keys/` | Public keys for RS256 service auth (private keys gitignored) | `public.pem`, `public.key` |
| `.kilo/`, `.vscode/` | Editor/agent assistant config | — |

Top-level config: `package.json` (workspaces + scripts), `docker-compose.yaml` (full stack),
`setup.sh` (interactive bootstrap), `env.summary` (env var → service map), `.env.example`.
