# obvious.md — stage7 (cpravetz/stage7)

Self-hosted, microservices-based AI agent platform (NextGen architecture). Node.js 20 +
TypeScript npm-workspaces monorepo with a Vite/React frontend, orchestrated by Docker
Compose in production-style deployments. MongoDB (documents/persistence) and Redis
(cache/queue) are the required infrastructure services.

## Stack

- **Runtime:** Node.js 20, TypeScript 5 (strict), CommonJS
- **Package manager:** npm workspaces (`shared-nextgen`, `services/*`); `frontend-nextgen` has its own lockfile and must be installed separately
- **Infra:** MongoDB 8 (port 27017), Redis (port 6379)
- **Frontend:** React 18 + Vite 6 (dev server port 8080, proxies `/api/*` to backend services)
- **Container path:** full stack via `docker-compose.yaml` (13 built services + mongo + redis); interactive setup: `./setup.sh`

## Services and ports (native)

| Service | Port | Entry |
|---|---|---|
| gateway | 3000 (host-mapped 3900 in compose) | `services/gateway` |
| brain | 3100 | `services/brain` |
| worker-pool | 3200 | `services/worker-pool` |
| mcp-runtime | 3300 | `services/mcp-runtime` |
| agent-runtime | 3400 | `services/agent-runtime` |
| tool-executor | 3500 | `services/tool-executor` |
| vault | 4000 | `services/vault` |
| temporal | 4100 | `services/temporal` |
| artifacts | 4200 | `services/artifacts` |
| auth | 4300 | `services/auth` |
| frontend (vite dev) | 8080 | `frontend-nextgen` |

Each service listens on `process.env.PORT` with the port above as its default.

## Commands

```bash
npm ci                                 # install root workspaces
(cd frontend-nextgen && npm ci)        # frontend deps (separate lockfile)
npm run build --workspaces --if-present  # build shared + services
npm run lint                           # eslint (tool-executor, worker-pool, shared-nextgen)
npm test                               # jest unit + integration tests
cd frontend-nextgen && npm run dev     # vite dev server on :8080
```

Per-service builds: `npm run build -w @stage7-nextgen/<name>`. Note: `npm run build --workspaces`
fails for `agent-runtime` (builds before its dependency `artifacts` — rebuild it after) and for
`gateway` (its tsconfig includes `__tests__` outside `rootDir`; Docker builds copy only `src/`,
so build gateway from `services/gateway` with `npx tsc --rootDir src src/index.ts ...` flags, or
run `npx tsc` there after removing test files from include).

## Local dev without Docker (verified recipe)

1. Provide MongoDB and Redis locally (install `mongod` + `redis-server`; compose normally provides them).
2. Add docker service hostnames to `/etc/hosts` — code references them literally:
   `127.0.0.1 mongo redis gateway brain worker-pool mcp-runtime agent-runtime tool-executor temporal vault artifacts auth`
3. `cp .env.example .env` and point hosts at localhost (`MONGO_URI=mongodb://localhost:27017`,
   `REDIS_HOST=localhost`, service URLs to localhost ports). Set `MASTER_KEY` (vault) to any
   random hex. No LLM provider key is required to boot; providers degrade gracefully.
4. Build, then run each service with `.env` sourced (`services` do NOT load dotenv): `set -a; source .env; set +a; node services/<svc>/dist/index.js`.
   Entry points are `dist/index.js` except `agent-runtime` and `auth`, which emit `dist/src/index.js`.
5. Start the frontend: `cd frontend-nextgen && npm run dev` (proxies `/api/*` to localhost backends).
6. Set writable tool-executor dirs: `TOOL_STORE_DIR` and `PLUGIN_DEPLOY_DIR`.

## Health checks

- Gateway registry: `GET http://localhost:3000/api/gateway/services`
- Per service: `GET http://localhost:<port>/api/<service>/health`
- Frontend: `http://localhost:8080` (dashboard shows live service count from the registry)

## Environment

`.env.example` is the authoritative template; `env.summary` maps every variable to the
services that read it. Required to boot: Mongo/Redis connection vars, `MASTER_KEY`.
`ADMIN_EMAIL`/`ADMIN_PASSWORD` (defaults `admin@example.com` / `change-me-in-production`)
seed the auth admin. LLM provider keys are optional for local dev.

## Codebase map

See [codebase-map.md](./codebase-map.md). Assistant definitions live under
`services/worker-pool/assistants/` (selected via `STAGE7_ASSISTANTS`); skills are declarative
contracts compiled into tools by tool-executor (ADK docs in `docs/ADK/`).

## Local verification

1. `redis-cli ping` → PONG; mongod accepting connections on 27017.
2. All 10 service health endpoints return `{"status":"ok",...}`.
3. Login through the gateway: `POST /api/auth/login` with the seeded admin, then exercise
   artifacts CRUD (`POST/GET/PUT/DELETE /api/artifacts/documents`) — verified durable in Mongo.
4. Frontend dashboard at :8080 shows "N Services Online" with zero console errors.

## Snapshot

- Sandbox snapshot: `mmdaqn82pco0sq3upf5c:default` captured 2026-11-23T14:51:49.049Z
  (Mongo + Redis running, all services built and healthy, frontend dev server running,
  `.env` present, node_modules installed).
