# Assistant & Skill Usability Recommendations

Source Analysis: 21 assistants from `assistants design 0915-3.md` + 19 category redesigns from `cross-assistant-redesign.md` + 21 detailed 8-step assessments from `skill-design-framework.md`.

## Executive Summary

This document synthesizes findings across all 21 assistants and their higher-order skills to produce actionable usability recommendations. The central theme is that current skills are atomic CRUD wrappers exposed as user-facing buttons; they should instead be outcome-shaped workflows that reduce user burden while preserving capabilities.

Four systemic problems drive the recommendations:

1. Copy-paste wrapper sprawl — 150+ skills share identical 3-field schemas (`baseUrl`, `apiKey`, and `provider`) and differ only in name.
2. Advisory stubs returning empty results — 28 skills tagged C return `{}` or empty arrays instead of honest "not connected" fallbacks.
3. Internal IDs leaked to users — `resumeId`, `patientId`, `eventId`, and `contractType` appear in user-facing inputs.
4. Single trigger type — nearly all skills support only user-initiated invocation; scheduled, event-driven, and data-driven triggers are absent.

## Problem

Skills expose implementation terminology instead of user intent:

- "Configure provider endpoint" → user thinks "Connect my calendar"
- "Supply resumeId" → user thinks "Use my resume"
- "Execute operation=create" → user thinks "Book this reservation"
- "Set dryRun=false" → user thinks "Actually send it"

## Recommendations

### User-Friendly Language Normalization

| Current Pattern | Normalized User Language | Implementation |
|---|---|---|
| provider enum (`openTable` / `resy` / `sevenRooms`) | "Reservation platform" dropdown with friendly names | Map to internal provider IDs |
| operation (`create` / `read` / `update` / `delete`) | Action buttons: "Book", "View", "Modify", "Cancel" | Hide CRUD; show intent |
| `resumeId` / `patientId` / `eventId` / `contractId` | Never exposed; derive from stored context | Profile → Resume; Patient Record → patientId; Event Spec → eventId |
| `endpointUrl` / `apiKey` / `baseUrl` | "Connect [Service Name]" flow with OAuth or guided setup | Config wizard per domain, not per skill |
| `mode: "dry-run"` in output | "Preview mode — not sent" banner | Consistent UI component |
| `success: true, data: {}` | "No data source connected. Connect [X] to enable." | Honest not-connected contract (mandatory per framework) |

### Per-Assistant Language Standards

| Assistant | User-Facing Skill Names (Normalized) | Hidden Internal Operations |
|---|---|---|
| Career Coach | Job Discovery, Apply & Track, Interview Prep, Offer Coach, Networking Drafts | `career_job_discovery`, `career_rank`, `career_apply_execute` |
| CTO | Infrastructure Query, Engineering Actions, Incident Readiness, Architecture Advisory | `cto-datadog`, `cto-jira`, `cto-github` (absorbed into dispatcher) |
| Restaurant | Reservations & Guests, Kitchen & Service, Menu & Recipes, Supply Chain, Staffing, Financials | 31 wrapper skills collapsed to 6 routers with provider/operation params |
| Healthcare | Symptom Triage, Records & Scheduling, Patient Communication, Resource Coordination, Analytics | 12 stub external skills → 5 real skills with honest fallbacks |
| Legal | Contract Review, Legal Research, Matter Ops, Compliance Tracking | `review-contract`, `legal-research`, `legal-case-management` absorbed |
| Finance/Investment | Portfolio Analysis, Market Data, Risk Advisory, Financial Planning | Distinct connectors per domain (Plaid, Alpaca, Bloomberg) not per skill |
| Education | Lesson & Assessment Drafting, Learner Insight, Adaptive Personalization, Resource Library | LMS connector config once, shared across all 4 skills |
| Executive | Leadership Advisory, Development Planning, Feedback Synthesis, Executive Ops, Risk Scenarios | 17 wrapper skills → 5 with `focusArea` parameter |
| Sales | Lead Intelligence, Pipeline Forecast, CRM Sync, Outreach, Meetings, Proposals, Analytics | CRM/email/calendar connectors shared; operation hidden |
| Marketing | Campaign Strategy, Content Production, Multi-Channel Publish, SEO, Performance | `channel` parameter replaces 3 separate publish skills |
| Product | Requirements & Discovery, Roadmap Planning, Evidence & Analytics, Delivery Coordination, Stakeholder Ops | Jira/Confluence/Slack as distinct real systems (not collapsed) |
| Event | Planning & Budgeting, Vendor & Contracts, Day-of Operations | All external skills lacked `configSchema` — add before consolidating |
| Hotel | Reservations & Guests, Property Operations, Guest Experience, Revenue Advisory | Same collapse pattern as Restaurant (21→4) |
| HR | Candidate Screening, Recruiting Ops, Hiring Analytics | `screen-resume` bug (returns 0 for all) fixed first |
| Support | Ticket Resolution, Sentiment & Issues, CRM Sync, Escalation, Follow-up, Analytics | `resolve-ticket` returns empty; `search-kb` bug returns [] |
| Content | Strategy & SEO, Drafting & Adaptation, Multi-Channel Publish, Performance & SEO | 4 near-duplicate publish wrappers → 1 with `channel` param |
| Creative (Songwriter/Scriptwriter) | Concept Intake, Generation & Structure, Trend Advisory, Revision Loop, Production Handoff | `write-lyrics` / `write-script` stubs → real drafting |
| Analytics | Metric Onboarding, Insight Reports, Warehouse Queries, Anomaly Alerts, Stakeholder Reports | `generate-report` / `identify-trends` catalog stubs → real implementation |
| Sports | Performance Analytics, Business & Fan Analytics, Odds & Market Data, Betting Risk (guarded), In-Game Modeling | Betting group strictly isolated from Performance group; no shared data |
| Wealth/Investment | Wealth Strategy, Life Event Simulator, Bill Pay & Rebalancing, Market Data, Portfolio Risk | Personal finance separators from corporate Finance (distinct audiences) |

