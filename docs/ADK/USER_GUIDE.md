# ADK User Guide

This guide is for end users who interact with assistants built on the Assistant Development Kit (ADK). It
covers how to use the system, the assistants that ship with it, how skills behave, and where every API
lives.

## What is the ADK?

The ADK is a framework for building workflow-driven AI assistants. Unlike free-form chatbots, ADK
assistants are made of **Skills** — named, versioned capabilities with typed inputs, declared risk
tiers, and built-in approval gating — hosted in self-contained **blueprint folders** and backed by
persistent state and an audit trail.

## What changed in this version

If you used an earlier build of this guide, note the following. Everything below is now enforced by
tests in the ADK composition suite.

| Earlier guide | Current ADK |
|---------------|-------------|
| Workflow **stages** and **lanes**, `draft`/`review`/`live` **modes** | Removed. An assistant is a flat set of Skills; `flow` is a human-readable label, not an enforced sequence |
| Advance work with `POST /api/workspaces/:id/transition` with a **transition name** | Progression is trigger-driven. `POST /api/workspaces/:id/transition` still exists but now takes a **workflow state** from the fixed set below |
| Approval configured per assistant, gated "only in specific workflow states" | Approval is **derived from the Skill's tier** (`advise`/`aid`/`represent`) and cannot be switched off |
| Approvals queued and answered at `POST /api/workspaces/:id/approvals/:approvalId` | No approval queue. A gated Skill returns `403` on the first call and runs on the re-sent call with `confirmation: true` |
| `POST /api/workspaces` with `assistantId`/`objectId`/`objectType` | `POST /api/tool-executor/workspaces` with `assistant` and `productObject` |
| `POST /api/workspaces/:id/skills/execute` | `POST /api/tool-executor/tools/:id/execute` |
| 5 assistants | 21 assistants |
| Gateway on port 3000 | Gateway on host port **3900**; ten backend services, plus Mongo and Redis |
| `schedule` triggers accepted but nothing read them | A real scheduler in the tool-executor reads them, with cron support and a visible schedule listing. A `cadence` that does not say when is reported, not guessed |
| No Skill emitted an event | Every run announces one: the declared `emitEvent` where the effect is invisible, an id derived from the records it actually wrote otherwise, `<assistantId>.<skillId>.failed` when it breaks, `.aborted` when it never started |

## The concepts you need

- **Assistant** — a self-contained blueprint folder. Its `assistant.json` manifest, `skills/`,
  `tools/`, `knowledge/` documents, and `prompts/system-prompt.md` ship together and are immutable at
  runtime. Runtime state lives in the persistence services.
- **Skill** — a user-facing capability (`isSkill: true`). Each Skill owns an Overview panel: an input
  form, an **Action Button**, and a rendered output. Skills are offered on their own merits, not as
  steps in a sequence.
- **Tool** — a lower-order deterministic helper (`isSkill: false`). Tools have no panel and return raw
  payloads to the Skill that called them.
- **Tier** — exactly one per Skill: `advise`, `aid`, or `represent`. The tier alone decides whether
  execution is autonomous or gated.
- **Trigger** — how a Skill gets invoked: `user`, `schedule`, or `event`.
- **Workspace** — the record of work on one business object (an event, a ticket, a patient). It holds
  the workflow state, execution log, approval log, and revisions.
- **Render blocks** (`present`) — the deterministic output a Skill returns for display: text,
  Markdown, table, or chart blocks, alongside the raw `data` payload.

Assistants are usable through two channels at once: the **Overview panels** for structured execution
and output, and the **Assistant chat window** for questions, clarifications, and status notifications.

## Quick start

### Start the platform

```bash
docker compose up -d
```

This brings up the web UI plus ten backend services:

| Service | Host port | Role |
|---------|-----------|------|
| frontend | 8080 | Web UI — open `http://localhost:8080` |
| gateway | 3900 | API entry point and reverse proxy |
| brain | 3100 | LLM routing and health |
| mcp-runtime | 3300 | Tool registry (Model Context Protocol) |
| worker-pool | 3200 | Task queue, execution, assistant registry |
| agent-runtime | 3400 | Agent and worker processes |
| tool-executor | 3500 | ADK runtime: Skills, Tools, workspaces |
| vault | 4000 | Secrets and encryption |
| temporal | 4100 | Durable orchestration |
| artifacts | 4200 | Documents, missions, persistence |
| auth | 4300 | Users, roles, JWT issuance |

