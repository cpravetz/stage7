Stage7 NextGen — User Guide
===========================

Overview
--------

Stage7 NextGen provides an entity-centric multi-agent workspace where persistent assistants (agents) collaborate with humans on live artifacts (documents, code, tickets, etc.). This guide explains the user-facing concepts, quickstart steps, and common troubleshooting for everyday usage.

Key Concepts
------------

- Entity Workspace: A persistent workspace for a subject (project, product, customer) that contains Assistants, memories, artifacts, and mission history.
- Assistant: A persistent, user-managed domain collaborator with its own Skills, tools, knowledge, and workspace context.
- Agent: A mission-scoped executing entity. Agents use Brain and the live system tool catalog, can delegate bounded subtasks, and are retired with their mission rather than persisting as domain collaborators. Each Agent task has bounded defaults of 8 Brain calls, 6 tool/delegation actions, 16,384 requested completion tokens, and 2 delegated subtasks; children inherit the task policy. These limits apply per task, not as a shared mission-wide budget.
- Mission: A workflow run by one or more Agents. Temporal checkpoints the plan, completed task IDs, and completed phases; persisted Agent receipts retain task results so retries can rebuild progress without rerunning completed side effects. If a checkpointed task lacks a completed receipt, or an Agent task is interrupted before its outcome is saved, the runtime fails closed rather than replaying possible side effects. This is not yet full in-progress Agent resumption.
- Planning: a mission-scoped Planner Agent uses Agent Runtime to call Brain and generate the plan. Plans are checked against the schema and phase/task limits; if validation fails, the Planner Agent receives the specific validation issues and prior response for amendment, with up to six total attempts. Task IDs must be globally unique across the plan. If no valid plan is produced after those repairs, the mission fails explicitly; it does not run a generic substitute plan. Mission Agents do not execute through persistent Assistants or inherit an Assistant identity.
- Tools / MCP: Integrations and automations are exposed as system tools. Assistants can also have domain-specific Skills; mission Agents use the live system tool catalog and do not inherit Assistant tool bindings.

Phase approvals
---------------

A phase marked `requires approval` does not ask for approval until its tasks have completed. The Mission Room shows each task's description, expected deliverables, and published artifacts in the approval review and Plan/Artifacts tabs. Expected deliverables are not presented as completed work, and **Approve phase** stays disabled until all phase tasks are complete and tasks with expected deliverables have at least one published artifact. The Artifacts API enforces the same rule for Mission Room, HITL, and direct approval requests. **Reject phase** remains available if deliverables are missing or unacceptable. The same pending request is available from the Assistant Workspace **HITL** tab. Approving lets the mission continue; rejecting or reaching the approval timeout stops it at that phase. Approval requires the Artifacts service to be configured; the mission fails closed rather than silently approving if approval state cannot be persisted.

Quickstart (Docker)
-------------------

Stage7 runs the frontend and backend services as one Docker Compose environment. Do not start the frontend separately with `npm install` or `npm run dev`; the setup script builds and starts the complete stack in a shared Docker network.

1. Install Docker Engine or Docker Desktop and Docker Compose v2.

2. Clone the repository:

```bash
git clone https://github.com/cpravetz/stage7.git
cd stage7
```

3. Run the setup script for your operating system from the repository root:

```bash
# Linux or macOS
chmod +x setup.sh
./setup.sh
```

```powershell
# Windows
.\setup.bat
```

The setup script creates or updates `.env`, generates missing secrets, builds the Docker images, and starts all Stage7 containers, including the frontend. Wait for the script to report that setup is complete.

4. Verify that all containers are running in the shared Docker environment:

```bash
docker compose ps
```

5. Open the Unified Frontend at `http://localhost:8080`, sign in, then create or open an Entity Workspace and add an Agent.

6. Start a Mission by chatting with the Agent or selecting a mission template from the workspace.

Health Checks & Endpoints
-------------------------

Useful service health endpoints exposed by the local Docker Compose environment:

- Gateway: `http://localhost:3900/health`
- Worker Pool: `http://localhost:3200/api/workers/health`
- MCP Runtime: `http://localhost:3300/api/mcp-runtime/health`
- Temporal: `http://localhost:4100/api/temporal/health`
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
