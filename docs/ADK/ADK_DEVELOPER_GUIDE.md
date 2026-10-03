# Agent Development Kit (ADK) — Developer's Guide

This guide details the technical contracts, file structures, TypeScript interfaces, runtime context APIs, and execution signatures required to build Assistants, Skills, and Tools using the Agent Development Kit (ADK). It implements the architecture defined in **ADK_OVERVIEW.md**, which is the source of truth; where the two disagree, the Overview wins.

> **Status markers.** Items marked **[PROPOSED]** are required by capabilities the Overview promises (LLM execution, RAG, chat interaction, tool orchestration) but are not yet specified there. They are collected in Appendix A for confirmation.

---

## 1. Directory Structure & Layout Protocol

Every Assistant is defined completely inside its own folder under `src/assistants/<assistant-id>/` (Overview §2.1, the Folder Rule). No code, prompt, configuration, or environment variable specific to an Assistant exists outside this directory, and **no Assistant-specific environment variables are declared at the system or container level**.

```text
src/assistants/<assistant-id>/
├── assistant.json             # Assistant identity and static domain knowledge refs
├── index.ts                   # Exported Assistant entry point, skills array, workflow registry
├── knowledge/                 # Static domain knowledge (.md, .txt, .json)
│   ├── best-practices.md
│   └── domain-rules.md
├── skills/                    # Higher-order Skills (isSkill: true)
│   └── manage-ticket.ts
├── tools/                     # Assistant-specific lower-order Tools / sub-skills (isSkill: false)
│   ├── ticket-understanding.ts
│   └── response-drafting.ts
└── prompts/                   # System prompt fragments and templates
    └── system-prompt.md
```

The folder is an **immutable blueprint** that changes only at deployment time. Everything that changes at runtime (user configuration, persisted records, learned insights, dynamic trigger records) lives in stage7 persistence, never in this folder.

### 1.1 `assistant.json` Manifest

The manifest defines static metadata and the static domain knowledge files for the blueprint.

```json
{
  "id": "support",
  "name": "Customer Support Assistant",
  "description": "Handles ticket intake, sentiment analysis, knowledge retrieval, response drafting, and resolution operations.",
  "version": "1.0.0",
  "domainKnowledgeFiles": [
    "knowledge/best-practices.md",
    "knowledge/domain-rules.md"
  ]
}
```

**Domain knowledge delivery is not configurable per Assistant.** On deployment, stage7 seeds every file in `domainKnowledgeFiles` into the instance's **Vector Knowledge Store**, which also holds the Assistant's dynamic learnings. RAG retrieval queries that single unified store (Overview §4.1).

**Approval policy is not declared in the manifest.** Approval gating is derived from each Skill's tier (see §2.2 and §7) and cannot be disabled per Assistant. The manifest may carry additional *domain* policies where an Assistant needs them (for example `enforceGroupIsolation` or `hipaaComplianceEnforced`) under an optional `policies` object.

---

## 2. Defining Skills and Tools

Skills and Tools are declared using the `createDeclarativeCodeSkill` factory function. The `isSkill` property determines whether the runtime mounts a UX panel on the Overview page or treats the handler as an internal lower-order step.

### 2.1 Skill vs. Tool Declaration Rules

* **Higher-Order Skill (`isSkill: true`):** Canonical entry point mounted on the Overview page with a dedicated UX panel, Action Button, configuration settings, and structured presentation template. Orchestrates overall workflow execution.
* **Sub-Skill / Lower-Order Tool (`isSkill: false`):** Internal, modular execution step called inside higher-order Skills. Mounts no independent UI and returns a raw data payload to the orchestrator. A lower-order step may be a deterministic Tool (data manipulation, external API adapter, state write) or an LLM-driven sub-skill.
* **Tool scope:** Assistant-specific tools live in the Assistant's `tools/` folder and are used only by that Assistant. Generalized, multi-assistant tools (File I/O, Slack, Jira, and so on) belong to the global stage7 Portfolio and are not copied into Assistant folders.

### 2.2 Skill Tiers & Risk-Driven Approval

Every Skill declares exactly one tier. **The tier is the sole driver of approval behavior.** The runtime derives the gate from the tier; authors do not declare, configure, or opt out of it.