Mongo (27017) and Redis (6379) back the stack. The gateway proxies `/api/<service>/...` to the
matching service, so most calls can be made against `http://localhost:3900`.

### Sign in

```bash
curl -X POST http://localhost:4300/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

The response is `{ "success": true, "user": {...}, "token": "<jwt>" }`. The field is `token`, not
`access_token`. Tokens expire after one hour; get a new one with `POST /api/auth/refresh` and a body of
`{"token": "<old token>"}`. Verify one with `GET /api/auth/verify`.

Send it as `Authorization: Bearer YOUR_TOKEN` on subsequent requests:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3900/api/tool-executor/workflows
```

> Security note: the gateway currently forwards the `Authorization` header to upstream services
> without verifying it. Only the auth service validates tokens, and the ADK services do not enforce
> authentication themselves. Do not treat the gateway as a security boundary.

## The assistant catalog

Twenty-one assistants ship in this release. `flow` is a description of the territory the assistant
covers; nothing forces you through it in order.

| Assistant | Product object | Flow |
|-----------|-----------------|------|
| Analytics | metric / insight | report → analyze → query |
| Career | candidate / job | profile → fit ranking → application → prep → tracking → outcomes |
| Content | content piece | plan → draft → optimize → publish |
| CTO | system / incident | monitor → diagnose → plan → approve → execute |
| Education | learner | plan → assess → support |
| Event | event / vendor | plan → vendors → day-of |
| Executive | organization / strategy | review → analysis → recommendation → decision |
| Finance | account / transaction | research → analyze → trade → report |
| Healthcare | patient | review → scheduling → coordination |
| Hotel | stay / booking | booking → stay → review → loyalty |
| HR | applicant | screening → interview → decision |
| Investment | portfolio / security | research → analyze → trade → track |
| Legal | case / matter | intake → research → draft → review |
| Marketing | campaign | plan → create → publish → analyze |
| Product | product / order | plan → specify → analyze → deliver |
| Restaurant | reservation / table | reservation → service → kitchen → billing |
| Sales | lead / opportunity | discovery → proposal → close |
| Scriptwriting | script | brief → draft → revise → finalize |
| Songwriting | song | trend → brief → draft → refine |
| Sports | game / matchup | research → odds → analysis |
| Support | ticket / customer | intake → triage → resolution → follow-up |

### Listing what is available

Three endpoints answer three different questions.

The ADK blueprint catalog — one entry per assistant with a skill count:

```bash
curl http://localhost:3900/api/tool-executor/workflows
```

The runtime tool catalog — every Skill and Tool with its tier, triggers, and schemas:

```bash
curl http://localhost:3900/api/tool-executor/tools
```

The registered-assistant list used by the UI (folders deployed to worker-pool):

```bash
curl http://localhost:3900/api/workers/assistants
```

### Inspecting one assistant

```bash
curl http://localhost:3900/api/tool-executor/workflows/event
```

This returns the assistant's product object, flow, and full skill list. Each entry carries `id`,
`name`, `description`, `tier`, `isSkill`, `triggers`, `inputSchema`, and `configSchema`.

For a view wired to live workspace state, add `?workspaceId=`:

```bash
curl "http://localhost:3900/api/tool-executor/workflows/event/runtime?workspaceId=WORKSPACE_ID"
```

## Running a skill

### Assistant context is required

Skills cannot be executed anonymously. Every skill run must name the assistant it belongs to, either
with the `X-Assistant-Id` header or an `assistantId` body field. Without one you get
`400 Skill execution requires assistant context`.

### Execute a skill

```bash
curl -X POST http://localhost:3900/api/tool-executor/tools/event-planning-budgeting/execute \
  -H "Content-Type: application/json" \
  -H "X-Assistant-Id: event" \
  -d '{
    "workspaceId": "WORKSPACE_ID",
    "input": {
      "task": "plan",
      "eventName": "Annual Conference 2026",
      "eventType": "conference",
      "expectedAttendees": 400,
      "budgetTotal": 120000
    }
  }'
```

A successful call returns an execution record:

```json
{
  "executionId": "exec_...",
  "toolId": "event-planning-budgeting",
  "status": "completed",
  "output": {
    "success": true,
    "status": "ok",
    "data": { "plan": { "id": "event_...", "eventName": "Annual Conference 2026" } },
    "present": [
      { "id": "overview", "title": "Event summary", "kind": "markdown", "body": "**Annual Conference 2026**…" }
    ]
  }
}
```

