docker-compose up -d
ADK — Assistant Developer Guide
==============================

This guide reflects the current implementation in the repository. The active ADK code is a TypeScript composition system, not the older microservice architecture described in historical ADK documents.

## Relevant source files

- [../../services/tool-executor/src/adk/contracts.ts](../../services/tool-executor/src/adk/contracts.ts)
- [../../services/tool-executor/src/adk/builders.ts](../../services/tool-executor/src/adk/builders.ts)
- [../../services/tool-executor/src/adk/index.ts](../../services/tool-executor/src/adk/index.ts)
- [../../services/tool-executor/src/data/skills/index.ts](../../services/tool-executor/src/data/skills/index.ts)
- [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts)

## The current design

The ADK is centered on a small set of contracts and builder functions.

1. Tools represent a capability with input and output schemas.
2. Workflow stages define a progression of work and allow transitions.
3. Lanes group stages by operating mode.
4. Skills bind tools to a lane and stage.
5. Assistant definitions combine identity, product objects, workflow, skills, policies, and persistence.

## Creating a tool

```ts
import { createTool } from '../../services/tool-executor/src/adk';

const planningTool = createTool({
	id: 'event_planning_budgeting',
	name: 'Event Planning & Budgeting',
	description: 'Create an event plan and budget.',
	type: 'code',
	inputSchema: {
		type: 'object',
		properties: { eventName: { type: 'string' } },
		required: ['eventName'],
	},
	outputSchema: {
		type: 'object',
		properties: { success: { type: 'boolean' } },
	},
});
```

## Skill output and how it is presented

**Core never knows what a skill produces.** There are no skill-specific field names anywhere in
the shared rendering path. A skill that wants to control its own user-facing layout returns
presentation blocks, which are a generic, typed contract.

The contract lives in
[../../shared-nextgen/src/types/common.ts](../../shared-nextgen/src/types/common.ts) and is the only
thing a renderer needs to know:

```ts
export interface PresentationBlock {
  id: string;          // stable identifier, used as a React key and in tests
  title?: string;      // optional heading shown above the block
  body: string;        // pre-formatted plain text, rendered verbatim
  kind?: 'text' | 'markdown' | string;
}

export interface PresentableOutput {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;
  data?: unknown;              // machine-readable payload
  present?: PresentationBlock[]; // ordered, user-facing blocks
}
```

A skill result therefore looks like this:

```json
{
  "success": true,
  "data": { "score": 82, "flags": [] },
  "present": [
    { "id": "report", "title": "Report", "kind": "text", "body": "REPORT\n======\n..." }
  ]
}
```

Rules:

- `body` is **pre-formatted plain text with the layout you want the user to see**. It is rendered
  verbatim with line breaks preserved. Do not put raw JSON in `body`; machine-readable values go in
  `data`.
- `data` stays available for programmatic consumers, tests, and other skills that delegate to you.
  When `present` is present, the UI renders `present` and does not dump `data` as JSON.
- `present` is optional. A skill that emits only `data` still renders, via a generic key/value view
  driven by its declared `outputSchema`. Emitting `present` is how you avoid that fallback.
- Order is meaningful: blocks render in array order.

`outputSchema` is validated at runtime for code tools. A result that does not match its declared
`outputSchema` is logged as an error and the mismatches are attached to the execution as
`outputSchemaIssues`, so contract drift is observable rather than silent. Declare `present` in your
`outputSchema` when you emit it:

```ts
outputSchema: {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed' },
    data: { type: 'object', description: 'Machine-readable payload' },
    present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Stable identifier for the block' },
          title: { type: 'string', description: 'Optional heading shown above the block' },
          kind: { type: 'string', description: "How to interpret the body. Defaults to 'text'." },
          body: { type: 'string', description: 'Pre-formatted plain text' },
        },
        required: ['id', 'body'],
      },
    },
  },
  required: ['success', 'present'],
}
```

### Delegating to other skills

A composite skill calls a lower-order skill with `__execute_tool` inside its source. The callee
returns `{ success, error, ... }` on failure rather than throwing, so a composite skill must check
the result:

```js
const result = await __execute_tool('some-skill', args);
if (result && result.success) {
  // use result.data
} else {
  // record the failure; do not report a complete evaluation you did not perform
}
```

Nested execution is bounded by `MAX_NESTING_DEPTH` in
[../../services/tool-executor/src/services/ToolExecutor.ts](../../services/tool-executor/src/services/ToolExecutor.ts).
A skill marked `confirmBeforeSend` cannot be nested unless the caller passes `dryRun: true`.

## Creating a workflow

```ts
import {
	createWorkflow,
	createWorkflowLane,
	createWorkflowStage,
} from '../../services/tool-executor/src/adk';

const workflow = createWorkflow({
	assistantId: 'event',
	productObject: 'event / vendor',
	flow: 'plan -> vendors -> day-of',
	stages: [
		createWorkflowStage({
			id: 'plan',
			name: 'Plan',
			description: 'Create the event plan and budget.',
			skillIds: ['event_planning_budgeting'],
			transitions: ['vendors'],
		}),
		createWorkflowStage({
			id: 'vendors',
			name: 'Vendors',
			description: 'Manage vendor contracts.',
			skillIds: [],
			transitions: ['day-of'],
		}),
		createWorkflowStage({
			id: 'day-of',
			name: 'Day-of',
			description: 'Run event operations.',
			skillIds: [],
		}),
	],
	lanes: [
		createWorkflowLane({
			id: 'planning',
			name: 'Planning',
			description: 'Plan the event.',
			stageIds: ['plan'],
			modes: ['draft'],
		}),
		createWorkflowLane({
			id: 'execution',
			name: 'Execution',
			description: 'Execute the event.',
			stageIds: ['vendors', 'day-of'],
			modes: ['review', 'live'],
		}),
	],
});
```

## Creating a skill and assistant

```ts
import {
	createAssistant,
	createContextPolicy,
	createApprovalPolicy,
	createSkill,
} from '../../services/tool-executor/src/adk';

const skill = createSkill({
	tool: planningTool,
	laneId: 'planning',
	stageId: 'plan',
});

const assistant = createAssistant({
	identity: { id: 'event', name: 'Event', description: 'Event operations assistant' },
	productObjects: ['event / vendor'],
	workflow,
	skills: [skill],
	configuration: { defaults: { region: 'us-east' }, requiredKeys: ['region'] },
	contextPolicy: { objectKeys: ['eventId'] },
	approvalPolicy: {
		requiresConfirmation: (request) => request.action === 'book',
		dryRunByDefault: true,
		allowedStates: ['draft'],
	},
});
```

The builder enforces match checks between the workflow assistant ID and the assistant identity, validates lane and stage references, prevents duplicate skill IDs, and rejects unknown transitions.

## Using the sample assistants

The repository already includes a library of sample assistants in [../../services/tool-executor/src/data/skills](../../services/tool-executor/src/data/skills). A canonical example is the event assistant in [../../services/tool-executor/src/data/skills/event/index.ts](../../services/tool-executor/src/data/skills/event/index.ts). It defines the event skills and a workflow named plan → vendors → day-of.

The runtime API for browsing these workflows is in [../../services/tool-executor/src/routes/workflows.ts](../../services/tool-executor/src/routes/workflows.ts), and the workspace state machine is in [../../services/tool-executor/src/routes/workspaces.ts](../../services/tool-executor/src/routes/workspaces.ts).

## Validation and guardrails

The active ADK includes validation for:

- duplicate skill IDs
- workflow stage mismatch
- unknown lane references
- unknown stage transitions
- object context changes
- approval checks based on workflow state and dry-run settings

These rules are exercised in [../../services/tool-executor/src/__tests__/adk-composition.test.ts](../../services/tool-executor/src/__tests__/adk-composition.test.ts).

## Run locally

```bash
cd services/tool-executor
npm test -- --runInBand src/__tests__/adk-composition.test.ts
```

The ADK implementation is therefore best viewed as a contract-plus-builder system for modeling and validating workflow-driven assistants, rather than a legacy microservice bootstrap layer.