### Input Field Normalization Rules

- No internal IDs in user-facing schemas — all `*Id` fields are derived from stored context.
- Enums are shown as friendly labels — provider enums map to service names with logos.
- Boolean flags appear as toggles with clear labels — `dryRun` becomes "Preview only" / "Send for real".
- Required fields are minimized — the assistant derives maximum context from profile, history, and stored state.
- Every input field includes a description; 99.2% currently lack them and should be added before consolidation.
- Every skill has a real config schema; Education, Event, and Creative external skills currently do not.

## Cross-Skill Relationships (Data Flow & Shared State)

### Current State

- Most assistants have no functioning shared state; skills operate in isolation.
- Career Coach v2 is the reference: `resume.json` → Job Discovery → Application → Pipeline Reporting.
- Finance and Healthcare external skills share zero state.
- Creative (Songwriter/Scriptwriter) share only `CREATIVE_HOME/drafts.json`.
- Analytics has only a local metrics store (`ANALYTICS_METRICS_PATH`).

### Recommended Cross-Skill Data Contracts

#### Career Coach (Reference Pattern)

Profile & Resume Intake (A)

- structured profile + parsed resume
  - Job Discovery & Fit Ranking (B) — consumes `profile.preferences`
  - Interview Preparation (D) — consumes resume + job from B
  - Application Execution (C) — consumes resume from A, jobs from B
  - Career Advisory (E) — consumes resume/profile/history from A,C
  - Networking & Outreach (F) — consumes profile + target company
  - Pipeline Reporting & Sync (G) — consumes tracking data from C

#### Education

- Learner Insight (B) — pulls LMS data via connector
  - learning profile (style, performance, progress, motivation, at-risk)
  - Adaptive Personalization (C) — consumes B output directly
  - Instructional Materials Drafting (A) — uses learner profile for differentiation
- Resource Library (D) — independent but feeds materials into A

#### Healthcare

- Medical Records (B) — `patientId` is the join key
  - patient record + history
  - Risk Assessment (H) — consumes records
  - Care Plan Management (D) — consumes records + risk output
  - Patient Communication (C) — consumes care plan + records
  - Resource Coordination (F) — consumes care plan + records
  - Clinical Analytics (I) — consumes all above
- Scheduling (E) — independent but feeds encounter data to Records

#### Restaurant (Implemented in restaurant-v2)

- Inventory & Procurement (A) — POS sales → COGS → reorder points
  - Kitchen & Menu (C) — recipes consume inventory items
- Reservations & Guests (B) — guest profiles + turnover
  - Floor & Quality (F) — status from reservations