`status` is one of `completed`, `failed`, or `pending_credentials`. Inside `output.status` you will
see `ok`, `partial`, `failed`, `blocked`, `not-connected`, or `confirmation-required`.

### Preview before you commit

Preview returns the approval summary — what would happen, against what, and which records would be
touched — without executing anything:

```bash
curl -X POST http://localhost:3900/api/tool-executor/tools/event-vendor-contract-management/preview \
  -H "Content-Type: application/json" \
  -d '{"input": { "contractId": "contract_123" }}'
```

### Supplying missing credentials

Skills that call external systems declare their credentials. If one is missing, the call returns
`428` with a `request` object naming what is needed:

```bash
curl http://localhost:3900/api/tool-executor/executions/EXECUTION_ID/credential-request
```

Submit the values and the execution resumes:

```bash
curl -X POST http://localhost:3900/api/tool-executor/executions/EXECUTION_ID/credentials \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": { "token": "..." },
    "storeInVault": true,
    "vaultSecretId": "event-vendor-token"
  }'
```

Anything marked as a secret in the schema is routed to the Vault service rather than stored as plain
configuration.

## Tiers and approval

Every Skill carries exactly one tier, and the tier is the gate. There is no setting to disable it and
no configuration key that turns it off.

| Tier | What it does | What happens when you run it |
|------|--------------|-------------------------------|
| `advise` | Reads state and produces an assessment, plan, or recommendation. Nothing leaves the system | Runs immediately |
| `aid` | Co-creates a work product for you to review, edit, and send yourself | Runs immediately; a dry run is also offered |
| `represent` | Acts on external systems on your behalf — sends, commits, calls APIs | **Requires explicit confirmation** |

### Dry run versus approve

For a gated Skill, one of two input flags must be present:

- `"dryRun": true` — validate and show the effect, change nothing. Available on `aid` and
  `represent`.
- `"confirmation": true` — you have read the summary and approve the real run.

A gated call with neither flag is stopped before the handler runs:

```json
{
  "error": "Tool \"Vendor & Contract Management\" requires explicit confirmation before execution",
  "toolId": "event-vendor-contract-management",
  "toolName": "Vendor & Contract Management"
}
```

This is a `403`. Re-send the identical request with `"confirmation": true` to let it through. Each
execution re-derives its own gate, so an approval never carries over to a later run.

In the web UI these two flags appear as the **Preview only** and **Approve & send** controls on the
Skill's panel.

### What an approval leaves behind

An unconfirmed gated run is written to the workspace as a pending approval entry, and the workspace
moves to the `draft` state:

```bash
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/approval-summary
```

## Workspaces and object context

A workspace is the record of work on one business object. It is the unit of continuity: the object you
start with is the object you keep working on.

### Create or resume

```bash
curl -X POST http://localhost:3900/api/tool-executor/workspaces \
  -H "Content-Type: application/json" \
  -d '{
    "assistant": "Event",
    "productObject": "evt-2026-001",
    "context": { "region": "us-east" }
  }'
```

Returns `{ "workspace": {...}, "resumed": false }` with `201`. Pass an existing `workspaceId` instead
of `productObject` to resume: the same call returns `200` with `"resumed": true` and merges any
`context` you send. That is the normal way to pick up an existing object.

List and filter workspaces with `GET /api/tool-executor/workspaces?assistant=Event&workflowState=draft`.

### Workflow states

The state machine is bookkeeping over executions, not a forced sequence. Every Skill of the assistant
stays available in every state.

```text
analysis → recommendation → draft → approved → executed
     ↘           ↘            ↘          ↘
                    rejected → draft
```

| State | Meaning |
|-------|---------|
| `analysis` | The resting state. Every ungated run lands here |
| `draft` | A gated run is waiting for your confirmation |
| `approved` | You confirmed the gated run |
| `executed` | The run completed successfully |
| `rejected` | Declined; can go back to `draft` |
| `recommendation` | A manual marker for an advisory result awaiting review. The runtime never sets it on its own |

Read the current state and its legal next states:

```bash
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/allowed-transitions
```

Move it explicitly if you need to:

```bash
curl -X POST http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/transition \
  -H "Content-Type: application/json" \
  -d '{"state": "approved"}'
```

An illegal move returns `400 Invalid workflow state transition to <state>`. You can also set a state
directly with `POST /api/tool-executor/workspaces/WORKSPACE_ID/state`.

### History, revisions, and next actions

```bash
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/history
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/execution-summary
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/state-history
curl http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/next-actions
```

