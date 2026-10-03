# Stage7 Docker Build and Deployment Guide

This guide covers building and running Stage7 with Docker. Every service in this repository is
defined in a single `docker-compose.yaml` file, and there are no Compose profiles: `docker compose
build` builds all services, and `docker compose up` starts all of them.

If you are looking for production topology guidance (Kubernetes, managed Temporal, external Vault),
see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) instead. For the environment variables each service
reads, see [env.summary](./env.summary).

## 1. Prerequisites

- **Docker Engine 20.10+** or **Docker Desktop**.
- **Docker Compose V2**, invoked as `docker compose` (space, not `docker-compose`). Compose V1 is
  retired and is not supported here.
- **8 GB of memory** allocated to Docker. Twelve images each install their own dependency tree, and
  a full build plus a running stack is memory-hungry. In Docker Desktop, set this under
  Preferences → Resources.
- **A `.env` file** in the repository root. `setup.sh` creates it from `.env.example`; see
  [section 3](#3-manual-build-and-launch) to do it by hand.

Check both prerequisites before anything else:

```bash
docker --version
docker compose version
```

## 2. Quick start with `setup.sh` (recommended)

```bash
./setup.sh
```

`setup.sh` performs the full first-run flow:

1. Verifies `docker` and `docker compose` are on `PATH`.
2. Copies `.env.example` to `.env` if `.env` does not already exist.
3. Prompts for the assistant selection and writes your answer to `STAGE7_ASSISTANTS` in `.env`.
4. Runs `docker compose down --remove-orphans --timeout 30` to release ports from a previous
   deployment.
5. Runs `docker compose build --no-cache`.
6. Runs `docker compose up -d --wait --timeout 300`.

Two things to know about it. It builds every image with `--no-cache`, so expect the first run to
take a long time (see [section 6](#6-rebuild-cost-and-the-base-image-myth)). It also tears the stack
down before rebuilding, so do not run it against a deployment you want to keep up.

Assistant selection is a prompt, not a profile. Press Enter at the prompt to load all 21
assistants, or enter a comma-separated list of IDs such as `cto,hr`. See
[section 5](#5-selecting-assistants) for the available IDs and how selection is applied.

On Windows, `setup.bat` runs the equivalent PowerShell script, `setup.ps1`.

## 3. Manual build and launch

### 3.1. Create the environment file

```bash
cp .env.example .env
```

Then edit `.env` and fill in what your deployment needs:

- At least one LLM provider key. `brain` has no provider configured by default, so it will fail
  requests until one of `OPENAI_API_KEY`, `GROK_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`,
  `HUGGINGFACE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CLOUDFLARE_WORKERS_AI_API_TOKEN`,
  or `OPENWEBUI_API_KEY` is set.
- `MASTER_KEY` for `vault`. It has an insecure built-in default; set a real value
  (`openssl rand -hex 32`) for anything you care about.
- `STAGE7_ASSISTANTS` if you do not want all assistants loaded. Empty means all of them.

`.env` is git-ignored and must never be committed. `env.summary` lists every variable each service
reads, along with the built-in defaults that apply when a variable is left empty.

### 3.2. Build images

```bash
# Build every service image
docker compose build

# Build a single service image
docker compose build gateway
```

Build args are resolved from `.env`, so a populated `.env` must exist before building. The
`worker-pool` image takes a `STAGE7_ASSISTANTS` build arg; see
[section 5](#5-selecting-assistants).

### 3.3. Start services

```bash
# Start everything in the background
docker compose up -d

# Start a single service (and whatever it depends on)
docker compose up -d gateway

# Follow the logs of a single service
docker compose logs -f gateway

# Show container state
docker compose ps

# Stop and remove all containers
docker compose down
```

`mongo` and `redis` have health checks, and `worker-pool` waits for `mongo` to be healthy before it
boots, so `docker compose up -d` is enough to get a correctly ordered start. To block until the
stack is up, use the `--wait` form that `setup.sh` uses:

```bash
docker compose up -d --wait --timeout 300
```

The frontend is then available at `http://localhost:8080`. It is a static nginx build that proxies
`/api` and `/ws` to the gateway, so no frontend environment variables are needed.

## 4. Services and ports

| Compose service | Role | Container port | Host port |
| --- | --- | --- | --- |
| `mongo` | Document persistence (assistant knowledge, auth, vault, artifacts) | 27017 | 27017 |
| `redis` | Task queue, cache, sessions | 6379 | 6379 |
| `gateway` | Single HTTP/WS entry point, service registry and proxy | 3000 | 3900 |
| `brain` | LLM orchestration, provider routing, semantic cache | 3100 | 3100 |
| `worker-pool` | Assistant catalog, task queue, knowledge sync | 3200 | 3200 |
| `mcp-runtime` | Model Context Protocol server and tool registry | 3300 | 3300 |
| `agent-runtime` | Agent execution runtime | 3400 | 3400 |
| `tool-executor` | Skills, tools, ADK workflows, stores | 3500 | 3500 |
| `vault` | AES-256-GCM envelope encryption for secrets | 4000 | 4000 |
| `temporal` | Durable workflow and mission execution | 4100 | 4100 |
| `artifacts` | Artifact and collection store | 4200 | 4200 |
| `auth` | Authentication and token issuance | 4300 | 4300 |
| `frontend` | React build served by nginx | 8080 | 8080 |

All twelve application containers live on the `mcs_network` network and address each other by
Compose service name, so inter-service URLs are `http://<service>:<container-port>`. The host port
is only for access from your machine; the frontend reaches the gateway on port 3000 internally.

Each service the gateway registers exposes a health path, and the gateway aggregates them:

```bash
curl http://localhost:3900/api/gateway/health
```

Individual service health paths follow the pattern `http://localhost:<host-port>/api/<id>/health`,
for example `http://localhost:3200/api/workers/health`.

## 5. Selecting assistants

Assistant selection is controlled by a single variable, `STAGE7_ASSISTANTS`, not by Compose
profiles. Set it to a comma-separated list of assistant IDs, or leave it empty to load all of them.

The available IDs are the folder names under `services/worker-pool/assistants/`:

```text
analytics   career      content     cto        education  event      executive
finance     healthcare  hotel       hr         investment  legal     marketing
product     restaurant  sales       scriptwriter  songwriter  sports  support
```

The `-canonical-assistant` suffix is accepted and stripped, so `cto` and
`cto-canonical-assistant` are equivalent.

Selection takes effect at two independent points, and it is worth keeping them apart:

1. **At runtime.** `STAGE7_ASSISTANTS` is passed to `worker-pool` and `tool-executor` as an
   environment variable. `worker-pool` parses it, validates every ID against the assistants present
   in its image, and narrows its catalog to the selected ones. This is what actually decides which
   assistants load. `worker-pool` refuses to boot on an ID it cannot resolve, which is the error you
   see when the requested selection is not in the image.
2. **At build time.** `services/worker-pool/dockerfile` takes a `STAGE7_ASSISTANTS` build arg and
   deletes every unselected assistant folder and its knowledge file from the image, so the image
   only carries what it was built to serve. If a requested ID has no folder in the repository, the
   build fails rather than producing an image that cannot satisfy the selection.

So a runtime selection works against any image that still contains the requested assistants, and a
build arg is what shrinks the image. Rebuilding is required when you add an assistant to a
selection and the current image was pruned without it.

To change the selection, set `STAGE7_ASSISTANTS` in `.env`, recreate the containers that read it,
and rebuild `worker-pool` to keep the image in step:

```bash
# All assistants
docker compose build worker-pool && docker compose up -d worker-pool

# A subset, without editing .env
STAGE7_ASSISTANTS=cto,hr docker compose build worker-pool
STAGE7_ASSISTANTS=cto,hr docker compose up -d worker-pool
```

`tool-executor` is not pruned by the build, because it carries the ADK blueprint for every
assistant. It receives the same runtime value.

## 6. Rebuild cost and the base image myth

There is no `base` service and no `Dockerfile.base` in the build path. `Dockerfile.base` still
exists in the repository root, but nothing references it, and it is not part of any build.

Every service image is an independent build from `node:22-alpine` that runs its own
`npm install --legacy-peer-deps` over the workspace root. That has two practical consequences:

- `docker compose build --no-cache` is slow, because there is no shared dependency layer to reuse.
  It is the right choice for a first run or after changing a dependency, and the wrong choice for
  everyday work.
- `docker compose build <service>` is the normal iteration path. Docker's layer cache makes it a
  matter of seconds when only that service's source changed.

To iterate on one service, use the `buildone` helpers, which build a single service and recreate
only its container:

```bash
./buildone.sh gateway
./buildone.sh tool-executor --no-cache
./buildone.sh --assistants=cto,hr worker-pool
```

On Windows, `buildone.bat` takes the same arguments.

A full `docker compose build` is required after a change to a shared workspace dependency, such as
`package.json`, `shared-nextgen/`, or `services/*/package.json`, because those changes invalidate
the install layer in every image.

## 7. Persistent data

| Volume | Used by | Notes |
| --- | --- | --- |
| `mongo_data` | `mongo` | Assistant knowledge, auth records, vault secrets, artifacts |
| `redis_data` | `redis` | Task queue, semantic cache, sessions |

`docker compose down` keeps both volumes. `docker compose down -v` deletes them, which wipes assistant
knowledge, stored secrets, and queued tasks. After a `-v`, the next `docker compose up` starts with
empty Mongo and Redis volumes, and `worker-pool` re-seeds the assistant catalog from the folders in
its image on startup.

`worker-pool` writes assistant knowledge to Mongo at startup. If `MONGO_URI` is set but Mongo is
unreachable, it refuses to start rather than fall back to an in-memory store that would lose that
knowledge on the next restart. A `worker-pool` container that will not start after a Mongo problem
is the expected behavior, not a bug.

## 8. Troubleshooting

**`docker: command not found: docker compose`**
Compose V2 is not installed. Install Compose V2, and use the two-word form everywhere. Scripts in
this repository call `docker compose`, so the hyphenated V1 command will not work with them.

**Port already in use**
Another process holds a host port from the table in [section 4](#4-services-and-ports). Find it
with `lsof -i :8080` (Linux/macOS) or `netstat -ano | findstr 8080` (Windows), stop it, or change
the host side of the mapping in `docker-compose.yaml`.

**Build fails or is killed during `npm install`**
The Docker memory allocation is too low, or the build is simply too broad. Raise the Docker memory
limit to 8 GB, or build a single service at a time with `docker compose build <service>`.

**`worker-pool` exits at startup with an unknown assistant ID**
`STAGE7_ASSISTANTS` names an ID that the running image does not contain. A `worker-pool` image built
with a narrow selection only carries those assistants, so re-selecting a different set needs
`docker compose build worker-pool` before `docker compose up -d worker-pool`. A selection that names
a folder which does not exist in the repository fails the build instead. The valid IDs are listed in
[section 5](#5-selecting-assistants).

**`worker-pool` exits at startup with a Mongo error**
`MONGO_URI` is set but Mongo is not reachable. Check `docker compose ps` and
`docker compose logs mongo`, then `docker compose restart worker-pool`.

**LLM requests fail or return provider errors**
No provider key is set, or the key is invalid. Check `docker compose logs brain` and confirm at
least one provider key is populated in `.env`. Note that `.env` values are baked into containers at
create time, so a changed `.env` needs `docker compose up -d` to recreate the affected containers,
not just a restart.

**Frontend loads but every request fails**
The frontend proxies `/api` and `/ws` to `http://gateway:3000` inside the `mcs_network` network. If
the gateway is not running, or a stale service name remains on the network, `/api` requests will
fail. Check `docker compose ps gateway` and `docker compose logs gateway`.

### Clean slate

```bash
docker compose down --remove-orphans
docker compose build
docker compose up -d
```

Add `-v` only if you intend to delete the Mongo and Redis volumes.

## 9. Related files

| File | Purpose |
| --- | --- |
| `docker-compose.yaml` | The single source of truth for services, ports, and build args |
| `setup.sh` / `setup.ps1` / `setup.bat` | First-run setup, build, and launch |
| `buildone.sh` / `buildone.bat` | Rebuild and restart one service, or the whole stack |
| `.env.example` | Annotated template for `.env` |
| `env.summary` | Which environment variables each service actually reads |
| `docs/DEPLOYMENT.md` | Production and Kubernetes deployment guidance |