- Staffing (D) — demand forecast from B + sales from A
- Financial Analytics (E) — consumes A, B, C, D for P&L

#### Hotel (Implemented pattern)

- Reservation Lifecycle (A) — room assignments → Room Operations (E)
  - Guest Experience (B) — profiles from A
  - Revenue Analysis (C) — occupancy/ADR from A
  - Billing & Channels (D) — folio from A
- Staff & Inventory (F) — independent but feeds E

#### Sales

- CRM Sync (C) — opportunities → Lead Intelligence (A) scores them
  - Pipeline Forecasting (B) — consumes scored opportunities
  - Meeting Lifecycle (E) — creates activities in CRM
  - Proposal & Quote (F) — linked to opportunity
  - Outreach (D) — logs to CRM
- Analytics (G) — consumes all above

#### Support

- Ticket Resolution (A) — KB search grounds responses
  - Sentiment & Issues (B) — analyzes ticket text
  - CRM Sync (C) — pulls customer history for A
  - Escalation (D) — triggered by B urgency/sentiment
  - Follow-up (E) — scheduled from A resolution
- Analytics (F) — consumes all

#### Marketing

- Campaign Strategy (A) — audience + market research → Content Production (B)
  - Multi-Channel Execution (C) — publishes B output
  - SEO (D) — audits published content
  - Performance Analytics (E) — measures C + D results → feeds back to A

#### Executive

- Strategic Decision (A) — performance data → 360 Assessment (B)
  - Development Planning (C) — consumes A+B
  - Communication Coaching (D) — consumes B feedback
  - Career Planning (E) — consumes C gaps
- Calendar/Email Ops (F) — independent but logs to A for time allocation

### Shared State Implementation Requirements

| Assistant | Shared State Keys | Storage |
|---|---|---|
| Career | `career.profile`, `career.resume`, `career.jobs[]`, `career.applications[]`, `career.outcomes[]` | Local JSON + Notion/Gmail sync |
| Education | `education.learners[learnerId]`, `education.resources[]`, `education.courseware[]` | LMS connector + local |
| Healthcare | `healthcare.patients[patientId]`, `healthcare.records[]`, `healthcare.carePlans[]` | EHR connector (HIPAA) |
| Restaurant | `restaurant.inventory[]`, `restaurant.reservations[]`, `restaurant.recipes[]`, `restaurant.staff[]` | POS/PMS connector |
| Hotel | `hotel.reservations[]`, `hotel.rooms[]`, `hotel.guests[]`, `hotel.tasks[]` | PMS connector |
| Sales | `sales.opportunities[]`, `sales.leads[]`, `sales.activities[]`, `sales.forecasts[]` | CRM connector |
| Support | `support.tickets[]`, `support.customers[]`, `support.kb[]`, `support.escalations[]` | Helpdesk connector |
| Marketing | `marketing.campaigns[]`, `marketing.content[]`, `marketing.audience[]`, `marketing.performance[]` | Ad platform connectors |
| Product | `product.context`, `product.roadmap[]`, `product.delivery[]`, `product.stakeholders[]` | Jira/Confluence/Slack |
| Executive | `executive.goals[]`, `executive.assessments[]`, `executive.feedback[]`, `executive.calendar[]` | Calendar/Email connectors |
| Finance | `finance.assumptions`, `finance.models[]`, `finance.investments[]`, `finance.reports[]` | ERP/BI connector |
| Investment | `investment.holdings[]`, `investment.marketData[]`, `investment.plans[]`, `investment.risk[]` | Brokerage/Market data |
| Legal | `legal.matters[]`, `legal.contracts[]`, `legal.clauses[]`, `legal.compliance[]` | DMS/E-sign connectors |
| CTO | `cto.infra[]`, `cto.incidents[]`, `cto.teamMetrics[]`, `cto.architecture[]` | Jira/GitHub/Datadog |
| Analytics | `analytics.metrics[]`, `analytics.warehouseConfig`, `analytics.reports[]` | Warehouse/BI connector |
| Creative | `creative.drafts[]` (shared Songwriter+Scriptwriter) | Local + DAW metadata |
| Event | `event.spec`, `event.budget`, `event.vendors[]`, `event.guests[]`, `event.plan` | Ticketing/Payment connectors |
| HR | `hr.candidates[]`, `hr.jobs[]`, `hr.interviews[]`, `hr.assessments[]`, `hr.analytics[]` | ATS/HRIS connectors |

