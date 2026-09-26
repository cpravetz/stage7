# ADK User Guide

This guide is for end users who want to interact with assistants built on the Agent Development Kit (ADK). It covers how to use the system, available assistants, workflows, and common tasks.

## What is the ADK?

The Agent Development Kit (ADK) is a framework for building workflow-driven AI assistants. Unlike free-form chatbots, ADK assistants follow structured workflows with defined stages, approval gates, and persistent state. This makes them suitable for business operations that require accountability, audit trails, and human-in-the-loop decisions.

## Quick Start

### Accessing the System

The ADK system runs as a set of microservices. In development, start everything with:

```bash
docker compose up -d
```

This starts:
- **Gateway** (port 3000) - Main API entry point
- **Tool Executor** (port 3500) - Workflow and assistant runtime
- **Worker Pool** (port 3200) - Task queue and execution
- **MCP Runtime** (port 3300) - Tool registry
- **Auth** (port 4300) - Authentication
- **Persistence** (port 4200) - Session and tenant data

### Authentication

All API calls require a JWT token. Obtain one via:

```bash
curl -X POST http://localhost:4300/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'
```

Use the returned token in subsequent requests:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/workflows
```

## Available Assistants

The system includes several pre-built assistants for common business domains:

| Assistant | Domain | Workflow Stages |
|-----------|--------|-----------------|
| **Event** | Event planning & operations | Plan → Vendors → Day-of |
| **Sales** | Sales pipeline management | Prospect → Qualify → Close |
| **Support** | Customer support tickets | Triage → Investigate → Resolve |
| **Product** | Product development | Discover → Build → Launch |
| **Healthcare** | Patient care coordination | Intake → Treatment → Follow-up |

### Listing Assistants

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/workflows
```

### Getting Assistant Details

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/workflows/event
```

## Working with Workflows

Each assistant defines a workflow with stages and lanes. Understanding these concepts helps you use the system effectively.

### Workflow Concepts

- **Stages**: Milestones in the work (e.g., "Plan", "Vendors", "Day-of")
- **Lanes**: Groupings of stages by operational mode (e.g., "Planning" lane = draft mode, "Execution" lane = review/live modes)
- **Skills**: Specific capabilities available at each stage (tools bound to stages)
- **Modes**: Operational states (draft, review, live) that control what actions are allowed

### Creating a Workspace

A workspace is a running instance of a workflow for a specific object (e.g., a specific event).

```bash
curl -X POST http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "event",
    "objectId": "evt-2026-001",
    "objectType": "event"
  }'
```

Response includes a `workspaceId` - save this for subsequent operations.

### Checking Workspace State

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/workspaces/WORKSPACE_ID
```

Response shows:
- Current stage and lane
- Available transitions
- Pending approvals
- Execution history

### Advancing Through Stages

Move the workspace forward by executing allowed transitions:

```bash
curl -X POST http://localhost:3000/api/workspaces/WORKSPACE_ID/transition \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transition": "vendors",
    "actor": "user@example.com"
  }'
```

The system validates:
- Transition is allowed from current stage
- User has permission for the target stage
- Any required approvals are satisfied

### Using Skills (Tools)

At each stage, specific skills are available. Execute a skill:

```bash
curl -X POST http://localhost:3000/api/workspaces/WORKSPACE_ID/skills/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "event_planning_budgeting",
    "arguments": { "eventName": "Annual Conference 2026" },
    "actor": "user@example.com"
  }'
```

The skill executes and returns structured results. Some skills require approval before execution.

## Approval Workflow

The ADK includes a built-in approval system for sensitive operations.

### How Approvals Work

1. **Dry-run by default**: Most actions execute in dry-run mode first
2. **Confirmation required**: Certain actions (configured per assistant) require explicit approval
3. **State-gated**: Approvals only allowed in specific workflow states

### Checking Pending Approvals

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/workspaces/WORKSPACE_ID/approvals
```

### Approving an Action

```bash
curl -X POST http://localhost:3000/api/workspaces/WORKSPACE_ID/approvals/APPROVAL_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "actor": "manager@example.com",
    "comment": "Budget approved for Q4"
  }'
```

### Rejecting an Action

```bash
curl -X POST http://localhost:3000/api/workspaces/WORKSPACE_ID/approvals/APPROVAL_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "actor": "manager@example.com",
    "comment": "Need revised budget"
  }'
```

## Context and Persistence

### Object Identity

Each workspace is bound to a specific business object (event, deal, ticket, etc.). The system enforces:
- Object ID cannot change mid-workflow
- Cross-object handoffs require explicit configuration
- Context policies validate object continuity

### Viewing History

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/workspaces/WORKSPACE_ID/history
```

Shows complete audit trail: stage transitions, skill executions, approvals, and actor information.