The history response carries three ledgers: `approvals`, `executions`, and `revisions`. Approval entries
record the actor, the state, and a timestamp; execution entries record the tool, the status, and the
start and completion times; revisions record what changed and when. Together they reconstruct who did
what, in which order.

### Reset, update, delete

```bash
# Roll the workspace back to a clean state, keeping the object binding
curl -X POST http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID/reset -d '{}' \
  -H "Content-Type: application/json"

# Update context or runtime inputs
curl -X PATCH http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID \
  -H "Content-Type: application/json" \
  -d '{"runtimeInputs": { "attendees": 400 }}'

# Remove it entirely
curl -X DELETE http://localhost:3900/api/tool-executor/workspaces/WORKSPACE_ID
```

## Configuration, secrets, and data

### Skill settings

Each Skill may declare a `configSchema`. Values come from two places, merged at run time: the
defaults in the schema, then whatever is persisted for the workspace. Set them through the Settings
page in the UI, or by writing to the skill store.

### Secrets

Any configuration property flagged `isSecret: true` is stored in the Vault service, never as plain
configuration. If a required credential is absent, the run stops at `428` and tells you exactly which
keys it needs.

### Collection-referencing inputs

Inputs declared as `format: reference` with an `x-referenceSource` are populated from persisted
collections instead of being typed. The dropdown data comes from:

```bash
curl "http://localhost:3900/api/tool-executor/tools/reference-data/event-vendors"
```

The response is `{ "success": true, "data": { "listings": [...], "source": "event-vendors" } }`.
A `?filter=type=resume` query narrows the list. This endpoint is rate limited to 100 requests per 15
minutes.

### Skill data store

Skills persist their own state through the skill store API — the same surface the sandboxed skill
processes use:

```bash
curl -X POST http://localhost:3900/api/skill-store/plans/event_123 \
  -H "Content-Type: application/json" \
  -d '{"eventName": "Annual Conference 2026", "budgetTotal": 120000}'

curl http://localhost:3900/api/skill-store/plans
curl http://localhost:3900/api/skill-store/plans/event_123
curl -X DELETE http://localhost:3900/api/skill-store/plans/event_123
```

Writes go to the artifacts service first and fall back to a local file if it is unavailable, so skill
execution does not hard-depend on persistence being up. The write response includes `persisted`, which
tells you whether the remote copy succeeded.

### Schema evolution

Records are stamped with `_schemaVersion` and `_updatedAt` on write. On read, older documents are
upgraded in memory by chained hydration adapters before the handler sees them, so blueprints can be
redeployed without a migration script.

## Triggers

A Skill declares how it can be invoked:

- **user** — you press its Action Button or phrase it in chat. This is how most Skills run.
- **schedule** — a cron expression, with an optional default input. The scheduler runs it.
- **event** — fires when another Skill announces a matching event.

### Scheduled runs

The tool-executor holds the only scheduler. It checks every `schedule` trigger once a minute and
fires the ones that are due through the same executor a button press uses.

**A schedule is never an authorisation.** The scheduler never sends `confirmation: true`. A gated
Skill run on a schedule stops exactly as a manual run does, and leaves a `draft` approval on its
workspace for you to confirm. A recurring trigger does not get progressively more approved.

### Creating a schedule

Ask in chat, or create one directly:

```bash
curl -X POST http://localhost:3900/api/tool-executor/triggers \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "event-planning-budgeting",
    "assistantId": "event",
    "cron": "0 9 * * 1",
    "input": { "task": "plan", "eventName": "Annual Conference 2026" },
    "origin": "chat"
  }'
```

The record is persisted, so the schedule survives a restart.

### What is scheduled, and when

```bash
curl http://localhost:3900/api/tool-executor/triggers
```

Every schedule is listed with its cron, its next and last fire, and whether the next one needs your
confirmation. Anything that could not be scheduled is listed separately under `issues`, with the cron
expression to write instead. A declared trigger with neither a schedule nor a finding is a
declaration nothing is honouring — this listing is how you tell the difference.

A Skill may declare a `cadence` shorthand instead of a cron. Only the forms with exactly one
interpretation are honoured — `hourly`, and intervals like `Every 15 minutes`. Named periods such as
`daily` or `weekly` do not say *when*, and a qualified cadence such as `during configured windows` is
conditional, so both are reported rather than guessed. Guessing "every 5 minutes" onto a run that was
meant to be held back would be worse than not scheduling it.

```bash
curl http://localhost:3900/api/tool-executor/triggers/runs     # recent scheduled runs
curl http://localhost:3900/api/tool-executor/triggers/records  # the adaptations you created
```

