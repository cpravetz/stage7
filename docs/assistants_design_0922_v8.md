# Assistant & Skill Design — v8 (Definitive)

> This is a complete, self-contained specification. It does not require any earlier revision to be read alongside it.
> **What changed from v7, and why:** This revision integrates the formal **Skill Orchestration Layer** bridging the Chat interface and underlying deterministic Skills. Without this layer, the system forks into a conversational LLM lacking live data and a repository of idle code. We have introduced strict pre-flight gating to eliminate false outputs (hallucinations of missing inputs or logic errors), established the Assistant as an Intent Router, and codified risk-gating based on judgement and creativity tiers.
> **Read Part A before touching anything in Part B.**
> 
> 

---

# Part A — Design Principles

## 0. Principles

### 0.0 — Skill Orchestration & Chat Integration (The Tool Boundary)

The Assistant interface must never operate independently of the Skill registry. To prevent the Assistant from inventing plausible but fake answers, it acts as an **Intent Router & Response Synthesizer**.

1. **Tool Registration:** The Chat engine dynamically registers active Skills as callable Tools in the LLM's system prompt, utilizing the Skill's `inputSchema` and `description`.
2. **Pre-Flight Fail-Closed Gate:** Before generating any conversational text, the Chat evaluates the Skill's execution response. If `success: false` due to a missing connector or configuration, the Chat must halt synthesis and surface an actionable UI card (e.g., *"Provider offline. Click here to configure."*). It must never apologize or invent a workaround.
3. **Strict Grounded Synthesis:** When a Skill successfully returns a JSON payload, the Chat LLM is strictly bounded by that payload. The system prompt must enforce that no metrics, entities, or root causes are invented if they do not exist in the returned data.

### 0.1 — No single linear "Workflow" per Assistant

An Assistant does not execute one fixed sequence of steps. It has one or more **Capability Clusters** (§2): sets of Skills that share persistent state and, in some cases, real internal sequencing. A cluster may be genuinely sequential per instance (a support ticket really is understood, then answered, then closed), but an Assistant runs many instances concurrently, and most Assistants have several independent clusters with no sequencing between them at all. There is no single "current step" for an Assistant, ever, and nothing in the product should imply one.

### 0.2 — No "current step" / single-stream UI

A UI panel that shows one "current step" for an Assistant, with no way to act on it, should not exist. If a "what's in flight" view is wanted, it must show every concurrently running instance across every cluster, each actionable on its own — never a single step standing in for the whole Assistant.

### 0.3 — Every registered Skill must already work. There is no flag-based readiness gate.

A Skill either works or it isn't a Skill yet — there is no legitimate in-between state to manage. `isSkill` has exactly one job, and it has nothing to do with quality: it distinguishes a user-facing Skill from an internal base tool the Assistant calls but a user never sees directly. It is never a proxy for "not ready yet," and it is never a place to stage known-incomplete work. Every Skill gets released, because every Skill is required to be ready and working before it's a Skill at all.

### 0.4 — Domain Knowledge needs a delivery mechanism, not a label

A Domain Knowledge description is not itself a capability. Every Assistant must state *how* its domain knowledge actually reaches the model at run time: system-prompt injection specific to that Assistant, a retrieval corpus queried per invocation, or structured config the Skill's logic reads directly.

### 0.5 — Assistant-level facts are declared once, not repeated per Skill row

Domain Knowledge, Persistent Data, and Interfaces are properties of the Assistant, stated once. They are not repeated, word for word, in every Skill's row. Note the limit of this principle: it applies to facts that are identical across every Skill in an Assistant. A Skill's own Description and Tier are not Assistant-level facts — they are specific to that Skill and must appear on every row.

### 0.6 — configSchema is for things that need a human decision, not mechanics

A property belongs in `configSchema` only if a human genuinely has to decide it — credentials for a login-gated source, a budget ceiling, a tone preference. If a Skill can have a sane, working default with no input, it ships with that default; it does not present a required, empty field that blocks the Skill from running. Required config is only a §0.6 violation when a workable default was available and skipped.

### 0.7 — configSchema fields ≠ display metadata

Registry and routing metadata — Category, Catalog, Source, the Skill's own ID — is never rendered inside what the user sees as configuration. Every remaining config property needs a human-readable label sourced from the schema's `title`, never the raw property key.

### 0.8 — Every Skill needs an Output schema and a rendering template

`outputSchema` is mandatory for every Skill, and every Skill needs a small rendering template mapping its output fields to a plain-language result. Raw JSON, doubly-encoded or otherwise, is never shown to a user. On failure, the template renders a human sentence explaining what happened — not the raw error string. Furthermore, Chat UI must be equipped to render the Skill's custom `present` UI blocks natively alongside the Assistant's chat response.

### 0.9 — Operation/mode is invisible, because it doesn't matter

It is not enough that the Assistant, rather than the user, decides which internal operation to run. The deeper point is that it doesn't matter to the user, and it shouldn't matter to the Assistant either, which internal "operation" or sequence of operations ran. An `operation`/`action`/`mode` enum is private routing logic inside a Skill's implementation — never a required field on a panel, never something the Assistant narrates, never something the user is asked to pick.

### 0.10 — Run exists in exactly one place

There is no Run button anywhere except the UX panel on the **Overview tab** of the Assistant, and even there, only for Skills that are genuinely user-triggerable. It never appears on the Skills tab, the Config tab, or the Bound Skills panel, under any condition, disabled or otherwise. A Scheduled Skill runs on the interval set in its own configuration, with no button involved. An Event/State-triggered Skill runs when the Assistant detects the condition it defines, with no button involved.

### 0.14 — Every Skill has exactly one trigger, and it is determined by how the Skill is actually invoked

A Skill claiming User, Schedule, and Event triggers simultaneously does not describe how anything is actually invoked. The correct single trigger is determined as follows:

* **Event** — fires because another Skill produced output it consumes, or because a monitored state/data condition changed.


* **Schedule** — runs on a clock interval because it exists to monitor something on the user's behalf over time. The interval lives in the Skill's own configuration.


* **User** — a person has to ask for it, surfaced only as a Run action on the Overview tab.

The test of whether a Skill is Schedule/Event or User is who can produce the required input. A Skill whose inputs arrive from a connected source, a feed another Skill declares, or its own endpoint may legitimately be automatic. One whose inputs only exist in a person's head or a file they have to paste is User.

### 0.15 — Tier (Advise / Aid / Represent) is a typed field, every Skill has exactly one, and it drives enforcement

Every Skill belongs to exactly one tier, and the tier is not decorative — it determines what the platform enforces around that Skill, factoring in judgement, creativity, and risk:

* **Advise (Judgement & Analysis)** — the Skill produces analysis, recommendations, or an assessment. It reads and reasons; it does not act and does not hand the user a work product they'll send elsewhere.


* **Aid (Creativity & Co-Pilot)** — the Skill produces something the user will use or send themselves (a draft, a plan, a template, a co-created work product). It does work, but the last step — sending, publishing, submitting — is still the person's.


* **Represent (Risk Gating & Autonomy)** — the Skill acts on the user's behalf against a real external system, or completes the send/submit/publish/apply step itself. Every Represent-tier Skill **must** carry `confirmBeforeSend` (or an equivalent explicit confirmation gate) — this is enforced by type, not left as a convention each Skill remembers to set.



Tier is recorded per Skill in its own column, never folded into or substituted for the Skill's Description.

## 1. Skills are released working, or not released

A Skill is committed and exposed to a user only once all of the following are true:

1. It has been invoked for real and returns a successful result — no `"mode":"not-connected"`, no stub output, no placeholder.


2. Its returned output matches its declared `outputSchema` and renders through a template.


3. It has no `configSchema` field that is `required` but unsatisfiable by a normal user in the current environment, and no required field flagged as a §0.6 violation without a named default.


4. It complies with §0.7 — no registry metadata rendered as configuration, real human labels throughout.


5. It has exactly one resolvable trigger.


6. If it depends on the Assistant's Domain Knowledge, that knowledge has a working delivery mechanism, not a TBD.


7. Its Tier is set, and if that Tier is Represent, `confirmBeforeSend` (or equivalent) is present.


8. **(New)** It passes Pre-Flight checks in the Chat interface and registers successfully as an actionable Tool in the LLM context.

---

# Part B — Assistant Reference

