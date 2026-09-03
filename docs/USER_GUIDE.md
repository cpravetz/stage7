Stage7 NextGen — User Guide
===========================

Overview
--------

Stage7 NextGen provides an entity-centric multi-agent workspace where persistent assistants (agents) collaborate with humans on live artifacts (documents, code, tickets, etc.). This guide explains the user-facing concepts, quickstart steps, and common troubleshooting for everyday usage.

Key Concepts
------------

- Entity Workspace: A persistent workspace for a subject (project, product, customer) that contains agents, memories, artifacts, and mission history.
- Agent (Assistant): A persona with capabilities, memory, and tools. Agents run in the shared worker pool and can be invited into an entity workspace.
- Mission: A stateful workflow run by one or more agents. Missions are durable and resumable (Temporal-powered).
- Tools / MCP: Integrations and automations are exposed as MCP-compatible tools. Agents call tools to perform side-effecting operations.

Quickstart (Local Development)
-----------------------------

1. Clone the repository and run the setup script (recommended):

```bash
git clone https://github.com/cpravetz/stage7.git
cd stage7
./setup.sh
```

2. Start the frontend (in a separate terminal):

```bash
cd frontend-nextgen
npm install
npm run dev
# open http://localhost:8080
```

3. Open the Unified Frontend, sign in, then create or open an Entity Workspace and add an Agent.

4. Start a Mission by chatting with the Agent or selecting a mission template from the workspace.

Health Checks & Endpoints
-------------------------

Useful service health endpoints (dev defaults):

- Gateway: `http://localhost:3000/health`
- Worker Pool: `http://localhost:3200/api/workers/health`
- MCP Runtime: `http://localhost:3300/health`
- Temporal: `http://localhost:4100/health`
- Auth: `http://localhost:4300/api/auth/health`

Tools Panel & Plugin Marketplace
--------------------------------

Open the `Tools` panel from the frontend sidebar to add or manage plugins and tools:

- Add code plugins (Python, container), OpenAPI tools, or MCP tools.
- Registered tools appear in the marketplace and are available to agents at runtime.

Common Troubleshooting
----------------------

- Check running containers:

```bash
docker compose ps
```

- View logs for a service:

```bash
docker compose logs -f gateway
docker compose logs -f worker-pool
```

- Worker Pool health check:

```bash
curl http://localhost:3200/api/workers/health
```

- Assistant registration issues: verify the assistant is registered via `GET /api/workers/assistants` (Worker Pool API).

Further Reading & Links
-----------------------

- Architecture proposal: docs/STAGE7_NEXTGEN_REBUILD_PROPOSAL.md
- Deployment guidance: docs/DEPLOYMENT.md
- ADK developer docs: docs/ADK/ADK_DEVELOPER_GUIDE.md and docs/ADK/README.md


Using Agents
------------

- Chat & Guidance: Use the chat pane to converse with an agent. Agents can stream inner-monologue and tool call outputs.
- Actions & Approvals: Some agent actions require human approval. Approvals pause the mission and send notification to workspace reviewers.
- Artifacts: Generated artifacts (files, code snippets, documents) appear in the workspace. You can edit artifacts directly; agents see updates and adapt.

Troubleshooting & Support
-------------------------

- If an agent fails or a mission stalls, open the mission timeline and view the activity trace. Durable workflows include retry metadata and failure reasons.
- For auth/secret issues, contact the admin owning the project's Vault configuration.
- If the UI shows a legacy “assistant startup” flow, refresh and confirm your environment is running NextGen services (Temporal, Gateway, Worker Pool).

Further Reading
---------------

- Architecture and rationale: docs/STAGE7_NEXTGEN_REBUILD_PROPOSAL.md
- Developer ADK & tools: docs/ADK/ADK_DEVELOPER_GUIDE.md