Pause and resume an adaptation without losing its configuration:

```bash
curl -X PATCH http://localhost:3900/api/tool-executor/triggers/records/RECORD_ID \
  -H "Content-Type: application/json" -d '{"enabled": false}'

curl -X DELETE http://localhost:3900/api/tool-executor/triggers/records/RECORD_ID
```

If the scheduler itself is paused, `POST /api/tool-executor/triggers/resume` restarts it; a stopped
scheduler does not silently stay stopped.

### Events

Every Skill run announces an event, and what it announces depends on how the run went:

| Outcome | Id announced | Meaning |
|---|---|---|
| Changed something | one event per change, e.g. `hotel.housekeeping.task_created` | This specific thing changed |
| Ran, changed nothing | `<assistantId>.<skillId>.completed` | This run finished |
| Broke | `<assistantId>.<skillId>.failed` | Attempted and did not succeed |
| Never started | `<assistantId>.<skillId>.aborted` | Stopped before running |

A Skill that changes several things announces several events — one per change, not one per run. The
housekeeping manager creates, updates, assigns, or dispatches, and announces only the one it did, so
nothing watching for a dispatch is woken by a create. All events from one run share an execution id,
so you can see they came from the same run.

So a Skill that sends an email announces `marketing.email.sent` if it succeeded, and
`marketing.email-sender.failed` if the send broke — never `marketing.email.sent`, because the message
was not sent. **A failure is never announced under the id of the change it failed to make.**

A **dry run announces nothing that did not happen.** A staged report, a preview, a staged dispatch:
the run reports that it finished (`<assistantId>.<skillId>.completed`) and says nothing about the
change it deliberately did not make. So `finance.report.published` appears only once a report was
actually delivered, not while it is still sitting in a preview.

`aborted` is deliberately distinct from `failed`. A run waiting on your confirmation, missing
credentials, or lacking configuration never attempted anything. Downstream Skills can retry a failure;
retrying an abort just re-asks a human for something they have not given yet.

#### Where an event id comes from

An id is picked from whichever of two sources can actually see the change.

**You declared it** — `manifest: { emitEvent: 'career.application.created' }`. This is the only option
for an effect that leaves the process. An email Skill sends a request and returns; nothing inside
stage7 ever holds the message that was sent, so no amount of instrumentation could discover it. Every
curated id in the catalogue is of this kind, and declaring one is how you choose the wording a
subscriber matches on.

**It was derived from what the run wrote** — for Skills that declared nothing. `ctx.store.save` and
`ctx.store.delete` are the only paths to instance data, so a write is a place where the change is
already known rather than guessed. A Skill that updates five records announces five events; one that
deletes a record announces a deletion, which no hand-written declaration can capture accurately.

Ids are derived by convention as `<assistantId>.<collection>.<operation>`, giving
`career.ticket.updated` or `support.ticket.created`. The create/update distinction comes from whether
the record already existed.

**A declared id wins.** If a Skill declared an id, that id is authoritative for its run and the
derived ids are suppressed — so curating an id can never leave you with two ids announcing one change.
This is what lets both mechanisms coexist: the 41 Skills whose effects are invisible declare, and the
36 that only write instance data are covered automatically.

Two consequences worth knowing:

- **You do not need to declare an id to have your writes announced.** Asking an author to remember an
  id for a change the runtime already observed is how 36 Skills ended up changing data that reached
  nobody.
- **Key names reach subscribers, so name them for what they hold.** Six Skills store domain records
  under misleading names — `ctx.store.save('outPath', template)`, `'profilePath', profile`. Those are
  mapped in `COLLECTION_NOUNS` (`src/adk/events.ts`) to `career.template.created` and
  `career.profile.updated`. Add a key there to rename its events; that registry is also where a key
  that is genuinely bookkeeping (how far a run got, not what it produced) opts out of the stream.

The derived id is deterministic, so a subscriber can name it without reading the emitter's source —
the same property that makes the completion id usable.

Events reach their subscribers immediately and are also recorded, so you can see what changed:

```bash
curl http://localhost:3900/api/tool-executor/events
curl http://localhost:3900/api/tool-executor/events/by-skill/vendor-contract-management
```

Each record names the Skill, the tier, the outcome, the execution, the workspace it touched, and the
run's output. Failures and aborts also carry the reason.

### Events from outside

Most events come from another Skill. Some come from systems stage7 does not control — a badge scanner
at a door, a sportsbook odds feed, an EHR record change. Those are declared as **external contracts**:

```ts
{ kind: 'event', on: 'Room status change requiring housekeeping turnover',
  externalEvent: true, eventId: 'hotel.external.stock_level.changed' }
```

`externalEvent: true` is a claim that something outside this codebase publishes that exact id. It
makes the edge matchable where it previously matched nothing, and it makes the claim checkable —
without the flag, `adk:validate` reports the id as unresolvable, because most unmatched ids are typos
rather than real integrations.

## When something fails

Skills run behind a three-step resilience protocol before anything reaches you:

1. Deterministic retry with exponential backoff for transient failures.
2. LLM self-correction when a payload fails schema validation.
3. Chat escalation — the Assistant posts an actionable card in the chat window.

Escalation cards explain the problem in plain language and never carry a stack trace or internal path.

## Common tasks

### Plan an event

1. Open or create a workspace for the event (assistant `Event`, product object = your event id).
2. Run `event-planning-budgeting` (tier `advise`, so no confirmation):
   `task` of `plan`, `budget`, or `timeline`.
3. Review the rendered plan. Nothing was sent anywhere.
4. When you need to act on vendors, run `event-vendor-contract-management` (tier `represent`). The
   first call returns `403`; read the preview summary and re-send with `"confirmation": true`.

### Handle a support ticket

1. Create a workspace with assistant `Support` and the ticket id as the product object.
2. Run the triage Skill to categorize and prioritize.
3. Run the investigation Skill for root cause.
4. If the fix touches an external system, expect the confirmation gate on that step.
5. Confirm the audit trail at `GET /api/tool-executor/workspaces/WORKSPACE_ID/history`.

### Review an incident

1. Create a workspace with assistant `CTO` and the system or incident id.
2. Diagnose, then plan — both are advisory and run immediately.
3. The `represent`-tier remediation Skill (for example infrastructure drift repair) stops at `403`
   until you confirm.

## API reference

### Gateway

