ADK — Assistant Developer Guide (NextGen)
=========================================

Purpose
-------

This guide describes how to build and register assistants (agents) for Stage7 NextGen using the new MCP-first, shared worker pool architecture.

Principles
----------

- MCP-First: Tools and integrations are defined as Model Context Protocol manifests so they are portable across MCP ecosystems.
- Serverless Workers: Assistants run inside the shared worker pool; do not rely on per-assistant long-running HTTP ports.
- Durable Missions: Use Temporal workflows (activities) for missions that require state, retries, and human approvals.

Project Structure & Conventions
-------------------------------

- ADK sources live under `shared-nextgen` and `services/agent-runtime` for runtime adapters and helper libraries.
- Tool and assistant manifests are persisted in the central Librarian / persistence service and loaded dynamically by workers at runtime.

Creating an Assistant (summary)
-------------------------------

1. Define assistant metadata and persona (name, description, system prompts, memory buckets).
2. Write MCP tool manifests for any external integrations (HTTP, filesystem, DB). Use the MCP schema and include tool input/output shapes.
3. Publish the assistant package (manifest + optional code snippets) to the persistence registry (Librarian).
4. Start a mission via the Gateway API. The Gateway enqueues a Temporal workflow which schedules worker activities.
5. Workers load the assistant context and execute steps inside an isolated sandbox; tool calls are proxied via the MCP adapter.

Structured Output & Validation
------------------------------

- Use Zod/Pydantic-style grammars in system prompts to enforce JSON schema outputs. This reduces flaky string parsing and improves downstream tooling.

Testing Locally
---------------

1. Run local services with docker-compose.

```bash
docker-compose up -d
```

2. Use the Gateway dev endpoints to register a test assistant manifest and start a mission.

3. Inspect Temporal workflows and worker logs to validate activity execution and retries.

Best Practices
--------------

- Keep tool manifests minimal and declarative — move complex side effects into well-tested tool executors.
- Make agents idempotent where possible; Temporal retries may re-run activities.
- Use Vault for any third-party credentials and load them at activity runtime, not persistently in manifests.

References
----------

- MCP manifests and examples: see `docs/ADK/TOOL-DEVELOPMENT.md` and the `shared-nextgen` library
- Architecture overview: docs/STAGE7_NEXTGEN_REBUILD_PROPOSAL.md
- SDK-first patterns and migration: docs/ADK/SDK-ARCHITECTURE.md
