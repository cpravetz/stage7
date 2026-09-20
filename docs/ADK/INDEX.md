# ADK Documentation Index

This folder contains both historical references and the current implementation notes. The active source of truth is the TypeScript ADK in the tool-executor package, especially the contracts and builder layer in the files below.

## Current implementation docs

1. [README.md](./README.md) — current ADK guide and examples for creating assistants
2. [ADK_DEVELOPER_GUIDE.md](./ADK_DEVELOPER_GUIDE.md) — practical developer workflow for tools, stages, skills, and policies
3. [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) — current repository-level summary of the builder-based design

## Runtime and workflow references

4. [../../services/tool-executor/src/adk/contracts.ts](../../services/tool-executor/src/adk/contracts.ts) — ADK contracts
5. [../../services/tool-executor/src/adk/builders.ts](../../services/tool-executor/src/adk/builders.ts) — builder APIs
6. [../../services/tool-executor/src/data/skills/index.ts](../../services/tool-executor/src/data/skills/index.ts) — exported sample skills and workflows
7. [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts) — concrete sample assistant workflow
8. [../../services/tool-executor/src/routes/workflows.ts](../../services/tool-executor/src/routes/workflows.ts) — workflow runtime endpoints
9. [../../services/tool-executor/src/routes/workspaces.ts](../../services/tool-executor/src/routes/workspaces.ts) — workspace lifecycle and approval state routes

## Historical documents

The following files still exist for archival comparison but should not be treated as the canonical description of the current implementation:

- [AGENT_ASSISTANT_SKILLS_TOOLS.md](./AGENT_ASSISTANT_SKILLS_TOOLS.md)
- [AGENT_DELEGATION.md](./AGENT_DELEGATION.md)
- [ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md](./ASSISTANTS_BUILDER_MIGRATION_COMPLETE.md)
- [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md)

## Recommended reading order

1. Read [README.md](./README.md)
2. Review [ADK_DEVELOPER_GUIDE.md](./ADK_DEVELOPER_GUIDE.md)
3. Inspect the sample workflow in [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts)
4. Validate behavior with the test suite under [../../services/tool-executor/src/__tests__](../../services/tool-executor/src/__tests__)