| Tier | Scope | Risk | Runtime behavior |
| --- | --- | --- | --- |
| `advise` | Analyzes data, generates assessments and recommendations. Reads state; takes no outbound action. | Low | Runs autonomously. |
| `aid` | Co-creates work products (drafts, plans, templates) for the user to review, edit, or manually send. | Medium | Runs autonomously to produce the work product; final delivery requires the user's manual action outside the Skill. The handler must not deliver to an external system. |
| `represent` | Executes actions against external systems on the user's behalf (sending email, committing PRs, calling external APIs). | High | **Mandatory policy gate (`confirmBeforeSend`).** The runtime halts before the handler runs and requires explicit user confirmation. |

Consequences for authors:

* There is no `confirmBeforeSend` field on `SkillConfig`. A `represent` Skill is gated because it is `represent`.
* The gate applies regardless of trigger. A `represent` Skill fired by a schedule or an event is gated exactly like one fired from the Action Button.
* Lower-order tools carry no gate of their own. A tool that performs external actions is reachable only through a gated `represent` higher-order Skill. `npm run adk:validate` rejects a `represent`-tier tool that is registered as a standalone entry point.

```typescript
export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  tier: 'advise' | 'aid' | 'represent';   // drives the approval gate; see §2.2
  schemaVersion: number;                   // applies to inputs, configs, and output payloads
  domainKnowledge?: string;
  inputSchema: JSONSchemaObject;
  configSchema?: JSONSchemaObject;
  outputSchema: JSONSchemaObject;
  triggers: SkillTrigger[];
  isSkill: boolean;
  manifest?: Record<string, any>;
  handler: (input: any, ctx: ExecutionContext) => Promise<SkillExecutionResult>;
}
```

---

## 3. Schemas, Configs, and Secret Flagging

Input and configuration schemas use standard JSON Schema definitions extended with ADK property metadata.

### 3.1 Input Schema with Collection References

Inputs can reference persisted MongoDB collections to auto-populate selection controls on the Overview UX panel from the current instance state.

```typescript
inputSchema: {
  type: 'object',
  properties: {
    ticketId: SchemaProps.text({
      description: 'Ticket identifier',
      sourceCollection: 'tickets' // Auto-populates picker from the 'tickets' collection
    }),
    issue: SchemaProps.text({ description: 'Issue description' }),
  },
  required: ['ticketId'],
}
```

### 3.2 Config Schema and Secret Storage Flagging

Configuration keys defined in `configSchema` are managed on the Assistant's Settings page and stored in MongoDB. Any property marked `isSecret: true` is routed to the **stage7 Secrets Service** instead. Common keys (for example a shared `SLACK_API_KEY`) are stored centrally and shared across Skills and Assistants.

```typescript
configSchema: {
  type: 'object',
  properties: {
    apiEndpoint: SchemaProps.text({ description: 'External API base URL' }),
    apiKey: SchemaProps.text({
      description: 'Secret API Access Token',
      isSecret: true // Directs storage to the stage7 Secrets Service
    }),
  },
  required: ['apiKey'],
}
```

At runtime, configuration is **merged on read**: `configSchema` defaults are merged with persisted Mongo and Secrets values before the handler sees them (Overview §5.1).

---

## 4. Execution Context (`ctx`) API Reference

The `ctx` object passed to every skill and tool handler provides safe access to state, configuration, render utilities, and secrets without exposing raw environment dependencies.

### 4.1 Core context

```typescript
export interface ExecutionContext {
  store: {
    /**
     * Loads a persisted collection from the instance Mongo store, passing raw
     * records through hydration adapters based on schemaVersion (see §5).
     */
    load<T = any>(collectionName: string, defaultValue?: T[]): T[];
    /**
     * Persists records to Mongo, automatically stamping `_schemaVersion`
     * and `_updatedAt`.
     */
    save<T = any>(collectionName: string, data: T[]): void;
  };
  /** Merged configuration: configSchema defaults + persisted values (non-secret). */
  config: Record<string, any>;
  render: {
    /** Generates a structured presentation block for Overview panel rendering. */
    text(type: 'report' | 'card' | 'summary', title: string, lines: string[]): RenderBlock;
  };
  secrets: {
    /** Retrieves a decrypted secret value from the stage7 Secrets Service. */
    get(keyName: string): Promise<string | null>;
  };
}
```

There is no filesystem path accessor. All persistence goes through the stage7 persistence layer.

