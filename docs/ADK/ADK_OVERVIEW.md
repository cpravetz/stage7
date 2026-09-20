# ADK Overview

This document describes the current ADK implementation represented in the repository. It is intentionally grounded in the code that exists now, not in an older historical architecture.

## Current architecture

The active ADK is a workflow-driven composition layer built around these pieces:

- Contracts: data shapes for tools, workflows, skills, context, approval, and persistence
- Builders: factory functions that validate and construct those models
- Sample skill catalogs: concrete domain workflows like event, sales, support, healthcare, and product
- Runtime routes: API endpoints for listing workflows and creating workspace state

The implementation lives in:

- [../../services/tool-executor/src/adk/contracts.ts](../../services/tool-executor/src/adk/contracts.ts)
- [../../services/tool-executor/src/adk/builders.ts](../../services/tool-executor/src/adk/builders.ts)
- [../../services/tool-executor/src/data/skills/index.ts](../../services/tool-executor/src/data/skills/index.ts)

## Building blocks

### Tools

Tools represent the actual executable capabilities. They include names, manifests, schemas, and optional triggers and confirmations. The core builder is createTool.

### Stages and lanes

Stages define workflow milestones. Lanes group related stages and indicate allowable operational modes. This lets the system model a product lifecycle such as plan → vendors → day-of.

### Skills

Skills bind a tool to a lane and stage. They are the minimal unit of a task-specific capacity in an assistant.

### Assistant definitions

Assistant definitions combine:

- identity
- product object scope
- workflow
- skills
- runtime configuration
- context policy
- approval policy
- persistence policy

The createAssistant builder validates that the workflow, skill assignments, and product object all align.

## Example: event assistant

The event assistant is a real implementation in [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts). It defines three stages:

1. plan
2. vendors
3. day-of

This is a practical example of a domain-specific assistant whose work is modeled as a workflow rather than as a free-form chat-only agent.

## Context and approval model

The ADK not only defines flow structure, but also policies that govern runtime behavior:

- contextPolicy checks product object and object continuity
- approvalPolicy determines whether the system requires confirmation before a tool action
- persistencePolicy stores runtime state and revision history

These are implemented in [../../services/tool-executor/src/adk/builders.ts](../../services/tool-executor/src/adk/builders.ts).

## Runtime entry points

The workflow APIs are exposed through the tool executor:

- [../../services/tool-executor/src/routes/workflows.ts](../../services/tool-executor/src/routes/workflows.ts)
- [../../services/tool-executor/src/routes/workspaces.ts](../../services/tool-executor/src/routes/workspaces.ts)

Those routes allow listing workflows, building runtime definitions, and tracking workspace transitions and approval summaries.

## Verification

The design is not just conceptual; it is enforced by tests. The relevant verification file is [../../services/tool-executor/src/__tests__/adk-composition.test.ts](../../services/tool-executor/src/__tests__/adk-composition.test.ts).

The test suite confirms that custom assistants compose correctly, context validation fails on mismatch, approval behavior respects workflow state, and the sample event skill maintains its public identity.

## Summary

The current ADK is best understood as a strongly typed, workflow-first composition toolkit for Stage7: tools, skills, stages, lanes, policies, and runtime persistence all work together to define assistants whose operations are visible, reviewable, and governed by explicit approval/context rules.