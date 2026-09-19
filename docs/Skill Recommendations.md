# Assistant Skill Recommendations

**Scope:** 21 user-facing assistants and their higher-order skills, grounded in `docs/assistants design 0915-3.md`, `docs/skill-design-framework.md`, and the live TypeScript under `services/tool-executor/src/data/skills/`.

**Evidence basis:** The registry is a flat `Map<string, Tool>` in `services/tool-executor/src/services/ToolRegistry.ts`; there is no trustworthy single current skill count. 22 assistant source directories exist under `services/tool-executor/src/data/skills/` (excluding `shared/` and standalone files). Canonical arrays currently exist for CTO, Healthcare, Restaurant, Career, and HR; other assistants expose domain arrays. All claims below are traceable to the source-reference appendix.

---

## Executive Summary

This document replaces all prior baselines and stale claims. The following numbers from earlier drafts are **removed and not reused**: 249 total skills, 150+ copy-paste wrappers, 28 stub skills, 99.2% input-description coverage, 0.8% configSchema coverage, and any per-assistant skill count derived from those.

**Confirmed issues (code-grounded):**

1. **Declared-only trigger metadata.** `SkillTrigger[]` declarations exist (86 user, 90 schedule, 125 event, 21 data across the registry per audit), and `triggerMetadata.ts:23-64` validates them, but there is no scheduler, event bus, or runtime trigger consumer. Trigger metadata is **declared but not executed**.
2. **Honest fallback not uniformly enforced.** `createExternalActionSkill` at `code-skill-factory.ts:284-293` correctly returns `success: false, mode: 'not-connected'` when the endpoint is missing, and `ToolExecutor.ts:283-291` enforces `confirmBeforeSend`. However, three Finance Code Skills (`reporting-data-ops`, `risk-regulatory-advisory`, `budget-tracking`) — which use `createCodeSkill` with inline source code, not `createExternalActionSkill` — return `success: true` with `mode: 'dry-run'` and null output when their env-var endpoints are unconfigured, violating the honest-not-connected contract principle.
3. **Trigger-addition tooling uses wrong shape.** `add_legal_triggers.py` (line 70: `lines = ['  triggers: {']`), `add_marketing_triggers.py` (line 64: `lines = ['  triggers: {']`), and `add_product_triggers.py` (line 58: `lines = ['  triggers: {']`) emit `triggers: { ... }` (object keyed by kind) instead of `triggers: SkillTrigger[]` (array). `add_triggers.py`, `add_analytics_triggers.py`, and `add_creative_triggers.py` use the correct array shape. This is a tooling/validation bug, not a reason to remove skills.
4. **Default/filler outputs instead of honest empty.** Marketing `performance-audience-insight.ts` returns zero-count summaries and empty arrays (lines 31-32, 41-46, 52-57, 63-68) instead of labeling data absence; Executive `executive-risk-scenario.ts:23` assigns random risk scores via `Math.floor(Math.random() * 9) + 1` instead of deriving from input; Product `product-analytics-insight.ts:18` defaults cohort retention to 60% of cohort size when `retained` is null instead of labeling the estimate as provisional.
5. **Cross-skill state mostly proposed.** Formal shared-state contracts are mostly proposed, not wired. Ad-hoc `__execute_tool` chaining exists in Career, Content, CTO, Restaurant, Healthcare, Creative, and Product, but no formal artifact/state registry exists. Sports Group A and Group B are already isolated via separate `SPORTS_GROUP_A_HOME` and `SPORTS_GROUP_B_HOME` paths and must remain isolated.
6. **Internal IDs in schemas.** Fields such as `operation`, `provider`, `endpointUrl`, `dryRun`, and confirmation flags appear in user-facing input schemas. `resumeId` is **not present** in current schemas; `patientId`, `eventId`, `contractType`, and many other `*Id` fields remain and should be hidden behind friendly selectors/context resolution where derivable.

**No-skill-elimination statement:** No skill, lower-order tool, or assistant capability is recommended for removal, collapse, or deletion. All existing capabilities are preserved. Recommendations focus on routing, normalization, state wiring, trigger execution, and UI presentation around canonical and higher-order skills.

---

## Current Code Baseline