Base URL `http://localhost:3900`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gateway/health` | Gateway health |
| GET | `/api/gateway/services` | Registered services |
| GET | `/api/gateway/services/:id/health` | Upstream health (healthy/degraded/unhealthy) |
| POST | `/api/gateway/message` | Send a service message |
| POST | `/api/gateway/routes` | Register a recipient route |
| GET | `/api/gateway/routes` | List routes |
| POST | `/api/gateway/broadcast` | Broadcast to all WebSocket clients |
| POST | `/api/gateway/broadcast/mission/:missionId` | Broadcast to one mission |
| WS | `/ws` | WebSocket channel (`subscribe`, `unsubscribe`, `subscribe-all`) |
| ANY | `/api/:service/*` | Reverse proxy to the named service |

### Auth

Base URL `http://localhost:4300/api/auth`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health |
| POST | `/login` | User login → `{ success, user, token }` |
| POST | `/refresh` | Exchange a token for a new one |
| GET | `/verify` | Verify the current token |
| POST | `/service/auth` | Service account login (`serviceId` + `apiKey`) |
| GET | `/users` | List users |
| POST | `/users` | Create a user |
| POST | `/users/:id/roles` | Assign a role |

### Tool executor — tools and skills

Base URL `http://localhost:3900/api/tool-executor`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tools` | List all tools and skills |
| GET | `/tools/:id` | Get one tool, with schemas, tier, and triggers |
| POST | `/tools` | Register a tool |
| DELETE | `/tools/:id` | Unregister a tool |
| POST | `/tools/:id/execute` | Execute a skill or tool |
| POST | `/tools/execute` | Execute an inline tool payload |
| POST | `/tools/:id/preview` | Approval summary without executing |
| GET | `/tools/reference-data/:sourceId` | Options for reference inputs |
| GET | `/executions/:executionId/credential-request` | What credentials are missing |
| POST | `/executions/:executionId/credentials` | Submit credentials and resume |

### Tool executor — workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workflows` | List assistants with product object, flow, skill count |
| GET | `/workflows/:assistant` | Full skill list for one assistant |
| GET | `/workflows/:assistant/runtime` | Runtime view (`?workspaceId=` optional) |
| POST | `/workflows/:assistant/runtime` | Same, with the parameters in the body |

### Tool executor — workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/workspaces` | Create or resume (`assistant`, `productObject`, optional `workspaceId`) |
| GET | `/workspaces` | List, filter by `assistant`, `productObject`, `workflowState` |
| GET | `/workspaces/:id` | Workspace state, next actions, and the three ledgers |
| PATCH | `/workspaces/:id` | Update context or runtime inputs |
| DELETE | `/workspaces/:id` | Delete a workspace |
| GET | `/workspaces/:id/runtime` | Runtime workflow for this workspace |
| POST | `/workspaces/:id/transition` | Move to a workflow state |
| POST | `/workspaces/:id/state` | Set a workflow state directly |
| GET | `/workspaces/:id/allowed-transitions` | Legal next states |
| GET | `/workspaces/:id/state-history` | State change log |
| GET | `/workspaces/:id/next-actions` | Available actions in the current state |
| GET | `/workspaces/:id/history` | Approvals, executions, and revisions |
| GET | `/workspaces/:id/approval-summary` | Pending approval entries |
| GET | `/workspaces/:id/execution-summary` | Execution log |
| POST | `/workspaces/:id/last-result` | Link a result to the workspace |
| POST | `/workspaces/:id/reset` | Reset to a clean state |

### Tool executor — data and monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/skill-store/:collection/:key` | Read and write a skill document |
| DELETE | `/skill-store/:collection/:key` | Delete a document |
| DELETE | `/skill-store/:collection/:key/:itemId` | Delete one item from a document |
| GET | `/skill-store/:collection` | List keys in a collection |
| GET/POST | `/watches` | List and create watches |
| GET/PUT/DELETE | `/watches/:id` | Inspect, update, or remove a watch |

### Tool executor — triggers and events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/triggers` | Every schedule with its next and last fire, plus anything it could not schedule |
| GET | `/triggers/runs` | Recent scheduled runs |
| POST | `/triggers/tick` | Force a check instead of waiting for the next minute |
| POST | `/triggers/pause` / `/triggers/resume` | Stop and restart the scheduler |
| GET | `/triggers/records` | Schedules created at runtime, as opposed to declared in a Skill |
| POST | `/triggers` | Create a schedule for a Skill |
| PATCH | `/triggers/records/:id` | Enable or disable a schedule |
| DELETE | `/triggers/records/:id` | Remove a schedule |
| GET | `/events` | Recent events, newest first |
| GET | `/events/by-skill/:skillId` | Events one Skill announced |

### Worker pool

Base URL `http://localhost:3900/api/workers`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health |
| GET | `/assistants` | List registered assistants |
| GET | `/assistants/:id` | Get one assistant |
| POST | `/assistants` | Register an assistant |
| PUT | `/assistants/:id` | Update an assistant |
| DELETE | `/assistants/:id` | Unregister an assistant |
| POST | `/assistants/:id/tools/execute` | Execute a tool by name (`name`, `arguments`) |
| POST | `/assistants/:id/execute` | Execute the assistant with a prompt |
| GET | `/assistants/:id/knowledge` | Knowledge entries for one assistant |
| GET/POST | `/knowledge` | List and create knowledge entries |
| DELETE | `/knowledge/:id` | Remove a knowledge entry |
| GET | `/workers` | List workers |
| POST | `/tasks` | Submit a task |
| GET | `/tasks/:taskId` | Task status |
| GET | `/queue/size` | Queue depth |
| GET | `/config` | Pool configuration |

### Health checks

| Service | Endpoint |
|---------|----------|
| frontend | `http://localhost:8080` |
| gateway | `http://localhost:3900/api/gateway/health` |
| brain | `http://localhost:3100/api/brain/health` |
| mcp-runtime | `http://localhost:3300/api/mcp-runtime/health` |
| worker-pool | `http://localhost:3200/api/workers/health` |
| agent-runtime | `http://localhost:3400/api/agent-runtime/health` |
| tool-executor | `http://localhost:3500/api/tool-executor/health` |
| vault | `http://localhost:4000/api/vault/health` |
| temporal | `http://localhost:4100/api/temporal/health` |
| artifacts | `http://localhost:4200/api/artifacts/health` |
| auth | `http://localhost:4300/api/auth/health` |

## Troubleshooting

### Workspace not found

```json
{ "error": "Workspace not found" }
```

The id is wrong, or the workspace was deleted or reset by another container. List them with
`GET /api/tool-executor/workspaces` and check that the container holding your state is still running.

### Invalid workflow state transition

```json
{ "error": "Invalid workflow state transition to draft" }
```

Check `GET /api/tool-executor/workspaces/:id/allowed-transitions` for the legal moves from the current
state.

### Skill execution requires assistant context

```json
{ "error": "Skill execution requires assistant context (X-Assistant-Id header)" }
```

Add `-H "X-Assistant-Id: <assistant-id>"`, or put `assistantId` in the request body.

### Tool requires explicit confirmation before execution (`403`)

Expected for `represent`-tier Skills. Run with `"dryRun": true` to preview, or re-send the same
request with `"confirmation": true` to approve it.

### Credentials required (`428`)

```json
{ "error": "...", "request": { "missingCredentials": [{ "key": "token", "label": "..." }] } }
```

Fetch the full request with `GET /api/tool-executor/executions/:executionId/credential-request`, then
submit the values on the `credentials` endpoint.

### Skill validation failed (`400`)

The input does not match the declared schema. Compare your payload against
`GET /api/tool-executor/tools/:id` and check `required` fields and enum values. Reference-typed inputs
must match a value returned by `GET /api/tool-executor/tools/reference-data/:sourceId`.

### My schedule never ran

Check `GET /api/tool-executor/triggers`. If the schedule is listed, look at `nextFireAt` and
`overdue`: `overdue` means the time has passed and the run is waiting on the next tick. If it is not
listed, either the trigger could not be scheduled — a `cadence` that does not say when, or a cron
that will not parse — which the listing reports under `issues` with the expression to write, or the
Skill declares no `schedule` trigger at all.

### My scheduled run keeps asking for confirmation

That is the design, not a fault. The scheduler never confirms on your behalf, because a recurring
trigger is not a standing authorisation. Confirm the pending approval on the workspace and expect the
same prompt next period.

### Tool not found (`404`)

The Skill is not registered. Confirm the id against `GET /api/tool-executor/tools`, and check the
tool-executor logs: `docker compose logs -f tool-executor`.

### Reference data comes back empty

The source collection has no rows yet, or the artifacts service is down and only the local fallback
was consulted. Run the Skill that populates that collection first.

### Asking for help

1. Check the health endpoints above; every service reports its own status.
2. Read the logs for the service that failed: `docker compose logs -f SERVICE_NAME`.
3. Confirm your token has not expired: `GET /api/auth/verify`.
4. Validate the assistant blueprints after a code change: `npm run adk:validate`.

## Best practices

1. **Read the tier before you run.** `advise` runs freely, `represent` will stop and ask.
2. **Preview gated work first.** `POST /api/tool-executor/tools/:id/preview` shows the affected scope
   without changing anything.
3. **Prefer `dryRun` when exploring.** It is the safe option on `aid` and `represent` Skills.
4. **Keep one object per workspace.** Resume with `workspaceId` rather than creating a new workspace
   for the same event or ticket.
5. **Record context as you go.** Anything you want a later run to know belongs in the workspace
   `context` or the collection the Skill reads.
6. **Check the history before debugging.** Approvals, executions, and revisions answer most "what
   happened" questions.
7. **Store secrets through the credential flow.** Never paste a token into a workspace context.

## FAQ

**Do I have to work through an assistant's flow in order?**
No. `flow` is a description of what the assistant covers. Every Skill of the assistant is available in
every state.

**Why did my Skill call return 403?**
It is a `represent`-tier Skill. Nothing ran. Preview it, then re-send with `confirmation: true`.

**Is an approval reusable?**
No. Each execution derives its own gate, including scheduled and event-driven runs. Approval never
carries over to a later run.

**What happens when a Skill fails?**
Retry, then self-correction, then an escalation card in chat. Your workspace keeps the failed
execution in its history; fix the cause and re-run.

**Can several people work on the same object?**
Yes. A workspace is addressed by id, so anyone who can reach the service can act on it, and every run
is written to its execution history with timestamps. There is no per-workspace lock, so avoid starting
two runs against the same object at the same time.

**How do I see which Skills an assistant has?**
`GET /api/tool-executor/workflows/:assistant`, or the Tools page in the UI.

**How do I find out what a Skill needs as input?**
`GET /api/tool-executor/tools/:id` returns its `inputSchema` with field types, required fields, hints,
and any reference sources.

**Can I change a Skill's behavior?**
Not from the UI. Blueprints are immutable at runtime; changes ship as a new blueprint version. What
you can change is configuration and secrets.

---

*For developer-focused documentation, see [ADK_OVERVIEW.md](./ADK_OVERVIEW.md) for the architecture,
[ADK_DEVELOPER_GUIDE.md](./ADK_DEVELOPER_GUIDE.md) for building Skills and assistants, and
[TOOL-DEVELOPMENT.md](./TOOL-DEVELOPMENT.md) for lower-order tools.*