### 4.2 Additions required by the Overview **[PROPOSED]**

The Overview commits Skills to LLM execution, RAG retrieval, chat interaction, and orchestration of lower-order steps, but defines no handler-level API for them. The following surface is proposed so handlers do not bypass the harness:

```typescript
export interface ExecutionContext {
  // ...core context above...

  /** Routed through the stage7 LLM interface. Validation failures feed the self-correction protocol (§9). */
  llm: {
    generateStructured<T = any>(prompt: string, outputSchema: JSONSchemaObject): Promise<T>;
  };

  /** Queries the unified Vector Knowledge Store (static domain knowledge + dynamic learnings). */
  knowledge: {
    query(text: string, opts?: { topK?: number }): Promise<Array<{ text: string; source: string }>>;
  };

  /** Dual-channel interaction (Overview §2.3): speak in the Assistant Chat Window. */
  chat: {
    ask(question: string): Promise<string>;     // clarifying question when inputs are missing or ambiguous
    notify(message: string): Promise<void>;     // proactive status update
  };

  /** Invokes a lower-order tool or sub-skill THROUGH the harness (retry, self-correction, schema stamping). */
  tools: {
    call<T = any>(toolId: string, input: any): Promise<SkillExecutionResult<T>>;
  };
}
```

Skills call lower-order steps with `ctx.tools.call(...)`, **not** by invoking another definition's `.handler` directly, because a direct call would skip the harness protocols in §9.

---

## 5. Schema Versioning & On-Read Hydration Adapters

To update data structures without database migration scripts, declare a `schemaVersion` and provide a hydration adapter for each persisted collection (Overview §5).

1. Skill manifests state an integer `schemaVersion`.
2. On write, the ADK stamps `_schemaVersion` and `_updatedAt`.
3. On read, if `doc._schemaVersion < currentVersion`, the adapter transforms or defaults fields lazily in memory before the handler sees the record.
4. Adapters are **chained**, so a v1 document passes through every step up to the current version.

### 5.1 Hydration Pattern Example

```typescript
export function hydrateTicket(rawDoc: any): TicketRecord {
  let doc = { ...rawDoc };
  let version = doc._schemaVersion || 1;

  if (version < 2) {
    // v1 (flat text) -> v2 (structured status + priority)
    doc = { ...doc, status: doc.status || 'open', priority: doc.priority || 'medium' };
    version = 2;
  }
  // if (version < 3) { ... } // add further steps here; never edit earlier ones

  return { ...doc, _schemaVersion: version } as TicketRecord;
}
```

---

## 6. Full Code Implementation Examples

### 6.1 Lower-Order Sub-Skill (`tools/ticket-understanding.ts`)

An internal step (`isSkill: false`). It mounts no UI and returns a raw payload to its orchestrator.

```typescript
// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

export const SUPPORT_SENTIMENT_ANALYSIS = createDeclarativeCodeSkill({
  id: 'support-sentiment-analysis',
  name: 'Analyze Ticket Sentiment',
  description: 'Analyze sentiment of customer communications.',
  tier: 'advise',
  schemaVersion: 1,
  isSkill: false, // Lower-order step: no Overview UX panel
  inputSchema: {
    type: 'object',
    properties: {
      text: SchemaProps.text({ description: 'Text to analyze' }),
    },
    required: ['text'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
    },
    required: ['success'],
  },
  triggers: [],
  handler: async function handler(input, ctx) {
    // [PROPOSED] ctx.llm; output is validated against the schema, failures enter self-correction (§9)
    const result = await ctx.llm.generateStructured(
      `Classify the sentiment of this customer message:\n${input.text}`,
      {
        type: 'object',
        properties: {
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
          confidence: { type: 'number' },
        },
        required: ['sentiment', 'confidence'],
      }
    );
    return { success: true, data: result };
  },
});
```

### 6.2 Higher-Order Skill (`skills/manage-ticket.ts`)

The canonical entry point (`isSkill: true`). Tier is `aid`: it produces a draft for the user to review and send, so it records the draft but does not mark the ticket resolved or deliver anything externally.