### Revision Tracking

Each workspace maintains revision history. View a specific revision:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/workspaces/WORKSPACE_ID/revisions/REVISION_NUMBER
```

## Common User Tasks

### Task 1: Plan an Event

1. **Create workspace**: `POST /api/workspaces` with assistantId="event"
2. **Plan stage**: Use `event_planning_budgeting` skill to create budget
3. **Transition to vendors**: `POST /transition` with transition="vendors"
4. **Manage vendors**: Use vendor management skills
5. **Transition to day-of**: `POST /transition` with transition="day-of"
6. **Execute day-of operations**: Use day-of skills

### Task 2: Manage a Sales Deal

1. **Create workspace**: assistantId="sales"
2. **Prospect stage**: Research and qualify leads
3. **Transition to qualify**: Move qualified leads forward
4. **Qualify stage**: Deep discovery, proposal creation
5. **Transition to close**: Final negotiations
6. **Close stage**: Contract execution, handoff

### Task 3: Handle Support Ticket

1. **Create workspace**: assistantId="support" with ticket ID
2. **Triage stage**: Categorize, prioritize, assign
3. **Transition to investigate**: Begin investigation
4. **Investigate stage**: Root cause analysis, reproduction
5. **Transition to resolve**: Implement fix
6. **Resolve stage**: Verify, close, document

## API Reference Summary

### Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List all assistants |
| GET | `/api/workflows/:id` | Get assistant details |
| GET | `/api/workflows/:id/runtime` | Get runtime workflow definition |

### Workspaces
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/workspaces` | Create new workspace |
| GET | `/api/workspaces/:id` | Get workspace state |
| POST | `/api/workspaces/:id/transition` | Execute stage transition |
| POST | `/api/workspaces/:id/skills/execute` | Execute a skill |
| GET | `/api/workspaces/:id/history` | Get audit history |
| GET | `/api/workspaces/:id/approvals` | List pending approvals |
| POST | `/api/workspaces/:id/approvals/:approvalId` | Approve/reject action |

### Health Checks
| Service | Endpoint |
|---------|----------|
| Gateway | `http://localhost:3000/health` |
| Tool Executor | `http://localhost:3500/health` |
| Worker Pool | `http://localhost:3200/api/workers/health` |
| MCP Runtime | `http://localhost:3300/health` |
| Auth | `http://localhost:4300/api/auth/health` |
| Persistence | `http://localhost:4200/health` |

## Troubleshooting

### Common Issues

**Workspace not found**
```
{"error": "Workspace not found"}
```
- Verify workspace ID is correct
- Check workspace hasn't been archived/deleted

**Transition not allowed**
```
{"error": "Invalid transition from current stage"}
```
- Check current stage with `GET /api/workspaces/:id`
- Verify transition is in allowed list for current stage

**Skill execution failed**
```
{"error": "Tool execution failed", "details": "..."}
```
- Check skill arguments match schema
- Verify external service connectivity (API keys, network)
- Review tool executor logs: `docker compose logs tool-executor`

**Approval required but not found**
```
{"error": "No pending approval for this action"}
```
- Action may not require approval in current state
- Approval may have already been processed
- Check `GET /api/workspaces/:id/approvals`

### Getting Help

1. Check service health endpoints
2. Review service logs: `docker compose logs -f SERVICE_NAME`
3. Verify authentication token hasn't expired
4. Check workspace state before attempting operations

## Best Practices for Users

1. **Always check current state** before attempting transitions or skill execution
2. **Use dry-run mode** for exploratory actions (default for most skills)
3. **Document approval decisions** with clear comments for audit trail
4. **Keep object IDs consistent** - don't try to change the business object mid-workflow
5. **Monitor workspace history** for debugging and compliance
6. **Use appropriate modes** - draft for planning, review for validation, live for production

## FAQ

**Q: Can I skip stages in a workflow?**
A: No. Transitions must follow the defined workflow. Skipping requires workflow redesign by a developer.

**Q: What happens if a skill fails?**
A: The workspace stays in its current state. Check the error details, fix the issue, and retry.

**Q: Can multiple people work on the same workspace?**
A: Yes, but only one transition/skill executes at a time. The system tracks actor for each action.

**Q: How do I know what skills are available at each stage?**
A: Use `GET /api/workflows/:assistantId/runtime` to see the full workflow definition with skills per stage.

**Q: Can I create my own assistant?**
A: That requires developer access. See the [Assistant Developer Guide](./ADK_DEVELOPER_GUIDE.md) and [Tool Development Guide](./TOOL-DEVELOPMENT.md).

---

*This guide covers the current ADK implementation. For developer-focused documentation, see [ADK_DEVELOPER_GUIDE.md](./ADK_DEVELOPER_GUIDE.md) and [TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md).*