## Output-to-Input Triggers / Auto-Triggering

### Current State

- Original design: only user-initiated triggers (press a button).
- Framework requirement: 4 trigger types per skill (user, scheduled, event-driven, and data-driven).
- Assessments propose triggers, but most are not implemented in source code.

### Trigger Type Definitions

| Type | Description | Example | Confirmation Gate |
|---|---|---|---|
| User-initiated | Explicit user request | "Find me jobs", "Draft this contract" | N/A (user intent explicit) |
| Scheduled | Time/date-based | Daily morning digest, weekly pipeline review | Creates draft/alert only |
| Event-driven | External state change | New job posted, ticket created, PR merged | Creates draft/alert only |
| Data-driven | Threshold/condition met | Fit score > 85, budget variance > 10%, inventory < reorder | Creates draft/alert only |

> Critical rule: scheduled, event-driven, and data-driven triggers never bypass confirmation gates. They create drafts, alerts, or review items only. The user must explicitly approve any external write or mutation, except for explicitly approved ongoing delegated authority under the framework.

### Trigger Implementation Priority

1. Phase 1: add scheduled triggers for all digest/summary skills (Career Pipeline, CTO DORA, Sales Forecast, Support Analytics, Marketing Analytics, and Executive Time Audit).
2. Phase 2: add event-driven triggers for state changes (new job listing, inbound ticket, deal stage change, PR merged, reservation created).
3. Phase 3: add data-driven triggers for threshold crossings (fit score, budget variance, inventory reorder, SLA breach, anomaly detection).

All phases: every trigger creates a draft, alert, or review item — never executes a mutation without explicit confirmation.

## Approval-Based Automation Opportunities

### Governance Tiers (Per Framework Principle #3)

| Tier | Description | Examples | Approval Required |
|---|---|---|---|
| Tier 1: Read/Query | Safe, idempotent, no side effects | Dashboard views, analytics, search, reports | None (but show source freshness) |
| Tier 2: Draft/Prepare | Creates artifacts for review | Draft email, PRD draft, proposal, care plan | Implicit (user reviews before action) |
| Tier 3: Confirm-Before-Send (Default) | Single mutating action, staged | Submit application, send email, book reservation, create Jira issue | Explicit per-action confirmation |
| Tier 4: Ongoing Delegated Authority | Repeated actions over time | Multi-touch outreach sequence, scheduled monitoring loop, auto-apply above threshold | Explicit sub-spec: pause conditions, kill switch, re-approval cadence, audit log |

### Current Violations

- Many proxy skills execute immediately without preview.
- `dryRun` flags exist but often default to false or are hidden.
- No skill implements Tier 4 sub-specs for pause/kill-switch/re-approval/audit.
- Scheduled triggers in assessments bypass gates and must be fixed.

### Tier 4 Sub-Spec Template

Every skill granted Tier 4 must declare:

```json
{
  "tier": "ongoing_delegated",
  "pauseConditions": ["user_reply_received", "error_rate_exceeds_5%", "manual_pause"],
  "killSwitch": "immediate_stop_on_user_command",
  "reapprovalCadence": "weekly",
  "auditLog": "every_action_logged_with_timestamp_actor_outcome",
  "maxActionsPerCycle": 50,
  "escalationPath": "notify_user_on_pause_or_error"
}
```

### Approval UI Patterns

| Action Type | UI Pattern |
|---|---|
| Single confirm-before-send | Modal with diff/preview, "Confirm & Send" / "Cancel" / "Edit" |
| Batch confirm | Review table with checkboxes, "Confirm Selected" / "Preview All" |
| Ongoing delegated | Setup wizard → "Enable Auto-Pilot" toggle → dashboard with pause/kill-switch/audit log |
| Scheduled draft creation | In-app notification: "Draft ready for review" with deep link |
| Data-driven alert | Toast/notification: "Threshold crossed — review recommended" |

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

- Add real `configSchema` to all skills; Education, Event, and Creative external skills are missing them.
- Add descriptions to every input field; 99.2% currently lack them.
- Fix the `CAREER_HOME` copy-paste bug in 9+ categories; each needs its own environment variable.
- Implement honest not-connected fallbacks for all 28 stub skills by returning explicit "not connected" instead of empty objects.

### Phase 2: Consolidation (Weeks 4-6)