> Cluster groupings are derived from each Skill's `Consumes`/`Produces` as recorded in the current implementation snapshot this document was built from — treat them as a first pass and confirm against source, not as independently re-verified ground truth for every row. **Tier and Description are recorded separately for every Skill in this revision** — for the assistants where the source data previously gave only a tier label with no description (Restaurant, Content, Songwriter, Scriptwriter, Sports, Finance, Wealth, Healthcare, Hotel, Education, Support, HR, Product, Marketing, Analytics), the Description shown below is newly written from the Skill's ID, Inputs, and Consumes/Produces — reasonable, but **derived, not sourced**, and should be checked against the actual implementation or original spec before being treated as authoritative. For the assistants where the source data previously gave a description but no tier (CTO, Career, Executive, Legal, Sales, Event), the Tier shown below is newly inferred from each Skill's action-vs-advisory shape (presence of `confirmBeforeSend`/external write access → Represent; production of a usable draft/artifact → Aid; analysis/recommendation only → Advise) and carries the same caveat. **Exception, verified against source:** `career-resume-template-manager`'s Tier, Description, and Inputs are now taken directly from `career-resume-template-manager.ts` (`tier: 'aid'`), not inferred.

## 1. CTO
**Capability Clusters:**
- **Architecture & Cost Planning** — `cto-architecture-tech-debt-evaluator`, `cto-cloud-spend-infrastructure-optimizer`
- **Incident & Resilience** — `cto-incident-war-room-synthesizer`, `cto-disaster-recovery-planner`
- **Delivery Health** — `cto-team-delivery-health-evaluator`
- **Infrastructure Remediation (action layer)** — `cto-engineering-action-iac-drift-remediation`; confirmation-gated; may be invoked from any of the above clusters, not sequential to them

**Domain Knowledge:** Distributed systems architecture, DevOps/SRE, DORA metrics, cloud cost optimization, microservices failure modes
**Persistent Data:** Architecture diagrams/specifications, cloud budget thresholds, target SLO/SLA definitions, team capacity matrices, tech debt backlog
**Interfaces:** AWS/GCP/Azure APIs, Datadog/PagerDuty, GitHub/GitLab, Jira/Linear, Slack/Teams
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| cto-architecture-tech-debt-evaluator | Produce prioritized modernization roadmap | Advise *(inferred)* | **User** — a modernization roadmap is requested; `systems` is supplied by the person **(reassigned from Schedule — see 0.14)** | systems: name,reliability(0-5),security,scalability,maintainability,cost; requirements: string[]; context: teamSize,stack,constraints | empty | cto-architecture-advisory | scored systems, roadmap with actions | MATCH |
| cto-cloud-spend-infrastructure-optimizer | Recommend rightsizing and capacity actions | Advise *(inferred)* | **User** — a spend review is requested; `billingRows` is supplied by the person **(reassigned from Schedule — see 0.14)** | billingRows: service,spend,utilization(0-1); context: object | empty | cto-infrastructure-query(cost-optimization) | rightsizing recs, savings estimates | MATCH |
| cto-incident-war-room-synthesizer | Correlate signals into root-cause hypotheses | Advise *(inferred)* | **User** — correlation is requested; `signals` is supplied by the person **(reassigned from Event — see 0.14)** | signals: source,evidence,hypothesis,confidence(0-1); context: object | empty | cto-incident-disaster-readiness | hypotheses, mitigations, stakeholder update | MATCH |
| cto-engineering-action-iac-drift-remediation | Dry-run and apply IaC remediation after confirmation | Represent *(inferred)* | **Event** — fired by detected infrastructure drift; `confirmation` is an input field, not a separate trigger | payload: object; dryRun(bool,default=true); confirmation(bool,default=false) | endpointUrl(URL,required); token(password,required) — legitimate per §0.6, no universal default exists | direct API | response or confirmation-required error | MATCH |
| cto-team-delivery-health-evaluator | Evaluate DORA metrics, team capacity, sprint velocity | Advise *(inferred)* | **Schedule** — periodic DORA/velocity monitoring | systems: string[]; period: week/month/quarter | deploymentFreqThreshold(1), leadTimeDays(7), failureRate(0.15), mttrHours(24) | cto-infrastructure-query(team-metrics) | DORA assessment, team capacity, sprint velocity | clustered, not orphaned |
| cto-disaster-recovery-planner | DR readiness with RTO/RPO targets | Advise *(inferred)* | **Schedule** — periodic DR readiness check | systems: name,rto,rpo,backupVerified,lastTested; context: object | rtoTargetMinutes(60), rpoTargetMinutes(15), failoverAuto(false), includeTeams(true) | cto-incident-disaster-readiness | readiness status, assessments, recommendations | clustered, not orphaned |

Base tool mapping: `get_cloud_billing_metrics→cto-infrastructure-query`, `query_datadog_alerts→cto-infrastructure-query`, `fetch_github_pull_requests→cto-engineering-actions`, `fetch_jira_backlog→cto-engineering-actions`, `calculate_dora_metrics→cto-team-delivery-health-evaluator`, `execute_iac_drift_scan→cto-engineering-action-iac-drift-remediation`.

## 2. Career
**Capability Clusters:**
- **Positioning & Discovery** — `career-job-market-positioning-evaluator`, `career-job-discovery-fit-ranking`
- **Template Library** — `career-resume-template-manager`; its own cluster, not folded into Positioning & Discovery: it consumes no base tool and is consumed *from* Application & Outreach instead, as a reference source for template selection (`x-referenceSource`) and a `get` delegation from `career-application-execution-orchestrator`
- **Interview Prep** — `career-interview-compensation-battlecard-creator`, `career-interview-practice-mock-interviewer`
- **Application & Outreach** — `career-governed-application-outreach-manager`, `career-application-execution-orchestrator`, `career-portal-recruiter-workflow`
- **Pipeline Tracking** — `career-pipeline-outcome-tracker` (feeds Positioning & Discovery via outcome data)
- **Upskilling** — `career-upskill-role-targeted-learning-planner`

All clusters read/write the same Master Career Profile — the shared state is why this is one Assistant with several clusters, not several Assistants, and why no single linear caption ever fit it.

**Domain Knowledge:** Hiring processes, compensation structuring (equity, bonuses, base), ATS parsing logic, personal branding, negotiation tactics
**Persistent Data:** Master Career Profile (resume.json), target role criteria, compensation floors, application history log, company exclusion list
**Interfaces:** Job Boards (LinkedIn, Indeed, Glassdoor), ATS Systems (Lever, Greenhouse), Email SMTP/IMAP, PDF Generation Engines
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| career-job-market-positioning-evaluator | Review resume vs listings for resume edits and salary targets | Advise *(inferred)* | **Schedule** — ongoing market-fit monitoring | resume, selected from resume manager; market: string; systems: profile context; listings: ranked jobs | empty | career_profile_intake, career_job_discovery, career_rank | resume edits, target salary, positioning recs | MATCH |
| career-interview-compensation-battlecard-creator | Interview Q&A and compensation negotiation script | Aid *(inferred)* | **Event** — fired when an interview is scheduled | company: string; context: role,team,industry | empty | career_interview_prep, career_advisory | Q&A briefing, negotiation script, battlecard | MATCH |
| career-governed-application-outreach-manager | Application submissions with confirm-before-send | Represent | **User** — a decision the person makes | application data, outreach data | confirmBeforeSend(bool,default=true) | career_apply_execute | confirmations, outreach records, audit logs | MATCH |
| career-job-discovery-fit-ranking | Discover, score, rank job opportunities | Advise *(inferred)* | **Schedule** — ongoing job-board monitoring | jobTitles[], locations[], minSalary, maxSalary, autoApplyThreshold, dryRun | premiumJobBoards[], freeJobBoards[] | career_job_discovery, career_apply_execute | ranked opportunities with scores | MATCH |
| career-application-execution-orchestrator | Multi-portal applications with dry-run and audit | Represent *(inferred)* | **User** — applying is a decision the person makes | targetRoles[], listings[], dryRun(default=true), coverLetters[], customResume, customCoverLetter | empty | career_apply_execute | submissions with status, audit trail | MATCH |
| career-upskill-role-targeted-learning-planner | Upskilling plans for target roles | Advise *(inferred)* | **Event** — fired by a gap surfaced in pipeline outcome data | gaps[], targetRole, currentSkills | empty | reasoning-based | upskilling plan, resources, micro-tasks | MATCH |
| career-interview-practice-mock-interviewer | Mock interviews with battlecards | Aid *(inferred)* | **User** — practicing is requested | role, company, battlecard | empty | career_interview_prep | transcript, performance, coaching notes | MATCH |
| career-pipeline-outcome-tracker | Track applications and outcomes | Aid *(inferred)* | **Event** — fired by an application status change | targetRole, company, status, feedback, offerDetails | empty | career_pipeline_report, career_outcome | pipeline reports, outcome records | MATCH |
| career-resume-template-manager | Manage, edit, upload, and organize resume and cover letter templates (list/get/save/delete, with mustache-variable auto-extraction) | Aid *(sourced from `tier: 'aid'`)* | **User** — a template is listed, viewed, saved, or deleted on request | action(list/save/get/delete, default=list), typeFilter(all/resume/cover-letter), id, name, type(resume/cover-letter), content, tags[], resumeFile(name, mimeType, content — PDF/DOCX/MD/TXT upload) | empty | none — reads/writes the `templates` store directly (`ctx.store`), no base-tool delegation; it is itself a *reference source* for `career-application-execution-orchestrator` (`x-referenceSource`) | template metadata, single-template detail view, or filtered document list | EXTRA (not in design) — inputs are now action/entity-based, not `templateName/resumeData/targetRole`; **NON-COMPLIANT** — exposes an `action` enum; violates §0.9 |
| career-portal-recruiter-workflow | Recruiter outreach and portal management | Represent *(inferred)* | **Event** — fired by a recruiter message or portal state change | dryRun, applyAt, targetCompany, targetPerson, relationshipStage, channel, connectedSendTool | empty | career_apply_execute, career_networking_outreach | outreach drafts, portal records | MATCH (design separates portal+outreach; code combines) |