```typescript
// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

export const SUPPORT_RESOLVE_TICKET = createDeclarativeCodeSkill({
  id: 'support-resolve-ticket',
  name: 'Resolve Support Ticket',
  description: 'Analyze an incoming customer issue and draft a resolution for review.',
  tier: 'aid',
  schemaVersion: 2,
  isSkill: true, // Mounts a UX panel on the Overview page
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: SchemaProps.text({ description: 'Ticket identifier', sourceCollection: 'tickets' }),
      issue: SchemaProps.text({ description: 'Issue details provided by customer' }),
    },
    required: ['ticketId', 'issue'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
    },
    required: ['success'],
  },
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Resolve this support ticket',
        'Process ticket',
        'Analyze issue and draft response',
      ],
    },
  ],
  handler: async function handler(input, ctx) {
    const { ticketId, issue } = input;

    // 1. Run the lower-order step through the harness [PROPOSED ctx.tools]
    const sentimentRes = await ctx.tools.call('support-sentiment-analysis', { text: issue });
    const sentiment = sentimentRes.data?.sentiment || 'neutral';

    // 2. Draft the resolution using static domain knowledge + learnings [PROPOSED ctx.knowledge / ctx.llm]
    const guidance = await ctx.knowledge.query(`resolution guidance: ${issue}`, { topK: 3 });
    const { draft } = await ctx.llm.generateStructured(
      `Draft a customer response. Sentiment: ${sentiment}.\nIssue: ${issue}\nGuidance:\n${guidance.map(g => g.text).join('\n')}`,
      { type: 'object', properties: { draft: { type: 'string' } }, required: ['draft'] }
    );

    // 3. Upsert the ticket record (update in place; never duplicate)
    const tickets = ctx.store.load('tickets', []);
    const existing = tickets.find(t => t.ticketId === ticketId);
    const record = {
      ...(existing || { ticketId }),
      issue,
      sentiment,
      draftResolution: draft,
      status: 'draft_ready', // The user, not this Skill, decides when it is sent or resolved
    };
    ctx.store.save('tickets', existing ? tickets.map(t => (t.ticketId === ticketId ? record : t)) : [...tickets, record]);

    // 4. Deterministic presentation for the Overview panel (no LLM-synthesized chat text)
    return {
      success: true,
      data: record,
      present: [
        ctx.render.text('report', `Ticket Resolution Draft (${ticketId})`, [
          `Issue: ${issue}`,
          `Customer Sentiment: ${sentiment.toUpperCase()}`,
          '',
          '━━━ PROPOSED RESOLUTION ━━━',
          draft,
        ]),
      ],
    };
  },
});
```

### 6.3 Assistant Entry Point (`index.ts`)

Registers skills, tools, and stage mapping for the Assistant folder.

```typescript
import { Tool } from '../../types';
import { SUPPORT_RESOLVE_TICKET } from './skills/manage-ticket';
import { SUPPORT_SENTIMENT_ANALYSIS } from './tools/ticket-understanding';
import { annotateStages, createWorkflow } from '../workflow-common';

// Canonical higher-order skills (isSkill: true) -> mount a UX panel on Overview
export const supportCanonicalSkills: Tool[] = [
  SUPPORT_RESOLVE_TICKET,
];

// Lower-order steps (isSkill: false) -> internal only
export const supportLowerOrderTools: Tool[] = [
  SUPPORT_SENTIMENT_ANALYSIS,
];

export const supportSkills = [...supportCanonicalSkills, ...supportLowerOrderTools];

annotateStages(supportSkills, {
  'support-resolve-ticket': 'intake',
  'support-sentiment-analysis': 'intake',
});

export const supportWorkflow = createWorkflow({
  assistant: 'Support',
  productObject: 'ticket / customer',
  flow: 'intake → resolution',
  stages: [
    { name: 'intake', description: 'Intake and analysis', stageIds: ['support-resolve-ticket', 'support-sentiment-analysis'] },
  ],
}, supportSkills);
```

---

## 7. Risk-Driven Approval Gating

Approval behavior follows directly from the tier (§2.2); there is nothing to configure per Skill or per Assistant.

### 7.1 Authoring a `represent` Skill

Set `tier: 'represent'` and write the handler. The runtime applies the `confirmBeforeSend` gate automatically.