- Collapse wrapper sprawl: Restaurant (31→6), Executive (17→5), Hotel (20→4), Healthcare (12→5), etc.
- Replace stub skills with grounded reasoning (Education, Creative, Legal, Healthcare, Support).
- Remove internal IDs from user-facing schemas (`resumeId`, `patientId`, `eventId`, etc.).
- Normalize skill names to user-intent language.

### Phase 3: Triggers & Automation (Weeks 7-10)

- Implement scheduled triggers for all digest/summary skills.
- Implement event-driven triggers for state changes.
- Implement data-driven triggers for threshold crossings.
- Ensure all triggers create drafts, alerts, or review items only and never bypass confirmation gates.
- Build Tier 4 sub-specs for approved ongoing delegations (Career auto-apply, Sales outreach, Marketing publish queue, Support follow-up, Sports responsible gambling, Executive calendar).

### Phase 4: Cross-Skill State (Weeks 11-14)

- Implement shared-state contracts per assistant.
- Wire output → input flows (Career profile → discovery → apply → pipeline; Education insight → adaptive; Healthcare records → risk → care plan).
- Add join keys (`patientId`, `learnerId`, `opportunityId`, `ticketId`) as internal only.
- Build cross-assistant bridges where audiences overlap (Career↔HR, Finance↔Investment, Sales↔Marketing).

### Phase 5: Polish & Governance (Weeks 15-18)

- Audit all confirmation gates — Tier 3 default and Tier 4 explicit sub-spec.
- Add explicit "Connector Offline" banners for analytics UX needs.
- Implement responsible-play framing for Sports Wagering.
- Enforce the clinical disclaimer for Healthcare.
- Enforce the legal disclaimer for Legal.
- Document user-facing skill cards with normalized language.

## Appendix: Cross-Cutting Fixes from Audit

| Fix | Affected Categories | Status |
|---|---|---|
| Add real `configSchema` | Education (14 skills), Event (7 skills), Creative external skills | Required before consolidation |
| Fix `CAREER_HOME` env var bug | CTO, Hotel, Restaurant, Investment, Sports, Sales, Marketing, Healthcare, Executive, Legal, Finance, Support | Critical — each needs its own env var |
| Add description to all inputs | All 249 audited skills | Required |
| Replace stub skills (28 tagged C) | One or two per category | Replace with grounded reasoning |
| Collapse wrapper sprawl | Restaurant (31→6), Executive (17→5), Hotel (20→4), Healthcare (12→5) | Required |
| Separate advisory from mutating | All categories | Confirm-before-send default for writes |
| Fix `screen-resume` returning 0 for all | HR | Correctness bug — fix first |
| Fix `resolve-ticket` returning empty | Support | Correctness bug |
| Fix `search-kb` returning [] despite matches | Support | Bug — not design gap |
| Fix `education_adaptive_personalization` template bug | Education | Placeholder-fill bug |
| Fix `symptom-checker` empty guidance | Healthcare | Returns empty + disclaimer — safer than fake but must improve |
| Fix `review-contract` returning `issues: []` | Legal | Same false-confidence as symptom-checker |
| Fix `score-lead` bare 0-100 no rationale | Sales | "Raw function not assistance" problem |
| Add `configSchema` to Analytics external | Analytics | `analytics_warehouse_query` needs real schema |
| Wire Analytics warehouse query → Insight Report | Analytics | Proposed hybrid integration not implemented |
| Creative revision diff not implemented | Songwriter, Scriptwriter | `existingContent` accepted but no diff output |
| Finance shared state absent | Finance | Two code skills emit to stdout, no persistence |
| Healthcare 12 external skills no shared state | Healthcare | Only `checks.json` implemented; `patientId` join key proposed |
| Legal catalog-only bindings | Legal | 10 catalog IDs, no source implementations |
| Event all 7 external skills no configSchema | Event | Add before consolidating |
| Product document ingestion internal | Product | `product-markdown-parsing` not user-facing; utility for other skills |

## Appendix: Skill Classification Reference

### Four-Class System (From Framework)

| Class | Depends On | Config Schema Contains | Fallback Behavior |
|---|---|---|---|
| Reasoning-only | Local context + model | No external config | Works offline |
| Real external integration | Live system of record (API/MCP) | MCP server reference and real credentials | `mode: "dry-run"` + explicit "not connected" |
| Internal code | Real data fetch + local execution | Local tool references | Runs locally |
| Hybrid | Real data fetch + reasoning on top | MCP connector + local reasoning | Degrades to reasoning-only with caveats |