| Capability | Status | Evidence |
| --- | --- | --- |
| `SkillTrigger[]` type definition | Implemented | `types/index.ts:50-54` |
| Trigger declaration validation | Implemented | `utils/triggerMetadata.ts:23-64` |
| Trigger summary export | Implemented | `utils/triggerMetadata.ts:71-103` |
| Trigger execution at runtime | Absent | No scheduler, event bus, or consumer found in source |
| Honest not-connected contract (`createExternalActionSkill`) | Implemented | `code-skill-factory.ts:284-293` |
| `confirmBeforeSend` enforcement | Implemented | `ToolExecutor.ts:283-291` |
| Config schema validation | Implemented | `ToolExecutor.ts:424-448` |
| Finance honest-not-connected fallback | Needs fix | 3 Code Skills return `success:true` dry-run instead of `not-connected` |
| Finance honest-not-connected fallback | Needs fix | 3 Code Skills return `success:true` dry-run instead of `not-connected` |
| Sports Group A/B isolation | Implemented | `SPORTS_GROUP_A_HOME` / `SPORTS_GROUP_B_HOME` in source |
| HR scoring | Needs improvement | Candidate screening uses keyword overlap; weak but no longer zero-for-all |
| Support resolve-ticket | Needs fix | `ticket-understanding.ts:34` leaves resolution empty |
| Analytics warehouse query | Implemented | Real query execution against configured endpoints |
| Education Learner Insight configSchema | Implemented | `education/learner-insight.ts` has configSchema |
| Creative trend planning configSchema | Implemented | Has configSchema |
| Event external skills configSchema | Implemented | `event/index.ts` has schemas |
| Canonical arrays | Implemented | CTO, Healthcare, Restaurant, Career, HR |
| Formal shared-state registry | Absent | Proposed in assessments, not wired in code |

---

## Corrected Cross-Cutting Recommendations