Base Tools (`isSkill=false`, 10): career_profile_intake, career_job_discovery, career_rank, career_apply_execute, career_add_template, career_networking_outreach, career_pipeline_report, career_outcome, career_interview_prep, career_advisory

Two consequences of `career-resume-template-manager` owning the `templates` store directly, recorded here so they aren't rediscovered as new findings later:
- **`career_add_template` is superseded by it, not still upstream of it.** Nothing delegates to `career_add_template`; the user-facing Skill absorbed its function (create/version a template), while the base tool now writes to a store key named `outPath` (`career-add-template.ts:81`) rather than `templates`. It should be deprecated or repointed — it is not a `Consumes` edge of anything.
- **A live §0.9 leak at the delegation boundary.** Both `career-application-execution-orchestrator.ts:75,82` and `career-application-execution.ts:57` delegate with `{ mode: 'get', id }`, but the Skill reads `input.action` and defaults it to `list` — so those template lookups resolve to `list`, not `get`. The callers are passing exactly the mode-switch field §0.9 forbids, into a Skill whose parameter was renamed and defaulted; the fetch silently returns the library listing instead of the requested template. This is recorded as a defect, not endorsed.

## 3. Executive
**Capability Clusters:** four independent clusters, one Skill each — nothing in the data wires these together:
- **Leadership Advisory** — `executive-leadership-advisory`
- **Development Planning** — `executive-dev-career`
- **360 Feedback** — `executive-feedback`
- **Risk Scenario Modeling** — `executive-risk-scenario`

⚠️ **Missing entirely, not yet in code:** Executive Speech & Communication Co-Pilot, Executive Time & Strategic Focus Proxy.

**Domain Knowledge:** Executive coaching, corporate governance, organizational psychology, high-stakes communication, change management
**Persistent Data:** Executive Goal Matrix, Stakeholder Maps, Leadership Values & Communication Style Guide, Board Governance Calendar
**Interfaces:** Executive Calendar APIs, Email, Board Management Portals, Communication Platforms
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| executive-leadership-advisory | Executive presence, C-suite dynamics, leadership strategy | Advise *(inferred)* | **User** — advice on a specific situation is requested | strategicContext: org strategy; stakeholderData: board, C-suite | reasoningConfig(gpt-4,0.3,4000) | reasoning-based | strategy recs, conflict resolution, stakeholder analysis | PARTIAL (design: board/C-suite; code: general advisory) |
| executive-dev-career | Skill-gap analysis, career roadmaps | Advise *(inferred)* | **Schedule** — periodic development-planning cadence | developmentGoals[], careerStage, feedbackData | empty | reasoning-based | gap analysis, improvement plan, roadmap | RESTORED |
| executive-feedback | 360 feedback collection and synthesis | Advise *(inferred)* | **Event** — fired by a 360 feedback submission | feedbackData: 360 responses; stakeholderList[] | empty | reasoning-based | feedback synthesis, themes, recommendations | RESTORED |
| executive-risk-scenario | Scenario modeling for leadership decisions | Advise *(inferred)* | **User** — scenario modeling for a pending decision is requested | scenarioParams: variables; riskTolerance: thresholds | empty | reasoning-based | scenarios, risk assessment, mitigation | RESTORED |

## 4. Legal
**Capability Clusters:** four independent clusters, no wiring between them:
- **Intake & Triage** — `contract-document-advisory-user` (+ `contract-document-advisory-scheduled`)
- **Legal Research** — `legal-research`
- **Document Ops** — `matter-document-ops`
- **Compliance Tracking** — `compliance-tracking-user` (+ `compliance-tracking-scheduled`)

**Domain Knowledge:** Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation
**Persistent Data:** Standard Playbook & Clause Library, Organizational Risk & Security Thresholds, Active Matter Directory, Historical Contract Archives
**Interfaces:** Legal Research APIs, Document Management Systems (Google Drive, SharePoint), E-Signature Platforms (PandaDoc, DocuSign), Compliance/Security Logs
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| contract-document-advisory-user | Review a contract you supply: clause risk assessment and issue list | Advise *(inferred)* | **User** — "review this contract" | contractText, contractType, jurisdiction | empty | reasoning-based | classification, priority, risk flag | SPLIT — the User half. Was Event-triggered on "document or redline received" while requiring contractText that the event does not supply; the trigger over-promised |
| contract-document-advisory-scheduled | Scheduled clause-risk sweep over configured contract stores | Advise *(inferred)* | **Schedule** — weekly contract risk sweep | runReason (optional; scope comes from config) | **required `contractSources`**, optional `tagFilters`, `cadence` | reasoning-based | risk findings per contract, sources scanned | SPLIT — the automated half. Shares the clause heuristics with the User half via `legal/contract-risk-rules.ts` so the two cannot drift. `contractSources` is required so the sweep cannot be configured wide-open |
| legal-research | Statute and case search synthesis | Advise *(inferred)* | **User** — a research question is asked | statuteQuery, topic, jurisdiction | empty | reasoning-based | research synthesis, precedent analysis | RESTORED |
| matter-document-ops | Draft, redline, clause analysis, doc ops | Aid *(inferred)* | **User** — a draft/redline is requested | documentData, operation(draft/redline/clause/finalize) | empty | reasoning-based | documents, redlines, clause comparisons | NON-COMPLIANT — exposes required `operation` field; violates §0.9 |
| compliance-tracking-user | Record a compliance check against a regulation and jurisdiction you choose | Advise *(inferred)* | **User** — "check this against GDPR" | regulation, jurisdiction, effectiveDate, documentText (optional) | empty | reasoning-based | compliance status, risk scorecard | SPLIT — the User half. Reports `documentProvided` honestly and asserts no verdict: no rule engine is wired |
| compliance-tracking-scheduled | Recurring compliance scan across configured sources | Advise *(inferred)* | **Schedule** — monthly compliance audit | runReason (optional; scope comes from config) | **required `sources`**, optional `policySetId`, `scanWindow`, `notifyOn` | reasoning-based | scope reconciliation, controls counted | SPLIT — the automated half. Counts controls rather than evaluating them, and says so; `rulesEvaluated` is 0 until a rule engine lands |

## 5. Sales
**Capability Clusters:** three independent clusters — a plausible narrative order exists ("find leads → outreach → close"), but nothing in `Consumes` wires them together, so they stay parallel:
- **Deal Advisory** — `lead-deal-advisory`
- **Outreach Drafting** — `outreach-drafting`
- **Pipeline Ops** — `pipeline-ops`

**Domain Knowledge:** B2B sales methodologies (MEDDPICC, Challenger), outbound messaging optimization, CRM hygiene standards, pipeline forecasting
**Persistent Data:** Ideal Customer Profile (ICP) definitions, Product Value Frameworks, Target Account Lists, Historical Deal Stages, Objection-Handling Matrices
**Interfaces:** CRM Systems (Salesforce, HubSpot), Sales Engagement APIs (Outreach, Apollo), Enrichment Data (ZoomInfo, Clearbit), Calendar Systems
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| lead-deal-advisory | CRM analysis, deal health, revenue forecast | Advise *(inferred)* | **Schedule** — ongoing deal-health monitoring | prospectData, criteria, history[] | empty | reasoning-based | deal health, stuck deals, forecast | PARTIAL (design: velocity; code: advisory) |
| outreach-drafting | Account dossiers, personas, scripts, outreach | Aid *(inferred)* | **User** — a specific outreach draft is requested | prospectInfo, messageType, context | empty | reasoning-based | dossiers, briefings, scripts, outreach | MISSING (no account brief generation in code) |
| pipeline-ops | Deal stages, status, close tracking | Aid *(inferred)* | **Event** — fired by a stage/status change | dealData, stage, action | empty | reasoning-based | deal records, transitions, forecast | PARTIAL (design: sequences; code: pipeline ops) |

## 6. Event
**Capability Clusters:** three independent clusters:
- **Planning & Budgeting** — `event-planning-budgeting`
- **Vendor & Contract Management** — `event-vendor-contract-management`
- **Day-of Operations** — `event-day-of-operations`