### Classification by Assistant (Summary)

| Assistant | Reasoning-only | Real External | Internal Code | Hybrid |
|---|---|---|---|---|
| Career | Career Advisory, Interview Prep | Job Discovery, Application, Pipeline Sync | Profile Intake | Job Discovery, Application, Pipeline Sync |
| CTO | Architecture Advisory | Infra Query, Eng Actions, Observability, Infra Ops | — | Incident Readiness, Team Delivery |
| Restaurant | Financial Analytics | Reservations, Kitchen, Floor Ops | — | Inventory, Staffing |
| Healthcare | Symptom Triage | Records, Communication, Care Plan, Scheduling, Resources, Tagging, Risk, Analytics | — | — |
| Legal | Contract Advisory, Compliance | Research, Matter Ops | — | — |
| Finance | Modeling, Sensitivity, Investment, Reporting, Budget, Cleaning | Regulatory, Document Mgmt | Modeling, Investment | — |
| Investment | Portfolio Analysis, Risk Mgmt | Market Data | — | Portfolio Analysis, Quantitative |
| Education | Materials Drafting, Adaptive | Learner Insight, Resource Library | — | Learner Insight |
| Executive | Strategic, 360, Development, Communication, Career | Calendar/Email | — | Strategic, 360, Development, Communication, Career |
| Sales | Lead Intel, Forecasting | CRM Sync, Outreach, Meetings, Proposals, Analytics | — | — |
| Marketing | Performance Analytics | Multi-Channel, SEO | — | Strategy, Content, SEO |
| Product | Roadmap Planning | Delivery, Stakeholder Ops | Requirements | Requirements, Evidence |
| Event | Planning & Budgeting | Vendor Mgmt, Day-of Ops | — | — |
| Hotel | Revenue Analysis | Billing/Channels, Staff/Inventory | — | Reservations, Guest Experience, Room Ops |
| HR | Assessment & Selection | Communication, Job Posting | — | Sourcing, Interview, Analytics |
| Support | Sentiment & Issues | CRM Sync, Escalation, Follow-up, Analytics | — | Ticket Resolution |
| Content | Performance Analytics | Multi-Channel, SEO | — | Strategy, Drafting |
| Creative (both) | Concept, Generation, Revision, Handoff | Trend Advisory, Outline/Beat Sheet | — | Outline/Beat Sheet |
| Analytics | Metric Onboarding, Insight Report, Anomaly, Stakeholder Report | Warehouse Query | Insight Report | — |
| Sports (Perf) | Business/Fan Analytics, In-Game Modeling | Performance Analytics | — | Performance Analytics |
| Sports (Wager) | Bankroll, Performance, Responsible Gambling | Odds & Market | — | Bankroll |

## Validation Checklist for Each Assistant

Before marking an assistant "usability-ready":

- All skills have user-friendly names and not implementation terms.
- No internal IDs (`*Id`, `*Type`, `operation`, `dryRun`) appear in user-facing schemas.
- Every input field has a description string.
- Every skill has a `configSchema` (real for external, empty object for reasoning-only).
- Honest not-connected fallback is implemented for every external/hybrid skill.
- At least 2 trigger types are implemented beyond user-initiated ones.
- Confirm-before-send gates are enabled on every mutating action (Tier 3 default).
- Tier 4 sub-specs are documented for any ongoing delegated authority.
- Shared-state contracts are defined and wired for cross-skill flows.
- Output artifacts match user expectations instead of raw JSON.
- Domain-specific safety boundaries are enforced (HIPAA, responsible gambling, legal disclaimer, clinical disclaimer).

## Success Metrics

| Metric | Baseline | Target |
|---|---|---|
| Skills per assistant (median) | ~12 (249/21) | 5-7 (outcome-shaped) |
| Skills with configSchema | ~0.8% | 100% |
| Skills with input description | 0.8% | 100% |
| Skills with >1 trigger type | ~0% | 100% |
| Stub skills returning empty results | 28 | 0 |
| Internal IDs in user schemas | Dozens | 0 |
| Wrapper sprawl (3-field copy-paste) | 150+ | 0 |
| Tier 4 sub-specs implemented | 0 | As approved per assistant |
