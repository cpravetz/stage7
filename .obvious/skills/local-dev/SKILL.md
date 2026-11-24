---
name: local-dev
description: How to bring stage7 up for local development, verified end-to-end during onboarding (2026-11-23)
---

# local-dev — stage7

## What the stack is

10 Node.js/TypeScript microservices + Mongo + Redis + a Vite React frontend. Production-style
path is Docker Compose (`./setup.sh` or `docker compose up --build`), but the sandbox has no
Docker — this skill documents the verified native path.

## Verified bring-up recipe (no Docker)

1. **Infra**: run `mongod --dbpath <dir> --port 27017 --bind_ip 127.0.0.1` and
   `redis-server --port 6379 --bind 127.0.0.1`. Sandbox lacks systemd for the apt packages —
   start daemons directly. mongod 8 tarball works on Debian 13.
2. **Hostnames**: `sudo` append to `/etc/hosts`:
   `127.0.0.1 mongo redis gateway brain worker-pool mcp-runtime agent-runtime tool-executor temporal vault artifacts auth frontend`
   Service code hardcodes docker hostnames (gateway registry, brain provider URLs) — this one
   line makes the whole mesh resolve natively.
3. **Env**: `cp .env.example .env`, point Mongo/Redis/service URLs at localhost, set
   `MASTER_KEY=<random hex>`. No dotenv loader exists in services — source `.env` before each launch.
4. **Install/build**:
   - `npm ci` (root workspaces). `bun.lock` at root is an untracked leftover — use npm.
   - `npm run build --workspaces --if-present` **fails** two workspaces:
     - `agent-runtime`: workspace build order runs it before `artifacts`. Fix: after the batch,
       `npm run build -w @stage7-nextgen/agent-runtime`.
     - `gateway`: tsconfig includes `__tests__` but sets `rootDir: src`. Docker avoids it by
       copying only `src/`. Fix: build from `services/gateway` with
       `npx tsc --outDir dist --rootDir src ... src/index.ts` (flags mirroring its tsconfig).
   - `cd frontend-nextgen && npm ci` (own lockfile, not a root workspace).
5. **Launch** (any order after infra; ~2s startup each):
   - `node services/<svc>/dist/index.js` for gateway, brain, worker-pool, mcp-runtime,
     tool-executor, vault, artifacts, temporal, mcp-runtime — with `TOOL_STORE_DIR` /
     `PLUGIN_DEPLOY_DIR` set to writable dirs for tool-executor.
   - agent-runtime and auth emit `dist/src/index.js` (nested layout) — different entry point.
6. **Frontend**: `cd frontend-nextgen && npm run dev` → `http://localhost:8080`; vite proxies
   `/api/*` per `vite.config.ts`.

## Verification checkpoints

- `redis-cli ping` → PONG; mongod up on 27017.
- `GET :3000/api/gateway/services` lists 9 registered services.
- All 10 `/api/<svc>/health` endpoints return ok.
- `POST /api/auth/login` with seeded admin (`admin@example.com` / `change-me-in-production`)
  returns a JWT.
- Artifacts CRUD round-trip: `POST /api/artifacts/documents` (body needs `tenantId`,
  `collection`, `data`), then GET/PUT/DELETE by returned `id` — persisted in Mongo.
- Frontend dashboard shows "9 Services Online", zero console errors.

## Known environment quirks

- `npm test`: 3018/3047 pass. The 29 failures are capability gaps without Docker
  (PluginGenerator sandbox suites) and integration suites in `tests/integration/` that assume
  the compose network — not regressions from the native setup.
- `npm run lint` reports pre-existing debt (204 errors, 686 warnings).
- worker-pool refuses to boot without Mongo (by design); brain falls back to in-memory cache
  if Redis is unreachable but still boots.
- Snapshot on 2026-11-23 has Mongo/Redis running, all services built, `.env` created — a fresh
  sandbox from this snapshot only needs to (re)start daemons and services.