```typescript
export const SEND_EXTERNAL_NOTIFICATION = createDeclarativeCodeSkill({
  id: 'send-external-notification',
  name: 'Send Customer Notification',
  description: 'Sends an official outbound email notification to a customer.',
  tier: 'represent', // The runtime gates this Skill because of its tier
  schemaVersion: 1,
  isSkill: true,
  // ...
  handler: async function handler(input, ctx) {
    // Reached ONLY after the user explicitly approves on the confirmation card
    const sent = await notifyExternalApi(input);
    return { success: sent, data: { status: 'delivered' } };
  },
});
```

### 7.2 Runtime behavior

When a `represent` Skill is triggered, from any trigger kind, the harness:

1. serializes the pending execution state (the resolved input and merged config),
2. renders an approval card on the Skill's Overview panel,
3. sends a notification to the Assistant Chat Window,
4. does **not** execute the handler until the user confirms.

`aid` Skills never reach an external system from the handler; the user performs final delivery. `advise` Skills run autonomously.

---

## 8. Triggers & Event Contracts

Skills can be invoked in three ways. The three kinds map directly to the Overview (§3.2).

```typescript
triggers: [
  // User-triggered: Overview Action Button or Chat phrase
  {
    kind: 'user',
    phrase_examples: ['Resolve ticket', 'Analyze issue']
  },
  // Schedule-triggered: recurring clock interval
  {
    kind: 'schedule',
    cron: '0 9 * * 1', // Every Monday at 9:00 AM
    defaultInput: { analysisType: 'weekly_summary' }
  },
  // Event-triggered: state change in Mongo or an external webhook
  {
    kind: 'event',
    eventSource: 'mongo:tickets:inserted',
    mapEventToInput: (eventPayload) => ({
      ticketId: eventPayload.document.id,
      issue: eventPayload.document.description
    })
  }
]
```

A `schedule` trigger should carry `cron`. `cadence` is accepted as shorthand, but only where it has
exactly one interpretation: `hourly`, and intervals like `Every 15 minutes`. Named periods (`daily`,
`weekly`, `monthly`) do not say *when*, and a qualified cadence (`during configured windows`, `After
job discovery completes`) is conditional, so `TriggerScheduler` reports those as issues naming the
cron to write instead of inferring a frequency. That matters: inferring "every 5 minutes" onto a run
the author meant to hold back fires a Skill nobody asked to run. Most `cadence` declarations in the
shipped catalogue are prose and are reported this way; authors should prefer `cron`. `npm run
adk:validate` raises `unschedulable-cadence` at authoring time, and a test asserts the validator and
the scheduler reject the same declarations, so a rule cannot drift from the runtime.

### 8.1 Dynamic triggers

Triggers declared in code are part of the immutable blueprint. At runtime an Assistant can adapt a user-triggered Skill into a scheduled or event-triggered one on the user's instruction (for example, "run this competitor search every Monday at 9 AM"). When it does:

- The Assistant **never modifies the folder blueprint**.
- The stage7 runtime writes a **Dynamic Trigger Record** to instance persistence
  (`TriggerRecordStore`, Mongo-backed with a local mirror).
- The `TriggerScheduler` evaluates persisted trigger records at runtime, alongside the
  triggers declared in code, and rebuilds its plan from the tool registry on every tick.
- Tier gating is unchanged: the scheduler never sends `confirmation`, so a dynamically
  scheduled `represent` Skill is still gated on every run.

### 8.2 Writing a Skill that can be subscribed to

Every run announces an event, so a Skill is subscribable without extra work: it emits
`<assistantId>.<your-skillId>.completed`. Two rules make that useful:

- **Declare `emitEvent` when the change is meaningful.** A derived completion event only says "this run
  finished". If another Skill or an operator should respond to *this specific* change — a contract booked, an
  invoice paid — declare an id for it. `npm run adk:validate` warns when a Skill that alters data declares
  none.
- **Subscribe with `eventId`, not prose.** The runtime matches event ids exactly. An event trigger
  carrying only `on:` text will never fire, and validation says so with the id it should name.

```ts
// Emitter: announces a business event, not just "finished".
createDeclarativeCodeSkill({
  id: 'vendor-contract-management',
  name: 'Vendor & Contract Management',
  description: 'Manages vendor contracts and payments for events.',
  tier: 'represent',
  emitEvent: 'vendor.contract.updated',
  // ...
});

// Subscriber: names the event it acts on.
triggers: [{
  kind: 'event',
  eventId: 'vendor.contract.updated',
  mapEventToInput: (p) => ({ contractId: p.data.contractId })
}]
```