**Domain Knowledge:** Event logistics management, catering operations (BEOs), vendor contract structures, spatial design principles, crowd management timing
**Persistent Data:** Master Event Specs, Budget Ledger, Vendor Directory & Rating History, Guest List & Dietary Matrix, Seating Models
**Interfaces:** Ticketing/RSVP Platforms (Eventbrite, Luma), Payment Gateways (Stripe), Messaging Platforms (Twilio, Email), Floor Plan Tools
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| event-planning-budgeting | Venue/budget/spatial optimization | Advise *(inferred)* | **User** — planning is initiated for a specific event | venueSpecs, budgetData, guestCount | empty | reasoning-based | event plan, venue comparison, budget breakdown | MATCH |
| event-vendor-contract-management | Vendor quotes, contracts, comms | Represent *(inferred)* | **Event** — fired at a contract milestone (renewal, signing date) | vendorData, contractTerms | confirmBeforeSend=true | external APIs | quotes, contracts, comms | PARTIAL (code: vendor; design: guest+vendor) |
| event-day-of-operations | Day-of check-in, seating, ops | Represent *(inferred)* | **Event** — fired by a day-of state change (check-in, etc.) | operation, dateRange, guestList | confirmBeforeSend=true | external APIs | check-ins, seating, event log | NON-COMPLIANT — exposes required `operation` field; violates §0.9 (missed by the prior audit despite matching the identical pattern flagged elsewhere in this same document) |

## 7. Restaurant
**Capability Clusters:** five parallel domains, the clearest example of one Assistant with many unrelated clusters:
- **Menu & Cost** — `restaurant-menu-engineering-cost-strategist`
- **Shift & Prep** — `restaurant-shift-prep-list-copilot`
- **Reservations & Guest** — `restaurant-reservations-guest-profile-manager`
- **Supply Chain** — `restaurant-supply-chain-inventory-reorder-manager`
- **Financial Forecast** — `restaurant-financial-forecast-evaluator`

**Domain Knowledge:** Hospitality metrics (Prime Cost, RevPASH), kitchen operational workflows, food inventory management, reservation flow management, health code baselines
**Persistent Data:** Master Recipe & Ingredient Catalog, Inventory Stock Levels, Vendor Price Lists, POS Sales History, Guest CRM & VIP Profiles, Labor Schedule Rules
**Interfaces:** POS Systems (Toast, Square), Reservation Engines (OpenTable, Resy), Inventory Platforms (Restaurant365, MarketMan), Supplier Ordering Portals (Sysco, US Foods)
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| restaurant-menu-engineering-cost-strategist | Analyze menu profitability and recommend pricing *(derived)* | Advise | **Schedule** — ongoing profitability monitoring | menuId, items(name,popularity,cost,price), profitabilityGoals | empty | restaurant-menu-recipe | menu matrix, pricing recs | MATCH |
| restaurant-shift-prep-list-copilot | Generate daily shift prep checklists and assignments *(derived)* | Aid | **Schedule** — daily prep-list generation | dateRange, station, role, forecastData | empty | kitchen-ops, staffing-labor | prep checklist, shift assignments | MATCH |
| restaurant-reservations-guest-profile-manager | Manage reservations and guest profiles *(derived)* | Represent | **Event** — fired by a reservation request | operation, partySize, guestName, tableId, status, channel | confirmBeforeSend=true | external reservation API | bookings, guest profiles | NON-COMPLIANT — exposes required `operation` field; violates §0.9 (missed by the prior audit despite matching the identical pattern flagged elsewhere in this same document) |
| restaurant-supply-chain-inventory-reorder-manager | Draft purchase orders when inventory crosses a reorder threshold *(derived)* | Represent | **Event** — fired by inventory crossing a defined reorder threshold (a state condition, not a clock) | item, quantity, supplier | empty | supply-chain | PO drafts, inventory status | MATCH |
| restaurant-financial-forecast-evaluator | Produce P&L analysis and financial forecasts *(derived)* | Advise | **Schedule** — periodic forecasting | dateRange, metric, department | empty | financial-advisory | P&L analysis, forecasts | IMPLEMENTED (design said gap but code exists) |

## 8. Content
**Capability Clusters:** one cluster, plausibly sequential per item. **Wiring status: unverified** — the sequential claim (strategy → draft → publish) has not been confirmed against actual `Consumes`/`Produces` code; check `content/index.ts` before relying on it (§2).
- **Content Production** — `content-strategy-seo-evaluator` → `editorial-calendar-article-copilot` → `governed-publishing-cms-dispatcher`

**Domain Knowledge:** SEO content architectures, search engine algorithms, content marketing conversion funnels, editorial style guides (AP, Chicago)
**Persistent Data:** Content Style Guide, SEO Keyword Map, Publishing Schedule, Channel Performance Analytics
**Interfaces:** CMS Platforms (WordPress, Ghost, Medium), SEO Tools (Ahrefs, Semrush), Analytics (Google Analytics 4)
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| content-strategy-seo-evaluator | Evaluate content performance and surface SEO/keyword gaps *(derived)* | Advise | **Schedule** — ongoing content-performance monitoring | contentItems, metrics, dateRange | empty | content-performance-seo | strategy recs, keyword gaps | MATCH |
| editorial-calendar-article-copilot | Draft articles and calendar entries from strategy gaps *(derived)* | Aid | **Event** — fired by strategy output (keyword gaps identified); **edge unverified, see above** | topics(title,audience,intent,format,keywords,tone,length) | empty | content-drafting-adaptation | drafted content, calendar entries | MATCH |
| governed-publishing-cms-dispatcher | Publish approved content to configured channels *(derived)* | Represent | **Event** — fired when a draft is completed/approved; **edge unverified, see above** | channel, contentId, title, dryRun, confirmation | endpointUrl+token(required) — legitimate per §0.6, no universal default exists | content-multi-channel-publishing | published content, dispatches | EXTRA (Represent tier) |

## 9. Songwriter
**Capability Clusters:**
- **Trend Research** — `songwriter_genre_trend_evaluator`
- **Creative Production** — `songwriting_lead_sheet_demo_dispatcher`, `songwriting_musical_lyric_cocreation`
- **Prosody Evaluation** — `songwriting_lyric_prosody_evaluator`

Trend research plausibly informs creative production but is not shown as wired to it — kept as a separate cluster.

**Domain Knowledge:** Music theory, prosody rules, songwriting structural frameworks (AABA, Verse-Chorus-Bridge), lyric metrics and stress analysis
**Persistent Data:** Lyric Sketchbook, Genre Style Bibles, Song Idea Archive, Copyright/Registration Records
**Interfaces:** Digital Audio Workstation (DAW) metadata tools, Lead Sheet PDF export tools, Copyright registration portals
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| songwriter_genre_trend_evaluator | Monitor genre and market trends *(derived)* | Advise | **Schedule** — periodic trend monitoring | genre, market, timeframe, provider | endpointUrl+apiKey+provider(enum) | external intel | trend report | RESTORED |
| songwriting_lead_sheet_demo_dispatcher | Produce lead sheets and charts on request *(derived)* | Aid | **User** — a lead sheet is requested | format, theme, genre, mood | empty | creative_drafting | lead sheets, charts | EXTRA |
| songwriting_musical_lyric_cocreation | Co-create lyrics, chord progressions, and beat sheets *(derived)* | Aid | **User** — co-creation is requested | theme, mood, structure, topic, duration | empty | creative_drafting | chord progressions, beat sheets | MATCH |
| songwriting_lyric_prosody_evaluator | Evaluate lyric meter, rhyme, and stress for structural improvements *(derived)* | Advise | **User** — prosody is requested; `lyrics` is supplied by the person **(reassigned from Event — see 0.14)** | lyrics, meter, rhyme, stress | empty | reasoning-based | structural improvements | MATCH |

## 10. Scriptwriter
**Capability Clusters:** one cluster, plausibly sequential — of every Assistant in this document, the research → theme → outline → characters → draft narrative applies most literally here. **Wiring status: unverified**, same caveat as Content (§2, §8) — check `scriptwriter/index.ts` before relying on the sequential claim.
- **Script Production** — `scriptwriting-genre-market-evaluator-user` (+ `scriptwriting-market-report-scheduled`) → `scriptwriting-scene-beat-dialogue-copilot` → `scriptwriting-narrative-arc-pacing-evaluator` → `scriptwriting-script-formatting-submission-manager`