1. **Triggers are declared, not executed.** Do not state that triggers are absent. State that trigger metadata is validated but no runtime consumer dispatches it. The fix is wiring a scheduler/event bus/consumer, not adding declarations.
2. **Trigger-addition scripts need schema validation.** The Python scripts that add triggers to assistant index files use two shapes: array (`triggers: [...]`, correct) and object (`triggers: { ... }`, wrong). `add_triggers.py`, `add_analytics_triggers.py`, ``add_product_triggers.py`, `add_creative_triggers.py` use the correct array shape. `add_legal_triggers.py` and `add_marketing_triggers.py` use the wrong object shape. All scripts should validate output against `SkillTrigger[]` before writing.
3. **Every external/hybrid skill must have an honest not-connected fallback.** `createExternalActionSkill` already does this. Code skills that currently return `success: true` with dry-run output when unconfigured must be fixed to return `mode: 'missing-configuration,not-connected'`.
4. **Internal API fields must be represented in UI as intent labels.** `operation` → action verb ("Book", "View"); `provider` → connected-service selector; `endpointUrl` → "Connect [Service]"; `dryRun` → "Preview only"; `confirmation` → "Approve & send". Retain internal fields for API use but hide them behind friendly selectors where derivable.
5. **Sports isolation is already correct.** Do not merge Group A (Performance/Coaches/Analysts) and Group B (Wagering/Users) data stores. `SPORTS_GROUP_A_HOME` and `SPORTS_GROUP_B_HOME` enforce this; preserve it.
6. **No `resumeId` in schemas.** Career derives resume context from the active profile/resume record, not from an ID field. Any future schema adding a resume reference must hide it behind a friendly profile selector.
7. **Canonical arrays are the reference.** Career, CTO, Healthcare, Restaurant, and HR have canonical skill arrays. Other assistants expose domain arrays. The canonical arrays should be the authoritative listing for their domains; domain arrays in other assistants are the equivalent.

---

## Trigger Recommendations

### Definitions (per `SkillTrigger[]` at `types/index.ts:50-54`)

| Type | Schema | Runtime status |
| --- | --- | --- |
| `user` | `{ kind: 'user', phrase_examples: string[] }` | Declared; no runtime consumer |
| `schedule` | `{ kind: 'schedule', cadence: string }` | Declared; no runtime consumer |
| `event` | `{ kind: 'event', on: string }` | Declared; no runtime consumer |
| `data` | `{ kind: 'data', condition: string }` | Declared; no runtime consumer |

`triggerMetadata.ts:23-64` validates that each trigger has its required field. `triggerMetadata.ts:71-103` exports summaries for display.

### Current Runtime Distinction

- **Declared triggers:** 86 user, 90 schedule, 125 event, 21 data (per repository audit). These exist in source files as `triggers: SkillTrigger[]` on individual `Tool` objects.
- **Execution triggers:** None. There is no scheduler, event bus, or runtime trigger consumer in the source. Triggers are metadata only.
- **Correct framing:** Trigger metadata is declared but execution is absent. Do not say all trigger types are absent; some are declared but none are executed.

### Tooling Fix Needed

Three trigger-addition scripts use the wrong object shape (`triggers: { kind1: [...], kind2: [...] }`) instead of `triggers: SkillTrigger[]` (array):

- `add_legal_triggers.py` (line 70: `lines = ['  triggers: {']`)
- `add_marketing_triggers.py` (line 64: `lines = ['  triggers: {']`)
- `add_product_triggers.py` (line 58: `lines = ['  triggers: {']`)

These should be corrected to emit arrays matching the `SkillTrigger[]` type. This is a tooling/validation fix; skills remain.

### Per-Assistant Trigger Priority Table

| Assistant | Current Trigger State | Next Fix |
| --- | --- | --- |
| Career | User + scheduled digests declared; no executor | Wire a daily digest consumer for job discovery; confirm execution policy before firing any auto-apply trigger |
| CTO | User + scheduled + event declared (CTO file); triggers added via `add_triggers.py` (correct array shape) | Build a weekly health digest consumer; ensure no trigger bypasses `confirmBeforeSend` gates |
| Executive | User + scheduled + event + data declared across 6 skills | Wire scheduled strategy-review and calendar-sync consumers; all non-user triggers create drafts only |
| Legal | User + scheduled + event + data declared (10 skills via `add_legal_triggers.py` — wrong shape) | Fix script to emit `SkillTrigger[]`; build compliance-digest and renewal reminder consumers |
| Sales | Data-driven triggers declared (lead score, deal stage) | Wire pipeline-digest consumer; ensure threshold triggers create review items, not auto-actions |
| Event | Scheduled + data-driven declared (budget, vendor, day-of) | Wire vendor-payment and RSVP-deadline consumers; all produce drafts/alerts |
| Restaurant | Scheduled + data-driven declared (prep list, inventory, surge) | Wire morning prep-list consumer; inventory reorder triggers must route through manager approval |
| Content | User + scheduled + event declared | Wire weekly editorial-digest and draft-completion consumers |
| Songwriter | User-driven (real-time session); trend scan proposed | Build weekly trend-scan consumer; creative session triggers remain user-initiated |
| Scriptwriter | User-driven (real-time session); genre/market proposed | Build genre-positioning consumer; script session triggers remain user-initiated |
| Sports | User + scheduled + event declared (Tactical Evaluator, Bankroll Co-Pilot, Line Alert) | Wire pre-match tactical, pre-bet risk, and line-movement consumers; maintain Group A/B isolation |
| Finance | User + scheduled + event + data declared (3 code skills) | Wire monthly close digest and cash-burn alert consumers; fix honest fallback first |
| Investment | Scheduled + data-driven declared (net worth, drift) | Wire monthly net-worth audit and drift-alert consumers |
| Healthcare | Scheduled + event + data declared (patient list, intake, at-risk) | Wire daily patient-list and intake-form consumers; at-risk data triggers must route through clinical review |
| Hotel | Scheduled + event declared (shift report, yield, room issues) | Wire morning shift report and yield audit consumers |
| Education | User + scheduled + event + data declared (Learner Insight, Adaptive, Lesson) | Wire weekly progress rollup and assignment-submission consumers |
| Support | Event + data-driven declared (ticket, CSAT, churn) | Wire inbound-ticket and CSAT consumers; churn thresholds create review items |
| HR | User + scheduled + event + data declared (3 skills) | Wire weekly pipeline and application-received consumers |
| Product | User + scheduled + data-driven declared (roadmap, requests); trigger script uses wrong shape | Wire weekly milestone digest and request-volume consumers; fix `add_product_triggers.py` to emit `SkillTrigger[]` |
| Marketing | User + scheduled + event + data declared (via `add_marketing_triggers.py` — wrong shape) | Fix script to emit `SkillTrigger[]`; wire campaign-performance and CAC-spike consumers |
| Analytics | User + scheduled + event + data declared | Wire daily metrics digest and anomaly consumers; warehouse query remains user-initiated |

---

## Cross-Skill Integration Recommendations

### Current State

Formal shared-state contracts are mostly proposed, not wired. Ad-hoc `__execute_tool` chaining exists in Career, Content, CTO, Restaurant, Healthcare, Creative, and Product. No formal artifact/state registry exists. Sports Group A and Group B are already isolated by separate paths and must remain so.

### Concrete Artifact Contracts (Proposed, Not Implemented)

| Assistant | Shared State Keys | Proposed Ownership | Proposed Source/Output Flow | Proposed Fallback |
| --- | --- | --- | --- | --- |
| Career | `career.profile`, `career.resume`, `career.jobs[]`, `career.applications[]`, `career.outcomes[]` | Career Profile & Resume Intake skill | A → B → C → G pipeline; C feeds G tracking data | Reasoning-only from stored resume when no connector |
| Education | `education.learners[learnerId]`, `education.courseware[]` | Learner Insight → Adaptive Personalization | B (Learner Insight) → C (Adaptive Personalization); A uses learner profile | Local differentiation when LMS unconnected |
| Healthcare | `healthcare.patients[patientId]`, `healthcare.carePlans[]` | Medical Records → Risk → Care Plan | B (Records) → H (Risk), D (Care Plan); C (Communication) uses records | Care plan from intake data when EHR unconnected |
| Restaurant | `restaurant.inventory[]`, `restaurant.reservations[]`, `restaurant.recipes[]` | Inventory → Kitchen → Financials | A (POS) → inventory → C (Kitchen); E (Financials) aggregates | Local forecasts when POS unconnected |
| Hotel | `hotel.reservations[]`, `hotel.guests[]`, `hotel.rooms[]` | Reservation Lifecycle → Operations | A (Reservations) → E (Operations); B/C/D derive from A | Manual recommendations when PMS unconnected |
| Sales | `sales.opportunities[]`, `sales.leads[]`, `sales.forecasts[]` | CRM Sync → Lead Intel → Forecast | C (CRM) → A (Leads) → B (Forecast); E/F log to CRM | Local scoring when CRM unconnected |
| Support | `support.tickets[]`, `support.customers[]`, `support.kb[]` | Ticket → Sentiment → CRM → Escalation | A (Resolution) ← C (CRM), B (Sentiment) analyzes A, D (Escalation) triggered by B | Draft responses from local KB when CRM unconnected |
| Marketing | `marketing.campaigns[]`, `marketing.audience[]`, `marketing.performance[]` | Strategy → Content → Execute → Measure | A (Strategy) → B (Content) → C (Publish) → E (Analytics) → feedback to A | Reasoning-only performance when ad connectors unconnected |
| Product | `product.context`, `product.roadmap[]`, `product.delivery[]` | Evidence → Roadmap → Delivery → Stakeholder | C (Evidence) → B (Roadmap) → D (Delivery); E (Stakeholder) syncs | Local prioritization when Jira/Confluence unconnected |
| Executive | `executive.goals[]`, `executive.assessments[]`, `executive.feedback[]` | Strategy → 360 → Development → Communication | A (Strategy) → B (360) → C (Development); D uses B feedback | Built-in frameworks when analyzers unconnected |
| Finance | `finance.assumptions`, `finance.models[]` | Modeling → Reporting → Budget | Shared assumptions feed all three; outputs to reports | Local modeling with disclaimers when ERP unconnected |
| Investment | `investment.holdings[]`, `investment.plans[]` | Portfolio → Risk → Life Events | Holdings feed Risk and Life Event Simulator | Algorithmic analysis from user data when APIs unconnected |
| Sports | `sports.performance[]` (Group A), `sports.bankroll[]`, `sports.alerts[]` (Group B) | Performance → Wagering (isolated) | Group A: performance analysis with metrics/odds feeds; Group B: bankroll/line monitoring; **no shared data stores** | Local analysis when APIs unconnected; maintain GROUP_A/GROUP_B isolation |
| Legal | `legal.matters[]`, `legal.contracts[]`, `legal.clauses[]` | Contract → Research → Compliance → Matters | A (Contract) and B (Research) feed D (Matters); C (Compliance) cross-checks | Local analysis when DMS unconnected |
| CTO | `cto.infra[]`, `cto.incidents[]`, `cto.teamMetrics[]` | Architecture → Infra → Observability → Incidents | A (Architecture) feeds B/C; D (Incident) synthesizes from B/C | Recommendations from requirement text when APIs unconnected |
| Analytics | `analytics.metrics[]`, `analytics.warehouseConfig` | Insight Report → Warehouse Query | B (Insight) uses local metrics; C (Warehouse Query) proposed hybrid | Local metrics store when warehouse unconnected |
| Creative | `creative.drafts[]` (shared Songwriter+Scriptwriter) | Drafting → Revision | Shared store disambiguated by format | Local drafting when no external connector |
| Event | `event.spec`, `event.budget`, `event.plan` | Planning → Vendor → Day-of | A (Planning) → B (Vendor) → C/D (Day-of) | Local plan when ticketing unconnected |
| HR | `hr.candidates[]`, `hr.jobs[]`, `hr.interviews[]` | Sourcing → Screening → Scheduling → Communication | A (Sourcing) → C (Screening) → B (Interview) → C (Communication) | Local scoring when ATS unconnected |

### Sports Isolation Requirement

Sports Group A (Performance: Tactical Evaluator, Battlecard, Scouting Alert) and Group B (Wagering: Bankroll Co-Pilot, Line Alert, Matchup Odds) share no data stores. Group A uses `SPORTS_GROUP_A_HOME` (default `/tmp/sports/group-a`); Group B uses `SPORTS_GROUP_B_HOME` (default `/tmp/sports/group-b`). No cross-feeding is permitted. The Line Alert Dispatcher is structurally barred from placing wagers or accessing sportsbook accounts. This isolation is already enforced in source and must be preserved in any integration work.

---

## Human-Language / UI Recommendations

### Mapping Table

| Internal Field | Current Schema Exposure | User-Facing Intent Label | Implementation |
| --- | --- | --- | --- |
| `operation` (`create`/`read`/`update`/`delete`) | Visible in all external-action input schemas | "Book", "View", "Modify", "Cancel", "Draft" | Map operation to action verb; hide CRUD verbs |
| `provider` (enum string) | Visible in all external-action schemas | "Reservation platform", "CRM", "ATS" | Dropdown with friendly names; map to internal IDs |
| `endpointUrl` / `baseUrl` / `apiKey` | Visible in configSchema | "Connect [Service Name]" | Config wizard per domain, not per skill |
| `resumeId` | Not present in current schemas | N/A | Profile/resume selected from active context |
| `patientId`, `eventId`, `contractType`, `ticketId`, `learnerId`, etc. | Present in many schemas | "Select patient", "Select event", etc. | Friendly selectors; derive from stored context where possible |
| `dryRun` (boolean) | Visible in many schemas | "Preview only" / "Send for real" | Toggle with clear label; default to preview |
| `confirmation` (boolean) | Visible in some schemas | "Approve & send" | Checkbox or modal confirmation |
| `mode` (output: dry-run/live/error) | Returned by skills | "Preview mode — not sent" | Consistent UI banner component |
| `success: true, data: {}` | Returned by stub skills | "No data source connected" | Honest not-connected message; mandatory per framework |

### Per-Assistant Examples

| Assistant | Example Internal Field | Proposed UI Label |
| --- | --- | --- |
| Career | `operation: 'apply'` | "Apply to this job" (with preview) |
| CTO | `provider: 'datadog'` | "Datadog" (in "Select monitoring provider") |
| Restaurant | `operation: 'reserve'` | "Book this table" (with preview) |
| Healthcare | `patientId` | "Select patient" (from active patient list) |
| Hotel | `operation: 'create-reservation'` | "Reserve room" (with preview) |
| Support | `ticketId` | "Select ticket" (from inbox) |
| Education | `learnerId` | "Select learner" (from roster) |
| Event | `eventId` | "Select event" (from event calendar) |
| Finance | `operation: 'report'` | "Generate report" (with preview) |
| Sports (Group B) | `action: 'assess'` | "Assess this wager" (with bankroll check) |

---

## Assistant-Derived Input and Behavior Recommendations

### Fields/Behaviors the Assistant Should Derive

| Category | Derivable From | Examples |
| --- | --- | --- |
| Active profile context | Stored resume, profile preferences | Target roles, keywords, salary floor, location preferences |
| Ranked jobs | Profile + connected job boards | Job fit scores, rankings, match rationales |
| Patient/learner/guest context | Stored records, connected LMS/PMS | Learning style, performance, guest preferences, reservation details |
| Configured connectors | `configSchema` + credential store | Provider selection, endpoint resolution, auth |
| Current calendar/event | Connected calendar, event spec | Time allocation, event parameters, attendee lists |
| Prior skill outputs | Shared state artifacts | Pipeline data, draft history, risk registers, adaptation records |

### Fields That Must Remain User-Controlled

| Category | Examples | Rationale |
| --- | --- | --- |
| Target selection | Which jobs to apply to, which patients to prioritize, which deals to pursue | Personal decision with consequences |
| Thresholds | Fit-score cutoff, budget variance limit, churn threshold | Risk tolerance is personal |
| Exclusions | Company blacklist, excluded sources, disallowed treatments | Values-based preference |
| Approvals | Confirm-before-send on every external write, Tier 4 sub-spec re-approval | User must authorize actions |
| High-risk choices | Bid amounts, contract terms, medical decisions, investment amounts | Irreversible or financial consequences |
| Target/role parameters in external actions | `entity`, `opponent`, `entityId`, `tournament` | User specifies what to act on |

---

## Connector Fallback, Confirmation, and Tier 4 Governance Recommendations

### Connector Fallback (Honest Not-Connected Contract)

Every external/hybrid skill must, when unconfigured:

1. Return `mode: 'not-connected'` and `success: false` (per `createExternalActionSkill` at `code-skill-factory.ts:284-293`).
2. State plainly that the connector is unconfigured.
3. Offer a locally-derived alternative or reasoning-only fallback.
4. Never fabricate data or return `success: true` with empty output as if it were a real answer.

**Skills needing this fix:** Finance Code Skills `reporting-data-ops`, `risk-regulatory-advisory`, `budget-tracking` (using `createCodeSkill`, not `createExternalActionSkill`) currently return `success: true` with `mode: 'dry-run'` and null output; they must return `mode: 'not-connected'` per the honest-not-connected contract principle.

### Confirmation Gates

| Gate | Enforcement | Evidence |
| --- | --- | --- |
| Tier 1 (Read/Query) | No confirmation; show source freshness | Advisory skills |
| Tier 2 (Draft/Prepare) | Implicit (user reviews before action) | Aid skills |
| Tier 3 (Confirm-Before-Send) | Explicit per-action confirmation | `ToolExecutor.ts:283-291` enforces via `confirmBeforeSend` + `dryRun`/`confirmation` input |
| Tier 4 (Ongoing Delegated) | Sub-spec required: pause conditions, kill switch, re-approval cadence, audit log | Proposed; not yet implemented in any skill |

### Tier 4 Governance

No skill currently implements Tier 4 sub-specs. When Tier 4 is approved for an assistant (e.g., Career auto-apply above threshold, Sales outreach sequences, Marketing publish queue, Support follow-up cadences, Sports responsible-gambling monitoring, Executive calendar sync), each must declare:

- `pauseConditions`: e.g., error rate threshold, user reply, manual pause
- `killSwitch`: immediate stop on user command
- `reapprovalCadence`: e.g., weekly
- `auditLog`: every action logged with timestamp, actor, outcome
- `maxActionsPerCycle`: finite limit
- `escalationPath`: notify user on pause or error

Scheduled, event-driven, and data-driven triggers must never bypass these gates.

---

## Code-Grounded Correctness Fixes

### Finance Skills — Honest Fallback

All three Finance code skills return `success: true` with `mode: 'dry-run'` and null outputs when unconfigured. Per the honest-not-connected contract, they should return `success: false, mode: 'not-connected'`:

| File | Current Behavior (lines) | Fix |
| --- | --- | --- |
| `finance/reporting-data-ops.ts` | Line 102: `{ success: true, operation, mode: 'dry-run', report: null, ... }` | Return `{ success: false, mode: 'not-connected', error: 'Not connected: ...' }` |
| `finance/risk-regulatory-advisory.ts` | Line 91: `{ success: true, operation, mode: 'dry-run', riskAssessment: null, ... }` | Return `{ success: false, mode: 'not-connected', error: 'Not connected: ...' }` |
| `finance/budget-tracking.ts` | Line 93: `{ success: true, operation, mode: 'dry-run', budgetStatus: null, ... }` | Return `{ success: false, mode: 'not-connected', error: 'Not connected: ...' }` |

### Marketing — Zero/Empty Default Outputs Instead of Honest Data Absence

`marketing/performance-audience-insight.ts` returns zero-count summaries and empty arrays in analysis output instead of labeling data absence. The skill does persist records to a local store, but the analysis structures themselves contain no data when the store is empty:

| Line(s) | Issue | Fix |
| --- | --- | --- |
| 31-32 | `summary: { impressions: 0, clicks: 0, conversions: 0, roi: 0 }` | Populate from actual data or return `not-connected` |
| 41-46 | `segments: [], demographics: {}, behaviors: [], preferences: {}` | Populate from actual data or return `not-connected` |
| 52-57 | `rankings: [], organicTraffic: 0, technicalScore: 0` | Populate from actual data or return `not-connected` |
| 63-68 | `trends: [], competitors: [], customerSignals: [], growthScore: 0` | Populate from actual data or return `not-connected` |

### Executive — Random Risk Scores

`executive/executive-risk-scenario.ts:23` assigns `score: Math.floor(Math.random() * 9) + 1` to risks. Risk scores must be derived from input data (likelihood × impact) or explicitly labeled as unestimated, never randomly generated.

### Product — Default Retention Estimate Instead of Honest Data Absence

`product/product-analytics-insight.ts:18` fabricates retention: `d.retained != null ? d.retained : size * 0.6`. When input data is absent or incomplete, return `mode: 'not-connected'` or explicitly label estimates as provisional with data-source caveats.

### HR — Trigger Script Shape and Scoring

`hr/index.ts` uses correct `triggers: SkillTrigger[]` array shape (lines 313-327). No trigger-shape fix needed. HR scoring (candidate-screening) uses keyword overlap scoring — weak but no longer zero-for-all; consider improving matching granularity as a non-blocking enhancement.

### Support — Schema Consistency and Resolve-Ticket Gap

`support/ticket-ops.ts` uses `operation` as an internal selector (line 28: `operation: SchemaProps.select(['crm', 'escalation', 'follow-up'])`). Map to friendly action labels in UI ("Sync CRM", "Escalate", "Schedule follow-up"). The `confirmBeforeSend` flag is properly set at line 66. `support/ticket-understanding.ts` leaves `resolution` empty at line 34 (`resolution: ''`) when resolving a ticket — the output should either populate resolution from a resolution input or surface a clear "no resolution provided" indicator rather than emitting an empty field. KB search at `ticket-understanding.ts:39-43` uses substring matching (`.includes()`); do not claim it always returns `[]`.

### Education — Adaptive Personalization Input

`education/adaptive-personalization.ts:19` accepts `insightData` as a manually pasted input. When Learner Insight is connected, this should flow automatically from Learner Insight output rather than requiring manual copy-paste. The `insightData` parameter should be hidden behind a "Use latest Learner Insight" selector when available. Education Learner Insight (`education/learner-insight.ts:32-81`) has `configSchema` with required fields. Creative trend planning has `configSchema`. Event external skills (`event/index.ts`) also have schemas — do not blanket-claim these lack configSchema.

### Career — Gmail Sync Config Schema

`career-canonical-extended.ts:15-23` defines `CAREER_GMAIL_SYNC_CONFIG_SCHEMA` with internal field names (`endpointUrl`, `apiKey`, `accountId`). These should map to user-friendly labels ("Gmail API endpoint", "Gmail API key", "Gmail account") in the UI while retaining internal names for code. Note: this is the only `CAREER_HOME` config schema issue; it is limited to the Gmail sync tool, not 9+ categories.

### Legal, Marketing, and Product Trigger Scripts

`add_legal_triggers.py` (line 70), `add_marketing_triggers.py` (line 64), and `add_product_triggers.py` (line 58) emit `triggers: { ... }` (object keyed by kind) instead of `triggers: SkillTrigger[]` (array). Fix these scripts to emit the correct array shape and add pre-commit validation against the `SkillTrigger[]` type. Any triggers injected by these scripts into assistant index files would be syntactically invalid TypeScript.

### Analytics — Warehouse Query Wiring

Warehouse query functionality is implemented within `analytics_business_insight_report` (`analytics/index.ts:265-293`, `fetchWarehouse`) with real query execution against configured warehouse endpoints, local cache fallback, and explicit `not-connected` states. `analytics_business_insight_report` (`analytics/index.ts:364-387`) is a hybrid code skill with `configSchema`, credential source, and grounded output schema. Remove any stale stub characterization of warehouse query.

### Creative — Revision Diff

`creative_drafting` accepts `existingContent` input but does not produce a revision diff output. This is a missing feature, not a correctness bug. Track separately from skill removal.

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

- Fix Finance 3 Code Skills to return honest `not-connected` instead of `success:true` dry-run
- Fix Marketing `performance-audience-insight.ts` zero/empty outputs to label data absence
- Fix Executive `executive-risk-scenario.ts` random scores to derived scores
- Fix Product `product-analytics-insight.ts` retention default to provisional label
- Correct `add_legal_triggers.py`, `add_marketing_triggers.py`, and `add_product_triggers.py` trigger shape to `SkillTrigger[]`
- Add pre-commit validation that trigger scripts emit `SkillTrigger[]`-compatible output
- Add descriptions to all input fields in schemas lacking them

### Phase 2: Trigger Execution (Weeks 4-7)

- Build trigger execution engine (scheduler, event bus, data-driven threshold monitor)
- Wire declared triggers into the engine; all non-user triggers create drafts, alerts, or review items only
- Ensure no trigger bypasses `confirmBeforeSend` gates (per `ToolExecutor.ts:283-291`)
- Implement Tier 4 sub-specs for any approved ongoing delegations

### Phase 3: UI Normalization (Weeks 5-8)

- Map `operation` → action verbs, `provider` → friendly selectors, `endpointUrl` → "Connect [Service]"
- Map `dryRun` → "Preview only", `confirmation` → "Approve & send"
- Map all `*Id` fields to friendly selectors; hide `resumeId` (not in schemas) behind profile context
- Add honest not-connected banners to all external/hybrid skill outputs

### Phase 4: Cross-Skill State (Weeks 9-13)

- Implement shared-state contracts per the cross-skill integration table above
- Wire output → input flows (Career profile → discovery → apply → pipeline; Education insight → adaptive; Healthcare records → risk → care plan)
- Maintain Sports Group A/B isolation throughout

### Phase 5: Validation & Governance (Weeks 14-17)

- Audit all confirmation gates (Tier 3 default, Tier 4 explicit sub-spec)
- Verify Sports isolation boundaries
- Validate all connector fallbacks return honest `not-connected`
- Document user-facing skill cards with normalized language

### No-Skill-Elimination Guarantee

Every phase preserves all existing skills, lower-order tools, and assistant capabilities. No phase removes, collapses, or deletes any skill. Where consolidation is recommended (e.g., routing multiple domain-specific tools through a single higher-order skill), the underlying tools remain fully functional and accessible.

---

## Validation Checklist and Measurable Targets

### Per-Assistant Validation (all 21 assistants)

- [ ] All user-facing skill names use intent language, not implementation terms
- [ ] No internal IDs (`*Id`, `*Type`, `operation`, `dryRun`) exposed in user-facing schemas where derivable from context
- [ ] Every input field has a description string
- [ ] External/hybrid skills that implement external connectors have a `configSchema` (verify per-assistant; some Education/Event/Creative external skills are catalog-only bindings)
- [ ] Every external/hybrid skill returns honest `not-connected` when unconfigured (not `success: true` with empty output)
- [ ] At least 2 trigger types are declared beyond user-initiated (verified in source)
- [ ] A runtime consumer executes declared triggers (scheduler/event bus — Phase 2 target)
- [ ] `confirmBeforeSend` gates are enabled on every mutating action
- [ ] Tier 4 sub-specs documented for any ongoing delegated authority
- [ ] Shared-state contracts defined for cross-skill flows (where proposed)
- [ ] Sports Group A/B data stores remain isolated (if Sports assistant)
- [ ] Domain-specific safety boundaries enforced (HIPAA, responsible gambling, legal disclaimer, clinical disclaimer)

### Measurable Targets

| Metric | Current State | Target |
| --- | --- | --- |
| Finance skills with honest not-connected fallback | 0 of 3 | 3 of 3 |
| Marketing skills with hard-coded empty structures | 1 | 0 |
| Executive skills with random scores | 1 | 0 |
| Trigger scripts with wrong object shape | 3 (legal, marketing, product) | 0 |
| Sports Group A/B isolation | Enforced | Maintained |
| Skills with `confirmBeforeSend` on mutating actions | Per-assistant (verify per skill) | All mutating skills |
| Assistants with ≥2 non-user trigger types declared | 21 (all) | All, with runtime execution |

**Note:** No aggregate skill counts, percentage coverage metrics, or per-assistant skill counts from prior drafts are included. Verify any count claim against the live `ToolRegistry` directly.

---

## Source Reference Appendix

### Core Types & Services

| Claim | Path | Lines |
| --- | --- | --- |
| `SkillTrigger[]` type definition | `services/tool-executor/src/types/index.ts` | 50-54 |
| `Tool` interface (triggers, configSchema, confirmBeforeSend) | `services/tool-executor/src/types/index.ts` | 56-72 |
| `ToolRegistry` (flat `Map<string, Tool>`) | `services/tool-executor/src/services/ToolRegistry.ts` | 1-29 |
| Trigger validation | `services/tool-executor/src/utils/triggerMetadata.ts` | 23-64 |
| Trigger summary export | `services/tool-executor/src/utils/triggerMetadata.ts` | 71-103 |
| `confirmBeforeSend` enforcement | `services/tool-executor/src/services/ToolExecutor.ts` | 283-291 |
| Config schema validation | `services/tool-executor/src/services/ToolExecutor.ts` | 424-448 |

### Skill Factory & Correctness

| Claim | Path | Lines |
| --- | --- | --- |
| `createExternalActionSkill` — honest not-connected on missing endpoint | `services/tool-executor/src/data/skills/code-skill-factory.ts` | 204-417 (not-connected at 284-293) |
| Finance reporting-data-ops dry-run-when-unconfigured | `services/tool-executor/src/data/skills/finance/reporting-data-ops.ts` | 101-103 |
| Finance risk-regulatory dry-run-when-unconfigured | `services/tool-executor/src/data/skills/finance/risk-regulatory-advisory.ts` | 90-92 |
| Finance budget-tracking dry-run-when-unconfigured | `services/tool-executor/src/data/skills/finance/budget-tracking.ts` | 92-94 |
| Marketing hard-coded empty structures | `services/tool-executor/src/data/skills/marketing/performance-audience-insight.ts` | 31-32, 41-46, 52-57, 63-68 |
| Executive random risk scores | `services/tool-executor/src/data/skills/executive/executive-risk-scenario.ts` | 23 |
| Product default retention estimate | `services/tool-executor/src/data/skills/product/product-analytics-insight.ts` | 18 |
| Adaptive personalization insightData input | `services/tool-executor/src/data/skills/education/adaptive-personalization.ts` | 19 |
| Career Gmail sync config (CAREER_HOME) | `services/tool-executor/src/data/skills/career-canonical-extended.ts` | 15-23 |

### Trigger Scripts

| File | Shape Used | Lines |
| --- | --- | --- |
| `add_triggers.py` (CTO/Sports) | Correct: `triggers: [...]` array | 7-89, 94-181 |
| `add_analytics_triggers.py` | Correct: `triggers: [...]` array | 7-20, 26-39 |
| `add_creative_triggers.py` | Correct: `triggers: [...]` array | 8-19, 26-39 |
| `add_legal_triggers.py` | **Wrong**: `triggers: { ... }` object | 6-75, 70 |
| `add_marketing_triggers.py` | **Wrong**: `triggers: { ... }` object | 6-61, 64 |
| `add_product_triggers.py` | **Wrong**: `triggers: { ... }` object | 1-145, 58 |

### Sports Isolation

| Claim | Path | Lines |
| --- | --- | --- |
| Group A home path | `services/tool-executor/src/data/skills/sports/sports-tactical-roster-evaluator.ts` | 4 |
| Group B home path | `services/tool-executor/src/data/skills/sports/sports-bankroll-co-pilot.ts` | 4 |
| Group B home path (line alert) | `services/tool-executor/src/data/skills/sports/sports-line-alert-dispatcher.ts` | 4 |
| Sports isolation constraint (no sportsbook access) | `services/tool-executor/src/data/skills/sports/sports-line-alert-dispatcher.ts` | 120, 64-65 |

### Assistant Registries

| Claim | Path | Lines |
| --- | --- | --- |
| 22 assistant directories (excl. shared/) | `services/tool-executor/src/data/skills/` | directory listing |
| Canonical arrays (CTO, Healthcare, Restaurant, Career, HR) | `services/tool-executor/src/data/skills/index.ts` | 28-32, 1-31 |
| HR canonical skills | `services/tool-executor/src/data/skills/hr/index.ts` | 336-343 |
| CTO canonical skills | `services/tool-executor/src/data/skills/cto/index.ts` | 563 |
| Sports skills (6 tools, both groups) | `services/tool-executor/src/data/skills/sports/index.ts` | 1-16 |
| Support skills | `services/tool-executor/src/data/skills/support/index.ts` | — |
| Support resolve-ticket gap | `services/tool-executor/src/data/skills/support/ticket-understanding.ts` | 34 |
| Support KB search substring matching | `services/tool-executor/src/data/skills/support/ticket-understanding.ts` | 39-43 |
| Education canonical/probe | `services/tool-executor/src/data/skills/education/index.ts`, `career-canonical-probe.ts` | — |
| Career canonical extended (Gmail sync) | `services/tool-executor/src/data/skills/career-canonical-extended.ts` | 65-75 |