### 8.3 Failures, aborts, and external producers

A run announces its outcome, not just its completion:

| Outcome | Id |
|---|---|
| Completed with a declared change | every declared `emitEvent` the run produced |
| Completed with no declaration, or nothing changed | `<assistantId>.<skillId>.completed` |
| Attempted and broke | `<assistantId>.<skillId>.failed` |
| Never attempted | `<assistantId>.<skillId>.aborted` |

### 8.3.1 A run announces every outcome it produced

`emitEvent` takes one id or a list, and a run announces **one event per outcome**, not one per run:

```ts
createDeclarativeCodeSkill({
  id: 'hotel-housekeeping-manager',
  // Every outcome this Skill is capable of producing.
  emitEvent: [
    'hotel.housekeeping.task_created',
    'hotel.housekeeping.task_updated',
    'hotel.housekeeping.task_assigned',
    'hotel.housekeeping.work_dispatched',
  ],
  handler: async (input, ctx) => {
    const action = resolveOperation(input);
    // ...perform one of the four...
    return {
      success: true,
      // Narrow to what actually happened. Omit the field and every declared id is
      // announced; return `[]` and the run only reports that it completed.
      emittedEvents: [`hotel.housekeeping.task_${past(action)}`],
    };
  },
});
```

A Skill that changes two things and announces one is asserting the other did not happen, which is
why the single-id shape was wrong rather than merely limiting. All events from one run share an
`executionId`, so a consumer can see they came from one execution, and a subscriber of two of them is
run once per execution rather than twice.

A reported id the Skill does not declare is dropped, with a warning. That keeps the event graph
statically checkable — `unresolvable-event-id` can still prove every subscription has a producer —
instead of letting a typo in a handler become a real event nothing can reach. For the same reason,
two Skills must not declare the same id: a delegation and the orchestrator around it would announce
the same change twice.

### 8.3.2 Dry runs announce nothing that did not happen

A Skill that can stage instead of act reports a dry run by `input.dryRun === true` or by its own
`status: 'dry-run'`. The runtime then announces **only** the derived `.completed` event, never the
declared business ids — `finance.report.published` says a board report was published, and a staged
report is not a published one. Fifteen Skills have a dry-run path and a declared event, and all
fifteen are covered by this one rule rather than fifteen patches.

Both signals are checked because neither suffices: `reporting-data-ops` defaults `dryRun` to true but
leaves it undefined on the input, so it announces its own `status: 'dry-run'`.

Note that a code Skill's execution output is an envelope, `{ output: "<handler JSON>", exitCode }`,
so both this check and `emittedEvents` read the handler's own result rather than the envelope. Reading
the envelope finds nothing, which is how both silently stopped working on real Skills while passing
against hand-built fixtures.

`aborted` covers the paths that stop before the Skill runs: `ConfirmationRequiredError`, missing
credentials, and a failed config schema. `failed` covers a run that went ahead and did not succeed —
including the case where `dispatch` returns `{ error }` rather than throwing, which is why the emit is
gated on `output.error === undefined` and not on the reported status.

Outcome ids are derived from the Skill's identity and **never** from its `emitEvent`. A declared id
names a business outcome, and publishing it for a run that broke would claim the outcome happened.

**Never subscribe to your own event.** A subscription is also a dispatch edge, and the runtime resolves
subscribers by id; naming your own event makes each run trigger another run of the same Skill. For a
`represent` Skill that performs the action twice. The factory used to append such a self-subscription
so the edge would appear in the Overview, and it is gone for this reason. `adk:validate` reports it as
`self-subscribing-event-trigger` at error severity.

**Do not both delegate and subscribe.** If an orchestrator lists a Skill in `lowerOrderTools` and calls
it with `ctx.delegate`, do not also subscribe that Skill to the orchestrator's event. Both paths arrive
on the same run, so a `represent` Skill reached twice allocates resources or sends the message twice.
`adk:validate` reports the overlap.

**External producers.** When an event originates outside stage7 — a door scanner, an odds feed, an EHR
webhook — declare a contract rather than a Skill subscription:

```ts
triggers: [{
  kind: 'event',
  on: 'Room status change requiring housekeeping turnover',
  externalEvent: true,
  eventId: 'hotel.external.stock_level.changed',
}]
```