**Domain Knowledge:** Screenwriting standards (Final Draft/Fountain format), narrative theory (Save the Cat, Hero's Journey), dialogue subtext principles, film/TV pacing
**Persistent Data:** Screenplay Drafts, Character Bibles, World/Setting Guides, Scene Breakdown Logs
**Interfaces:** Scriptwriting Software Formats (Fountain, Final Draft), Pitch Deck Platforms
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| scriptwriting-narrative-arc-pacing-evaluator | Evaluate pacing and structure of drafted scenes *(derived)* | Advise | **User** — a pacing review is requested; `script` is supplied by the person **(reassigned from Event — see 0.14)** | scriptText, structure, actConfig | empty | reasoning-based | rewrite recs, pacing assessment | MATCH |
| scriptwriting-scene-beat-dialogue-copilot | Draft scene beats and dialogue *(derived)* | Aid | **User** — drafting is requested | sceneData, characters, dialogue | empty | creative_drafting | beat sheets, loglines | MATCH |
| scriptwriting-genre-market-evaluator-user | Evaluate a script or outline against genre craft conventions *(derived)* | Advise | **User** — "is this ready for the market?" | genre, script, topic, targetFormat | endpointUrl+apiKey | external intel | genre fit, structural readiness | SPLIT — the User half. Was Schedule-triggered while requiring a genre and a script that had not been written yet |
| scriptwriting-market-report-scheduled | Recurring per-genre and per-region market report | Advise | **Schedule** — monthly genre market report | runReason (optional; scope comes from config) | **required `genres`**, optional `regions`, `cadence` | local project records only | per-genre demand tally | SPLIT — the automated half. Builds its report from stored project records and sets `externalDataFetched: false`, because a market report that reads as chart data it does not have is worse than no report |
| scriptwriting-script-formatting-submission-manager | Format and prepare finished scripts for submission *(derived)* | Represent | **Event** — fired when a script is finalized/approved; **edge unverified, see above** | format, content, submissionTarget | empty | formatting tools | formatted scripts | EXTRA |

## 11. Sports — dual-group, isolated (DEC-010)
**Capability Clusters:** two explicitly isolated groups, with no cross-feeding — separate persistent data, separate interfaces, enforced, not just documented:
- **Performance Group** — `sports-tactical-roster-evaluator`, `sports-battlecard-creator`, `sports-scouting-alert-dispatcher`
- **Wagering Group** — `sports-matchup-odds-explainer`, `sports-bankroll-co-pilot`, `sports-line-alert-dispatcher`

⚠️ **Missing:** In-Game & Predictive Modeling — not in code.

**Domain Knowledge:** Advanced sports analytics (xG, PER, EPA), bankroll management mathematics, implied probability, line movement analysis
**Persistent Data:** Group A (Performance): Roster Telemetry, Scouting Archives, Tactical Playbooks. Group B (Wagering): User Bankroll Rules, Unit Limits, Line Alert Specs.
**Interfaces:** Group A: Sports Data APIs (StatsPerform, Opta), Wearable Telemetry. Group B: Odds Data APIs. Sportsbook Account APIs explicitly excluded from both.
**Domain KB Delivery:** TBD

**Performance Group:**
| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| sports-tactical-roster-evaluator | Recommend tactical adjustments ahead of a match *(derived)* | Advise | **Event** — fired by the match calendar entering the pre-match window | playerMetrics, opponentData | empty | reasoning-based | tactical adjustments | MATCH |
| sports-battlecard-creator | Produce opponent scout reports *(derived)* | Aid | **Event** — same pre-match condition | opponentData, matchupInfo | empty | reasoning-based | scout reports | MATCH |
| sports-scouting-alert-dispatcher | Dispatch tactical alerts on player state changes *(derived)* | Represent | **Event** — fired by a player health/transfer state change | playerData, alertSpecs | empty | reasoning-based | tactical alerts | MATCH |

**Wagering Group:**
| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| sports-matchup-odds-explainer | Explain matchup odds and market analysis *(derived)* | Advise | **Event** — fired by odds becoming available / line movement | oddsData, marketData | empty | reasoning-based | matchup analysis | MATCH (responsible-play required) |
| sports-bankroll-co-pilot | Check bankroll sizing against user limits *(derived)* | Aid | **Schedule** — periodic bankroll check | bankrollRules, unitLimits, exposure | empty | reasoning-based | sizing analysis | MATCH |
| sports-line-alert-dispatcher | Dispatch contextualized line-movement alerts *(derived)* | Represent | **Event** — fired by line movement | lineData, bankrollState | empty | reasoning-based | contextualized alerts | MATCH (barred from sportsbook) |
| sports-predictor-ad-hoc | Produce in-game win probability for a matchup you name | Advise | **User** — "model this game right now" | event, sport, gameStatus, playByPlay | empty | reasoning-based | predictions | SPLIT — the ad-hoc half. Was Event-triggered **and** `isSkill: false`, so it was neither automated nor user-runnable: a working predictor invisible in the user's Skill list. Now user-triggered and `isSkill: true` (§0.3) |
| sports-ingame-predictive-modeling-scheduled | Report win-probability movement for the configured scope only | Advise | **Schedule** — every 5 min within configured windows | runReason (optional; scope comes from config) | **`anyOf`: `matchIds` \| `teams` \| `sports`**, optional `dateRange`, `cadence` | local live-games store | scoped predictions and deltas | SPLIT — the automated half. The `anyOf` is the scope guard: the original had no config at all, so nothing stopped it ranging over every live game. Refuses to run when no selector resolves, and reports `delta: null` for a game it has not seen before rather than inventing movement |

## 12. Finance
**Capability Clusters:** four independent clusters:
- **Modeling & Analysis** — `finance-modeling-analysis`
- **Risk & Regulatory** — `risk-regulatory-advisory`
- **Budget Tracking** — `budget-tracking`
- **Reporting & Data Ops** — `reporting-data-ops` (⚠️ not yet implemented)

**Domain Knowledge:** Corporate finance principles, US GAAP/IFRS standards, financial modeling, capital allocation strategies
**Persistent Data:** General Ledger Records, Chart of Accounts, Operating Budget Models, Historical BVA Data, Board Reporting Templates
**Interfaces:** Accounting ERPs (NetSuite, QuickBooks, Xero), Banking APIs, Financial Modeling Engines
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| finance-modeling-analysis | Produce financial models *(derived)* | Advise | **Schedule** — periodic model refresh | modelType, scenarioParams | empty | reasoning-based | financial models | PARTIAL |
| risk-regulatory-advisory | Assess financial and regulatory risk *(derived)* | Advise | **Schedule** — periodic risk/regulatory monitoring | riskParams, regulatoryUpdates | empty | reasoning-based | risk assessment | RESTORED |
| budget-tracking | Track budget vs. actuals *(derived)* | Represent | **Schedule** — periodic budget-vs-actual monitoring | budgetData, actuals | empty | reasoning-based | BVA models, summaries | PARTIAL |
| reporting-data-ops | Produce financial reports *(derived)* | Represent | **Schedule** — periodic reporting | reportType, dataRange | empty | reasoning-based | financial reports | MISSING |

## 13. Wealth
**Capability Clusters:**
- **Data & Research** — `investment-market-data`, `research-planning`
- **Portfolio Management** — `portfolio-risk-advisory`, `bill-pay-rebalancing`

**Domain Knowledge:** Modern Portfolio Theory (MPT), tax-efficient withdrawal strategies, personal cash flow management, asset location rules
**Persistent Data:** Personal Net Worth Ledger, Asset Allocation Targets, Recurring Expense Rules, Tax Profile, Personal Financial Goals
**Interfaces:** Personal Financial Aggregators (Plaid), Brokerage APIs (Alpaca, Interactive Brokers), Bank Feeds
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| investment-market-data | Fetch and refresh market data *(derived)* | Represent | **Schedule** — periodic market data refresh | securities, marketParams | endpointUrl+apiKey+provider | external APIs | market data | RESTORED (closest to production) |
| portfolio-risk-advisory | Assess portfolio drift and recommend rebalancing *(derived)* | Advise | **Event** — fired by a market-data update revealing drift | portfolioData, riskTolerance | empty | reasoning-based | risk, drift, rebalancing | RESTORED |
| bill-pay-rebalancing | Pay recurring bills and rebalance holdings *(derived)* | Represent | **Schedule** — recurring bill cycle | obligations, amounts | confirmBeforeSend | reasoning-based | payments, rebalancing | MATCH |
| research-planning | Produce investment research reports *(derived)* | Aid | **User** — research is requested | portfolioData | empty | reasoning-based | research reports | EXTRA |

## 14. Healthcare
**Capability Clusters:**
- **Practice Operations** — `healthcare-clinical-practice-workflow-evaluator`, `healthcare-appointment-patient-intake-dispatcher`
- **Clinical Support** — `healthcare-clinical-decision-support-evaluator`, `healthcare-patient-care-plan-educational-briefing-copilot`
- **Referral Coordination** — `care-resource-referral-coordinator`

**Domain Knowledge:** Practice management workflows, evidence-based clinical guidelines, HIPAA compliance rules, medical billing/coding cycles
**Persistent Data:** Practice Operational Templates, Patient Communication Rules, Provider Schedule Models, Evidence-Based Clinical Guidelines
**Interfaces:** EHR/EMR Platforms (Epic, AthenaHealth), Telehealth Gateways, Secure HIPAA-Compliant SMS/Email Gateways
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| healthcare-clinical-practice-workflow-evaluator | Evaluate practice workflow efficiency *(derived)* | Advise | **Schedule** — ongoing workflow monitoring | practiceData, metrics | empty | reasoning-based | workflow assessment | MATCH |
| healthcare-clinical-decision-support-evaluator | Produce differential diagnosis support for a specific case *(derived)* | Advise | **User** — support requested for a specific case | patientData, symptoms, guidelines | empty | reasoning-based | differential diagnoses | MATCH |
| healthcare-patient-care-plan-educational-briefing-copilot | Draft care plans and patient education materials *(derived)* | Aid | **User** — a care plan is requested | patientProfile, objectives | empty | reasoning-based | care plans, materials | MATCH |
| healthcare-appointment-patient-intake-dispatcher | Process intake forms and send appointment reminders *(derived)* | Represent | **Event** — fired by an intake form submission / appointment state change | appointmentData, intakeForm | empty | fetch_ehr_appointments, parse_intake_forms | reminders, intake processing | MATCH |
| care-resource-referral-coordinator | Coordinate and produce patient resource referrals *(derived)* | Represent | **User** — a referral is requested | resourceType, patientNeed | empty | resource_coordination | referrals | RESTORED |

## 15. Hotel
**Capability Clusters:**
- **Guest Management** — `hotel-guest-experience`, `hotel-reservations-guest-profile`
- **Revenue Advisory** — `hotel-revenue-performance-advisory`
- **Property Operations** — `hotel-maintenance-dispatcher`

**Domain Knowledge:** Hotel metrics (ADR, RevPAR, GOPPAR), PMS operations, guest service standards, yield management, hotel maintenance triage
**Persistent Data:** Property Management System (PMS) Records, Guest Profiles & Preferences, Local Concierge Directory, Maintenance Log, Amenity Inventory
**Interfaces:** Property Management Systems (Opera, Cloudbeds), Maintenance Tracking Tools, Channel Managers, Guest Messaging Systems
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| hotel-revenue-performance-advisory | Recommend pricing from ADR/RevPAR performance *(derived)* | Advise | **User** — a property's revenue is reviewed on request; `propertyId` is supplied by the person **(reassigned from Schedule — see 0.14)** | adr, revpar, occupancy, laborCost | empty | reasoning-based | revenue recs, pricing | MATCH |
| hotel-guest-experience | Respond to guest service requests *(derived)* | Aid | **Event** — fired by a guest service request | guestProfile, serviceRequests | empty | reasoning-based | concierge KB, responses | MATCH |
| hotel-reservations-guest-profile | Manage reservations and loyalty profiles *(derived)* | Represent | **Event** — fired by a reservation request | operation, partySize, guestName, status, channel | confirmBeforeSend=true | external API | bookings, loyalty | NON-COMPLIANT — exposes required `operation` field; violates §0.9 (missed by the prior audit despite the identical pattern being caught one row below on `hotel-maintenance-dispatcher`) |
| hotel-maintenance-dispatcher | Dispatch maintenance and operations orders *(derived)* | Represent | **User** — a fault is reported; `entity`/`issue` supplied by the person | entity, roomStatus, maintenanceTask, issue | confirmBeforeSend | external API | dispatch orders | RENAMED — design called this `hotel-maintenance-dispatcher`, which does not exist in code; the maintenance/ops half is implemented here, and `hotel-room-status-manager`, `hotel-housekeeping-manager` and `hotel-inventory-manager` are separate rows below |
| hotel-room-status-manager | Track room occupancy and housekeeping status | Represent | **User** — room status is updated | roomId, status, notes | confirmBeforeSend | external PMS | room status | NOT IN DESIGN — added to match code |
| hotel-housekeeping-manager | Assign and schedule housekeeping | Represent | **User** — housekeeping is dispatched or a room is marked clean | roomId, assignee, status | confirmBeforeSend | external PMS | housekeeping rounds | NOT IN DESIGN — added to match code |
| hotel-inventory-manager | Track hotel inventory and reorder thresholds | Represent | **User** — stock is checked or adjusted | item, quantity, threshold | confirmBeforeSend | external PMS | inventory status | NOT IN DESIGN — added to match code |

## 16. Education
**Capability Clusters:**
- **Learner Insight** — `education-learner-insight` → `education-adaptive-personalization` (real producer/consumer edge: `adaptive_personalization` explicitly consumes `learner-insight`'s output, the cleanest evidenced sequential case in this document). Note: a placeholder config bug on `education-adaptive-personalization` needs fixing before this cluster clears §1.
- **Assessment** — `education-lesson-assessment-drafting-user` (+ `education-lesson-assessment-drafting-scheduled`)
- **Resource Library** — `education-resource-library` (design intended one skill; code has it split into two — reconcile)

**Domain Knowledge:** Pedagogical frameworks (Bloom's Taxonomy, Spaced Repetition), curriculum design, assessment scoring methods, student engagement metrics
**Persistent Data:** Curriculum Standards & Rubrics, Student Performance History, Knowledge Gap Maps, Course Material Libraries
**Interfaces:** Learning Management Systems (Canvas, Blackboard, Moodle), Assessment Platforms, Student Information Systems (SIS)
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| education-learner-insight | Monitor learner data via LMS integration *(derived)* | Advise | **Schedule** — periodic learner-data monitoring | learnerData, lmsConnection | endpointUrl+apiKey | external LMS API | learner profiles | RESTORED |
| education-adaptive-personalization | Personalize learning paths from learner insight *(derived)* | Advise | **User** — a learner is submitted for personalisation; `learner` is supplied by the person (reassigned from Event per §0.14) | learner, insightData, courseContext, teacherGoals | empty | education-learner-insight | learning paths | SPLIT — trigger reassigned for reachability. The `placeholder bug` this row previously recorded: the handler does read its `learner` input (verified during the trigger audit), but the deeper placeholder concern was not re-examined, so do not read this as that bug being closed |
| education-lesson-assessment-drafting-user | Draft a lesson, quiz, activity, or content unit from the subject and topic you give it | Represent | **User** — "draft a lesson plan on fractions" | task, subject, topic, grade, duration | empty | spaced-repetition | drafted unit, store path | SPLIT — the User half. Was Event-triggered on "a submission is received for grading" while requiring task/subject/topic that a grading event does not supply. An unrecognised `task` now returns an explicit error instead of a bare `return`, which emitted no output envelope at all |
| education-lesson-assessment-drafting-scheduled | Find configured courses with no assessment drafted and fill the gap | Represent | **Schedule** — weekly assessment gap sweep | runReason (optional; scope comes from config) | **required `courseId`**, optional `gradeLevels`, `cadence` | local course store | courses swept, gaps filled | SPLIT — the automated half. Every generated draft is flagged `requiresTeacherReview: true`, because a placeholder outline from course metadata is not a teacher-reviewed assessment |
| education-resource-library | Curate learning resources *(derived)* | Aid | **User** — resources are requested | subject, level, accessibility | empty | resource-lib | curated resources | SPLIT (design=1 skill, code=2) |

## 17. Support
**Capability Clusters:**
- **Ticket Lifecycle** — `support-resolve-ticket` (+ 3 sibling Skills) → `response-drafting-user` (+ `response-drafting-notifier`) → `ticket-ops`, sequential per ticket, concurrent across tickets — the clearest illustration in this document of "sequential per instance, not single-stream for the Assistant"
- **Analytics & Planning** — `analytics-planning`

**Domain Knowledge:** Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage
**Persistent Data:** Product Knowledge Base, Account Health Profiles, Support Escalation Protocols, Historical Ticket Log
**Interfaces:** Helpdesk Platforms (Zendesk, Intercom, Freshdesk), Product Analytics (Mixpanel, Amplitude), CRM Systems
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| support-resolve-ticket | Resolve and summarise a support ticket | Advise | **User** — a ticket is pasted for resolution | ticket, issue | empty | reasoning-based | resolution | SPLIT — design had one `support-resolve-ticket` (+ 3 sibling Skills); code splits it into the four rows below |
| support-sentiment-analysis | Read customer sentiment from a message | Advise | **User** — a message is submitted for scoring | text, source | empty | reasoning-based | sentiment score | SPLIT (as above) |
| support-issue-analysis | Group and diagnose issues from an issue description | Advise | **User** — an issue is submitted for analysis | issueText, customerInfo, analysisType | empty | reasoning-based | issue analysis | SPLIT (as above) |
| support-search-kb | Search the knowledge base for an issue | Advise | **User** — a search is requested | query | empty | resource-lib | knowledge-base hits | SPLIT (as above) |
| response-drafting-user | Draft a reply to a customer message you supply | Aid | **User** — "draft a reply to this customer" | customerMessage, ticket, tone, template, includeKB | empty | query_knowledge_base | responses, plans | SPLIT — the User half. The trigger was the clearest instance of the §0.14 defect: **Event** on `support-resolve-ticket`'s classification, while *requiring* `customerMessage`, which a classification output does not supply |
| response-drafting-notifier | Draft replies for queued inbound messages and notify configured channels | Aid | **Schedule** — every 15 minutes | runReason (optional; scope comes from config) | **required `eventTypes`**, optional `targetChannels`, `templateId` | local queue stores | drafted replies, drained/skipped counts | SPLIT — the automated half. Shares the reply composer with the User half via `support/response-drafting-shared.ts`. Counts unparseable queue entries as `skipped` so a queue full of junk cannot report a clean run |
| ticket-ops | Update ticket status and route escalations *(derived)* | Represent | **Event** — fired by a response/status change | ticketId, status, routingTarget | empty | update_helpdesk_status | status, escalations | MATCH |
| analytics-planning | Review CSAT and support analytics *(derived)* | Advise | **Schedule** — periodic CSAT/analytics review | metrics, timeRange | empty | calculate_csat_score | analytics reports | RESTORED |

## 18. HR
**Capability Clusters:**
- **Recruiting Pipeline** — `hr-screen-resume`, `hr-assess-candidate`, `hr-draft-jd-interview-kit`, `hr-interview-scheduling-user`, `hr-interview-scheduling-automated` (these last two also replace the removed `hr-schedule-interview`)
- **Analytics & Compliance** — `hr-hiring-analytics`, `hr-compliance-check`

All three are real, implemented, design-matched Skills. The open item is confirming each is not still running stub logic, then exposing them — not building anything from scratch.

**Domain Knowledge:** Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)
**Persistent Data:** Organizational Chart, Job Description Library, Compensation Band Benchmarks, Candidate Pipeline Records
**Interfaces:** Applicant Tracking Systems (Greenhouse, Lever), HRIS Systems (Rippling, BambooHR), Calendar APIs
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| hr-screen-resume | Screen a resume for role fit | Advise | **User** — a resume is submitted | resumeText, jobRequirements | confirmBeforeSend=true | HR_SCREENING_ENDPOINT | screening scores | SPLIT — design called this `hr-screen-resume`, `hr-assess-candidate`; code implements screening and assessment as two Skills |
| hr-assess-candidate | Score a candidate against a role | Represent | **User** — a candidate is submitted for assessment | resumeText, candidateName, assessmentData | confirmBeforeSend=true | HR_SCREENING_ENDPOINT | assessments | SPLIT (as above); reassigned from Event per §0.14 |
| hr-draft-jd-interview-kit | Draft JDs and interview kits | Aid | **User** — a JD or scorecard is requested | role, level, competencies | confirmBeforeSend=true | reasoning-based | JD, interview kit | SPLIT — design called this `hr-draft-jd-interview-kit`, `hr-trigger-interview-scheduling`, which bundled a User-triggered JD builder with an Event-triggered scheduler (§6); the User half is this row |
| hr-interview-scheduling-user | Book an interview you are scheduling by hand | Aid | **User** — "schedule an interview for this candidate" | data, dryRun, confirmation | confirmBeforeSend=true | HR_RECRUITING_ENDPOINT | scheduled interviews | SPLIT (as above); the User half |
| hr-interview-scheduling-automated | Schedule interviews for candidates that pass screening, against configured policy | Aid | **Event** — fired by a candidate passing screening | candidate (opaque payload), dryRun, confirmation | confirmBeforeSend=true, **required `calendarId`**, optional `roundTypes`, `timeWindowRules` | HR_RECRUITING_ENDPOINT | scheduled interviews, local `scheduling` record | SPLIT (as above); the Event half. `roundTypes` lives in config rather than input, so a screening event cannot book a round the operator did not enable. The payload is passed through opaquely to keep raw internal IDs out of the user-facing schema. Also absorbs `hr-schedule-interview`, which claimed the same Event trigger for the same job and is the one remaining interview scheduler |
| ~~hr-schedule-interview~~ | — | — | **Event** — "Candidate passed screening" | candidateName | confirmBeforeSend=true | HR_SCREENING_ENDPOINT | scheduling record | **REMOVED 2026-10-01** — duplicated `hr-interview-scheduling-automated`: same Event trigger, same job, same `interview` stage, and never bound to the HR Assistant, so it was unreachable. Its one unique behaviour, a durable local `scheduling` record written on success, now lives in the automated half. Two Skills cannot both own one trigger (§0.14), so the pair replaces it |
| hr-compliance-check | Report hiring compliance checks | Advise | **Schedule** — periodic compliance audit | dateRange, data, filters | HR_HOME | reasoning-based | compliance checks | SPLIT — design called this `hr-hiring-analytics`, `hr-compliance-check`, which merged two distinct Skills (§6) |
| hr-hiring-analytics | Report hiring metrics | Advise | **Schedule** — periodic hiring pipeline report | dateRange, data, filters | HR_HOME | reasoning-based | metrics, reports | SPLIT — see `hr-compliance-check` |

## 19. Product
**Capability Clusters:**
- **Planning** — `create-roadmap`, `write-prd`
- **Analytics** — `product-data-analysis-user` (+ `product-insights-scheduled`)
- **Delivery Sync — not yet a cluster (open consolidation debt, §6):** `product-jira`, `product-confluence`, `product-slack`, `product-calendar`, `product-markdown-parsing` remain five unconsolidated fragments. Must not reach general availability individually — build one orchestrating Skill on top of them first.

**Domain Knowledge:** Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation
**Persistent Data:** Product Vision & Strategy Docs, Feature Backlog, User Persona Models, Competitor Capability Matrix
**Interfaces:** Project Management Tools (Jira, Linear), Product Analytics (Mixpanel, Pendo), Feedback Systems (Canny, UserVoice), Documentation (Confluence, Notion)
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| create-roadmap | Produce a prioritized roadmap *(derived)* | Advise | **User** — a roadmap update is requested | initiatives, strategyDocs | empty | reasoning-based | prioritized roadmap | MATCH |
| write-prd | Draft PRDs and user stories *(derived)* | Aid | **User** — a PRD is requested for a specific requirement | requirements, userStories | empty | reasoning-based | PRDs, user stories | MATCH |
| product-data-analysis-user | Analyze a metric you name, on demand *(derived)* | Advise | **User** — a metric is requested; `metric` is supplied by the person | metric, dimensions, filters, startDate, endDate | baseUrl+apiToken | PRODUCT_ANALYTICS_API_URL | analysis results | SPLIT — the User half. Was Event-triggered on "a product launch or release event" while requiring a `metric` the event does not supply |
| product-insights-scheduled | Recurring metrics sweep over the configured metrics and segments | Advise | **Schedule** — hourly metrics sweep | runReason (optional; scope comes from config) | **required `metrics`**, optional `segments`, `cadence`, `thresholds` | PRODUCT_ANALYTICS_API_URL | per-metric results | SPLIT — the automated half. Reports `partial` with the unreachable metric names rather than a clean sweep when a query fails |
| (product-jira, product-confluence, product-slack, product-calendar, product-markdown-parsing) | Represent backlog sync *(fragments, no unified description)* | Represent | — | — | — | — | — | SPLIT across 5 (no single orchestrator) — see §6 |

## 20. Marketing
**Capability Clusters:**
- **Campaign Planning** — `plan-campaign`, `analyze-performance`
- **Research** — `marketing-market-research`, `marketing-audience-insights` ("2 skills for 1 design" — reconcile)
- **SEO** — `marketing-seo`
- **Execution — not yet a cluster (open consolidation debt, §6):** `marketing-content-generation`, `marketing-social-media`, `marketing-email` are each "SPLIT (1 of 3)" — three fragments of one intended execution Skill. Consolidate before exposing individually.

**Domain Knowledge:** Performance marketing dynamics, multi-touch attribution, copywriting frameworks (AIDA, PAS), conversion rate optimization (CRO)
**Persistent Data:** Brand Positioning Guidelines, Target Audience Personas, Channel Performance Benchmarks, Campaign Asset Repository, Ad Spend Budgets
**Interfaces:** Ad Platforms (Meta Ads, Google Ads), Marketing Automation (HubSpot, Marketo), Analytics (GA4), PR Distribution Networks (if media fallback used)
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| plan-campaign | Produce a campaign plan *(derived)* | Advise | **User** — a campaign plan is requested | campaignName, budget, channels | empty | reasoning-based | campaign plan | MATCH |
| analyze-performance | Review campaign performance *(derived)* | Advise | **Schedule** — periodic performance monitoring | metrics, channel, dateRange | empty | reasoning-based | performance reports | MATCH |
| marketing-content-generation | Generate ad copy and content sequences *(derived)* | Aid | **Event** — fired by a content brief | contentType, contentData | confirmBeforeSend | CMS endpoint | ad copy, sequences | SPLIT (1 of 3) — see §6 |
| marketing-analysis-user | Dispatch an ad-hoc marketing operation to one channel | Represent | **User** — "draft this campaign for social" | targetChannel, data | confirmBeforeSend | marketing-* (7 lower-order tools) | dispatched campaign content | SPLIT + RENAME — was `marketing-center`, Event-triggered on a "delivery sync event" while requiring a `targetChannel` the sync event does not carry. An unknown channel now returns an explicit error instead of a bare `return` that emitted no output envelope |
| marketing-reports-scheduled | Recurring campaign report across configured campaigns and channels | Advise | **Schedule** — weekly campaign report | runReason (optional; scope comes from config) | **required `campaignIds`**, optional `channels`, `reportCadence` | marketing-market-research (lower-order) | per-campaign report | SPLIT — the automated half of the marketing-center decomposition. Reports `partial` naming the campaigns it could not report on |
| marketing-social-media | Schedule and post social content *(derived)* | Represent | **Schedule** — posts run on a configured cadence | platform, message, schedule | confirmBeforeSend | social APIs | scheduled posts | SPLIT (1 of 3) — see §6 |
| marketing-seo | Audit SEO performance *(derived)* | Aid | **Schedule** — periodic SEO audit | url, keywords | empty | SEO API | audit reports | EXTRA |
| marketing-market-research | Produce market research reports *(derived)* | Aid | **User** — specific research is requested | researchQuery, scope | empty | research API | market reports | RESTORED |
| marketing-audience-insights | Segment and profile audiences *(derived)* | Aid | **Schedule** — ongoing audience monitoring | audienceParams | empty | analytics API | segments, personas | RESTORED (2 skills for 1 design) |
| marketing-email | Send email campaigns *(derived)* | Represent | **Event** — fired when campaign content is ready to send | campaignData, recipients | confirmBeforeSend | email API | campaigns, sends | SPLIT (1 of 3) — see §6 |

## 21. Analytics
**Capability Clusters:**
- **Business Insight Reporting** — `analytics-adhoc-query-evaluator`, `analytics-scheduled-trend-monitor` only. `analytics-grounded-reporting` and `analytics-warehouse-query` are wrapper duplicates with no distinct value — deprecate, don't cluster them as if they were separate capabilities.

**Domain Knowledge:** Business intelligence architectures, SQL/data modeling principles, statistical trend analysis, cross-functional KPI frameworks
**Persistent Data:** Data Warehouse Schema Mappings, Metric Definitions & KPI Dictionary, Historical Query Cache
**Interfaces:** Data Warehouses (Snowflake, BigQuery), BI Tools (Looker, Tableau, Metabase)
**Domain KB Delivery:** TBD

| ID | Description | Tier | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|---|
| analytics-adhoc-query-evaluator | Answer an ad hoc business question on demand | Advise | **User** — a question is asked | metric, question, filters, dateRange | endpointUrl+apiKey+provider | warehouse | insights, results | SPLIT — design called this `analytics-adhoc-query-evaluator`, `analytics-scheduled-trend-monitor`, whose `mode` spanned an ad hoc query (User) and trend monitoring (Schedule) and so could not resolve to one honest trigger (§6); this is the User half |
| analytics-scheduled-trend-monitor | Monitor chosen metrics on a schedule | Advise | **Schedule** — periodic trend monitoring | metric, dataset, period, query, provider | endpointUrl+apiKey+provider | warehouse | trends | SPLIT (as above); the Schedule half |
| ~~analytics-grounded-reporting~~ | — | — | — | — | — | — | — | NOT IN CODE — deprecated per §6. The real Skill is `analytics-adhoc-query-evaluator` above |
| ~~analytics-warehouse-query~~ | — | — | — | — | — | — | — | NOT IN CODE — deprecated per §6 |

---

# Part C — Summary

| Assistant | Clusters | Skills | Open Items |
|---|---:|---:|---|
| CTO | 4 | 6 | Domain KB delivery TBD; tier values inferred, verify |
| Career | 5 | 10 | Domain KB delivery TBD; tier values inferred, verify |
| Executive | 4 | 4 | 2 Skills missing entirely; Domain KB delivery TBD; tier values inferred, verify |
| Legal | 4 | 4 | `matter-document-ops` still exposes `operation`; Domain KB delivery TBD; tier values inferred, verify |
| Sales | 3 | 3 | `outreach-drafting` missing account-brief generation; Domain KB delivery TBD; tier values inferred, verify |
| Event | 3 | 3 | `event-day-of-operations` exposes `operation` (newly flagged); Domain KB delivery TBD; tier values inferred, verify |
| Restaurant | 5 | 5 | `restaurant-reservations-guest-profile-manager` exposes `operation` (newly flagged); descriptions derived, verify; Domain KB delivery TBD |
| Content | 1 | 3 | Sequential wiring unverified (§2); descriptions derived, verify; Domain KB delivery TBD |
| Songwriter | 3 | 4 | Descriptions derived, verify; Domain KB delivery TBD |
| Scriptwriter | 1 | 4 | Sequential wiring unverified (§2); descriptions derived, verify; Domain KB delivery TBD |
| Sports | 2 (isolated) | 6 | In-Game/Predictive Modeling missing; descriptions derived, verify; Domain KB delivery TBD |
| Finance | 4 | 4 | `reporting-data-ops` not implemented; descriptions derived, verify; Domain KB delivery TBD |
| Wealth | 2 | 4 | Descriptions derived, verify; Domain KB delivery TBD |
| Healthcare | 3 | 5 | Descriptions derived, verify; Domain KB delivery TBD |
| Hotel | 3 | 4 | Both `hotel-reservations-guest-profile` (newly flagged) and `hotel-maintenance-dispatcher` expose `operation`; descriptions derived, verify; Domain KB delivery TBD |
| Education | 3 | 4 | Placeholder config bug on `adaptive_personalization`; resource-library split reconciliation; descriptions derived, verify; Domain KB delivery TBD |
| Support | 2 | 4 | Descriptions derived, verify; Domain KB delivery TBD |
| HR | 2 | 5 | interview-scheduling split **resolved** into `hr-interview-scheduling-user` / `hr-interview-scheduling-automated` (§6), which together also replace the duplicate `hr-schedule-interview`; descriptions derived, verify; Domain KB delivery TBD |
| Product | 2 + 1 unconsolidated | 3 + 5 | 5-way delivery-sync consolidation debt (§6); descriptions derived, verify; Domain KB delivery TBD |
| Marketing | 3 + 1 unconsolidated | 5 + 3 | 3-way execution consolidation debt (§6); research "2 skills for 1 design"; descriptions derived, verify; Domain KB delivery TBD |
| Analytics | 1 | 1 + 2 wrappers | `analytics-adhoc-query-evaluator`, `analytics-scheduled-trend-monitor` split candidate; 2 wrappers to deprecate (§6); descriptions derived, verify; Domain KB delivery TBD |

**Standing requirements that apply across every Assistant, not called out per row:**
- No Skill is registered until it clears §1 in full — this is not tracked via any flag.
- Every Assistant's Domain Knowledge needs a stated delivery mechanism before any of its Skills can be considered done — currently TBD everywhere.
- Every Skill has a Tier (§0.15), recorded in its own column, never merged into or substituted for its Description. `confirmBeforeSend` is required, by type, on every Represent-tier Skill.
- The Sports dual-group isolation pattern (DEC-010) is a real, reusable pattern — other Assistants may need the same treatment if two of their clusters should never share data or reasoning, not just Sports.
- Any future audit of this document should sweep every row for a flagged pattern before concluding, and should recompute summary counts from the detail table rather than typing them by hand (§8).

---

# Part C — Tool Registration & Consolidation Summary

All Capability Clusters outlined in Part B remain architecturally accurate regarding their core domains and expected state configurations. Moving forward, the critical enforcement mechanism is ensuring that these clusters are registered directly to the Assistant Orchestrator.

| Assistant | Clusters | Skills | Status / Integration Checks |
| --- | --- | --- | --- |
| CTO | 4 | 6 | Requires `team-metrics` pre-flight checks wired to `cto-team-delivery-health-evaluator`.

 |
| Career | 5 | 10 | `career-application-execution-orchestrator` must enforce Represent-tier `confirmBeforeSend`.

 |
| Executive | 4 | 4 | 2 Skills missing entirely. Must register Advise-tier skills as LLM context retrieval tools.

 |
| Legal | 4 | 4 | `matter-document-ops` still exposes `operation` — must be refactored to remove routing logic from config.

 |
| Sales | 3 | 3 | `outreach-drafting` missing account-brief generation.

 |
| Support | 2 | 4 | Ensure ticket lifecycle sequence passes discrete JSON payloads back to Chat LLM for synthesis without hallucinating ticket data.

 |
| HR | 2 | 5 | Interview-scheduling split resolved into User/Automated triggers. Ensure Event trigger is strictly monitored by Assistant state loop.

 |

*Standing requirements across all Assistants:* No Skill is registered until it clears §1 in full. Every Represent-tier Skill requires `confirmBeforeSend` by type.

---