`externalEvent: true` asserts that something outside this codebase publishes that exact id. Without it
`adk:validate` reports the id as `unresolvable-event-id`, which is the right default: most ids that
match nothing are typos, not integrations. Naming the contract turns an edge that could never fire into
one that is documented, matchable, and checked.

### 8.4 What validation now enforces

Five rules cover the event graph, all checked by `npm run adk:validate`:

| Rule | Severity | Catches |
|---|---|---|
| `emit-event-declared` | warning | A `represent` Skill that changes something and announces only "finished" |
| `matchable-event-trigger` | warning | An event trigger carrying prose instead of an id |
| `unresolvable-event-id` | warning | A subscription to an id no Skill publishes and no external contract declares |
| `self-subscribing-event-trigger` | **error** | A Skill subscribed to the event it announces |
| `declared-emit-event-unreachable` | warning | `emitEvent` in source that never reaches the manifest |
| `redundant-delegation-subscription` | warning | A Skill both delegated to and subscribed to the same producer |

The last two exist because source-text matching was not enough. `emit-event-declared` now reads the
**built Skill** rather than the file: the old source lookup was keyed on filename == skill id, so a
Skill in a differently-named file read as declaring nothing, and a factory can accept `emitEvent`
without forwarding it into the manifest, leaving a declaration that announces nothing.

`altersData` is likewise tier-based (`represent` and nothing else). It previously also treated "has an
external `system`" as mutating, which flagged six read-only analyzers — content analytics, learner
insight, market research, audience insights, product metrics, songwriter trend analysis — as Skills that
change data. Declaring a business event for a reader would have invented six.

---

## 9. Error Handling & Self-Healing

Failure handling is a **harness protocol** (Overview §6), applied before anything is shown to the user. Handlers do not implement their own retry loops.

1. **Deterministic Retry (harness).** Let transient failures (network errors, rate limits, 5xx) propagate; the harness retries with exponential backoff.
2. **LLM Self-Correction (harness).** For invalid or missing input and malformed or schema-violating outputs, return `{ success: false, error }` with a clear reason. The harness feeds the validation error to stage7 code repair and re-prompting.
3. **Chat Escalation (harness).** When retry and self-correction fail, execution pauses and the harness surfaces an actionable card in the Assistant Chat Window. It explains the state issue without exposing raw stack traces.

```typescript
handler: async function handler(input, ctx) {
  if (!input.ticketId) {
    // Routed to the self-correction layer
    return { success: false, error: 'Missing required field: ticketId' };
  }

  // Do not wrap transient failures in try/catch just to retry; the harness handles that.
  const result = await performAction(input);
  return { success: true, data: result };
}
```

If a handler wants to give the user context on an unrecoverable failure, it may return a `present` card, but the card must contain user-safe wording only: no stack traces, internal paths, or raw exception text.

---

## 10. Local Verification & Testing

Assistants can be validated locally using the ADK test runner without a full stage7 deployment.

```bash
# Validate blueprint structure, manifest integrity, folder-rule compliance
# (no assistant-specific env vars or out-of-folder references), and tier rules
npm run adk:validate src/assistants/<assistant-id>

# Run unit tests for Assistant skills and tools against a local mock context
npm run adk:test src/assistants/<assistant-id>
```

---

## Appendix A — Open items to confirm

1. **`ctx` additions (§4.2):** `llm`, `knowledge`, `chat`, `tools`, and `config`. `config` follows from Overview §5.1(4); the rest are proposed to support Overview §2.3, §4.1, and §3.1.
2. **Tool tiers:** v9 lists a tier for every tool. This guide treats tool tier as risk classification inherited through the calling Skill, with the gate applied at the `represent` higher-order Skill (§2.2). Confirm.
3. **Hydration adapter registration:** how an adapter is attached to a collection (index.ts export, manifest entry, or factory option) is not specified.
4. **Store concurrency:** `store.load`/`store.save` operate on whole collections. With concurrent user, scheduled, and event-triggered runs this risks lost updates; per-document operations may be needed.
5. **Event loops:** an event trigger on a collection that the triggered Skill itself writes can re-fire indefinitely. A runtime loop guard (origin marker or depth limit) should be specified.
6. **Approval at scale:** the runtime semantics of pending approvals for scheduled or event-triggered `represent` runs (queueing, expiry, idempotency, and stale-input handling) are not yet defined.