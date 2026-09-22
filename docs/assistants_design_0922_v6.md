# Assistant & Skill Design — v6 (Definitive)

> This is a complete, self-contained specification. It does not require any earlier revision to be read alongside it.
> **Read Part A before touching anything in Part B.**

---

# Part A — Design Principles

## 0. Principles

### 0.1 — No single linear "Workflow" per Assistant
An Assistant does not execute one fixed sequence of steps. It has one or more **Capability Clusters** (§2): sets of Skills that share persistent state and, in some cases, real internal sequencing. A cluster may be genuinely sequential per instance (a support ticket really is understood, then answered, then closed), but an Assistant runs many instances concurrently, and most Assistants have several independent clusters with no sequencing between them at all. There is no single "current step" for an Assistant, ever, and nothing in the product should imply one.

### 0.2 — No "current step" / single-stream UI
A UI panel that shows one "current step" for an Assistant, with no way to act on it, should not exist. If a "what's in flight" view is wanted, it must show every concurrently running instance across every capability cluster, each actionable on its own — never a single step standing in for the whole Assistant.

### 0.3 — Every registered Skill must already work. There is no flag-based readiness gate.
A Skill either works or it isn't a Skill yet — there is no legitimate in-between state to manage. `isSkill` has exactly one job, and it has nothing to do with quality: it distinguishes a user-facing Skill from an internal base tool the Assistant calls but a user never sees directly (e.g., Career's ten `isSkill=false` base tools). It is never a proxy for "not ready yet," and it is never a place to stage known-incomplete work. Every Skill gets released, because every Skill is required to be ready and working before it's a Skill at all — fix the underlying defect (stub logic, missing config default, broken connector), don't stage it behind a flag.

### 0.4 — Domain Knowledge needs a delivery mechanism, not a label
A Domain Knowledge description is not itself a capability. Every Assistant must state *how* its domain knowledge actually reaches the model at run time: system-prompt injection specific to that Assistant, a retrieval corpus queried per invocation, or structured config the Skill's logic reads directly. A descriptive paragraph with no wiring behind it is the same failure mode as a Skill that writes an empty placeholder array and calls it a review — see §3.

### 0.5 — Assistant-level facts are declared once, not repeated per Skill row
Domain Knowledge, Persistent Data, and Interfaces are properties of the Assistant, stated once. They are not repeated, word for word, in every Skill's row — repetition of this kind is exactly the pattern that produced the `CAREER_HOME` copy-paste bug across six different files: one row gets corrected, the copies don't, and nobody notices.

### 0.6 — configSchema is for things that need a human decision, not mechanics
A property belongs in `configSchema` only if a human genuinely has to decide it — credentials for a login-gated source, a budget ceiling, a tone preference. If a Skill can have a sane, working default with no input, it ships with that default; it does not present a required, empty field that blocks the Skill from running. A login-gated data source gets *credentials* as its config; a public, no-login data source needs no config entry at all. See §4 for a worked example.

### 0.7 — configSchema fields ≠ display metadata
Registry and routing metadata — Category, Catalog, Source, the Skill's own ID — is never rendered inside what the user sees as configuration. Every remaining config property needs a human-readable label sourced from the schema's `title`, never the raw property key.

### 0.8 — Every Skill needs an Output schema and a rendering template
`outputSchema` is mandatory for every Skill, and every Skill needs a small rendering template mapping its output fields to a plain-language result. Raw JSON, doubly-encoded or otherwise, is never shown to a user. On failure, the template renders a human sentence explaining what happened — not the raw error string. See §5.

### 0.9 — Operation/mode is invisible, because it doesn't matter — to the user, or to the Assistant
It is not enough that the Assistant, rather than the user, decides which internal operation to run. The deeper point is that **it doesn't matter to the user, and it shouldn't matter to the Assistant either, which internal "operation" or sequence of operations ran.** The only thing that matters is that a Skill, or a sequence of Skills, produced the output that was actually needed. An `operation`/`action`/`mode` enum, where one exists at all, is private routing logic inside a Skill's implementation — never a required field on a panel, never something the Assistant narrates, never something the user is asked to pick.

One consequence of applying this rigorously, surfaced while resolving triggers (§0.14): a few Skills turn out to bundle sub-capabilities whose *natural triggers* genuinely differ, not just their labels — for example a Skill that mixes "a person has to ask for this" with "this fires automatically when another Skill's output arrives." That's a structural reason to split a Skill, separate from and in addition to the labeling reason above; the two are flagged separately in Part B wherever both apply.

### 0.10 — Run exists in exactly one place
There is no Run button anywhere except the UX panel on the **Overview tab** of the Assistant, and even there, only for Skills that are genuinely user-triggerable. It never appears on the Skills tab, the Config tab, or the Bound Skills panel, under any condition, disabled or otherwise. A Scheduled Skill runs on the interval set in its own configuration, with no button involved. An Event/State-triggered Skill runs when the Assistant detects the condition it defines, with no button involved.

### 0.11 — "Use This Result In" must be legible and gated on success
This control's available targets are derived from the cluster's Produces → Consumes graph (§2) — it only offers Skills that actually declare they consume that kind of output. It is disabled whenever the source result was not successful; a failed run has nothing to feed forward.

### 0.12 — Skill titles are the Skill's name, nothing concatenated onto it
A Skill's displayed title is its own human name, full stop. Nothing else — a workflow-step label, a category name — is ever concatenated onto it, with or without a separator.

### 0.13 — Input fields must not be destructively transformed while typing
No field ever trims, reformats, or otherwise transforms what a person is typing on every keystroke. If any transformation happens at all, it happens once, on submit — never while the field has focus.

### 0.14 — Every Skill has exactly one trigger, and it is determined by how the Skill is actually invoked
A Skill claiming User, Schedule, and Event triggers simultaneously does not describe how anything is actually invoked — it's a template default, the same class of error as a copy-pasted env var. The correct single trigger is determined as follows:

- **Event** — the Skill fires because another Skill produced output it consumes, or because a monitored state/data condition changed. The Event and/or the State being watched for must be defined *within the Skill itself*, in a form the Assistant can parse and monitor — not left as a vague label.
- **Schedule** — the Skill runs on a clock interval because it exists to monitor something on the user's behalf over time (spend, DORA metrics, DR readiness, market data, deal health). The interval lives in the Skill's own configuration.
- **User** — a person has to ask for it, surfaced only as a Run action on the Overview tab (§0.10).

Every Skill in Part B is resolved to exactly one of these. Where a Skill's current implementation bundles genuinely different sub-capabilities such that no single honest answer exists, that is a split candidate (§0.9), not a reason to list more than one trigger.

## 1. Skills are released working, or not released
A Skill is committed and exposed to a user only once all of the following are true:
1. It has been invoked for real and returns a successful result — no `"mode":"not-connected"`, no stub output, no placeholder.
2. Its returned output matches its declared `outputSchema` and renders through a template (§5) — never raw JSON.
3. It has no `configSchema` field that is `required` but unsatisfiable by a normal user in the current environment (§4).
4. It complies with §0.7 — no registry metadata rendered as configuration, real human labels throughout.
5. It has exactly one resolvable trigger (§0.14) — a Skill whose trigger can't honestly be resolved to one thing needs to be split, not given three trigger values.
6. If it depends on the Assistant's Domain Knowledge (§3), that knowledge has a working delivery mechanism, not a TBD.

None of this is a flag state to manage. It is the bar a Skill clears before it exists in the registry at all — see §0.3.

## 2. Capability Cluster Model
Each Assistant has one or more Capability Clusters instead of one linear Workflow. A cluster is a set of Skills that share persistent state and/or a common internal tool they draw on. Cluster membership is determined by shared `Consumes` targets or an explicit producer→consumer edge between two Skills' `Produces`/`Consumes` — not by a plausible human narrative connecting them. Two things are often both true within the same Assistant:

- **Some clusters are genuinely sequential per instance.** The cleanest code-evidenced case: Education's `education_adaptive_personalization` explicitly consumes the output of `education_learner_insight` — a real producer→consumer edge, not an assumption. Content and creative-writing Assistants (Content, Songwriter, Scriptwriter) plausibly have a real production pipeline: research/trend → draft → format/publish, though the wiring for every step of those specific chains was not independently confirmed against source and should be checked.
- **Many clusters are not sequential at all.** CTO's architecture/cost-planning work has no dependency on its incident-response work. Executive's four Skills don't feed each other. Restaurant's five domains run in parallel. These stay as separate clusters within one Assistant precisely because nothing wires them together.
- **Sequential within an instance is not the same as single-stream for the Assistant.** Support's ticket lifecycle (understood → responded to → closed) is genuinely sequential *per ticket* — and many tickets move through that sequence concurrently. This is the clearest illustration of why §0.1/§0.2 matter: sequence-within-an-instance never implies one current step for the whole Assistant.

## 3. Domain Knowledge Delivery Mechanism
Every Assistant's Domain Knowledge is paired with a stated mechanism, marked **TBD** throughout Part B until an actual answer is chosen and implemented. No Skill dependent on that knowledge clears §1.6 until this is resolved.

## 4. Config vs. Internal Defaults — worked example
**Before (what shipped, and failed in test):** Job Search required the user to configure job-board sources, and failed with `not-connected — job-board scraping is not configured for boards:` when none were set.
**Right:** the boards to search are implementation defaults — a hard-coded list of public, no-login job boards the Skill already knows how to query. The only thing that legitimately becomes user-facing config is what genuinely requires a human decision for a specific board: login credentials for a board that requires an account, or an opt-out if the user wants a board excluded. A board with no login needs no config entry at all.

## 5. Output Rendering — required, not raw JSON
**Before (an actual captured result):**
```
{"type":"text","text":"{\n \"output\": \"{\\\"success\\\":false,\\\"mode\\\":\\\"not-connected\\\",\\\"error\\\":\\\"Not connected: interview prep and negotiation guidance are unavailable...\\\"}\\n\",\n \"exitCode\": 0,\n \"durationMs\": 24213}"}
```
JSON encoded inside JSON encoded inside a text block. No user should ever see this.
**Right:** every Skill's `outputSchema` maps to a small rendering template — plain language, formatted fields, no braces or escape characters visible, ever, on success or failure.

## 6. Open Consolidation Debt
These were flagged as unfinished consolidation work and remain unresolved. They must not reach general availability as separate user-facing Skills:
- **Product:** `product-jira`, `product-confluence`, `product-slack`, `product-calendar`, `product-markdown-parsing` — five unconsolidated fragments, no single orchestrator. Needs one higher-order "sync/manage delivery work" Skill built on top of these as internal tool-calls.
- **Marketing:** `marketing-content-generation`, `marketing-social-media`, `marketing-email` — three fragments of one intended Skill. Consolidate into one "produce and distribute campaign content" Skill.
- **Analytics:** `analytics-grounded-reporting` and `analytics-warehouse-query` are wrappers around `analytics_business_insight_report` with no distinct value of their own. Deprecate the two wrappers; keep the one real Skill.
- **HR:** `recruiting-ops` bundles a User-triggered sub-capability (draft a JD) with an Event-triggered one (candidate passed screening, schedule interview) — cannot resolve to one honest trigger as currently scoped (§0.14). Split along the trigger boundary.
- **Analytics:** `analytics_business_insight_report`'s `mode` spans an ad hoc query (User-triggered) and trend monitoring (Schedule-triggered) — same issue, same fix: split along the trigger boundary.

## 7. Implementation bugs (not design questions, listed for completeness only)
These have no connection to any design principle, right or wrong — plain engineering misses:
- The general-tools list on the Skills panel isn't filtering out Skills (`isSkill` already exists as a field and is unused here).
- Input trimming fires on keystroke instead of submit (also codified as a standing rule at §0.13).

---

# Part B — Assistant Reference

> Cluster groupings are derived from each Skill's `Consumes`/`Produces` as recorded in the current implementation snapshot this document was built from — treat them as a first pass and confirm against source, not as independently re-verified ground truth for every row.

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

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| cto-architecture-tech-debt-evaluator | Produce prioritized modernization roadmap | **Schedule** — periodic tech-debt monitoring | systems: name,reliability(0-5),security,scalability,maintainability,cost; requirements: string[]; context: teamSize,stack,constraints | empty | cto-architecture-advisory | scored systems, roadmap with actions | MATCH |
| cto-cloud-spend-infrastructure-optimizer | Recommend rightsizing and capacity actions | **Schedule** — periodic spend monitoring | billingRows: service,spend,utilization(0-1); context: object | empty | cto-infrastructure-query(cost-optimization) | rightsizing recs, savings estimates | MATCH |
| cto-incident-war-room-synthesizer | Correlate signals into root-cause hypotheses | **Event** — fired by incoming incident signals | signals: source,evidence,hypothesis,confidence(0-1); context: object | empty | cto-incident-disaster-readiness | hypotheses, mitigations, stakeholder update | MATCH |
| cto-engineering-action-iac-drift-remediation | Dry-run and apply IaC remediation after confirmation | **Event** — fired by detected infrastructure drift; `confirmation` is an input field, not a separate trigger | payload: object; dryRun(bool,default=true); confirmation(bool,default=false) | endpointUrl(URL,required); token(password,required) | direct API | response or confirmation-required error | MATCH |
| cto-team-delivery-health-evaluator | Evaluate DORA metrics, team capacity, sprint velocity | **Schedule** — periodic DORA/velocity monitoring | systems: string[]; period: week/month/quarter | deploymentFreqThreshold(1), leadTimeDays(7), failureRate(0.15), mttrHours(24) | cto-infrastructure-query(team-metrics) | DORA assessment, team capacity, sprint velocity | clustered, not orphaned |
| cto-disaster-recovery-planner | DR readiness with RTO/RPO targets | **Schedule** — periodic DR readiness check | systems: name,rto,rpo,backupVerified,lastTested; context: object | rtoTargetMinutes(60), rpoTargetMinutes(15), failoverAuto(false), includeTeams(true) | cto-incident-disaster-readiness | readiness status, assessments, recommendations | clustered, not orphaned |

Base tool mapping: `get_cloud_billing_metrics→cto-infrastructure-query`, `query_datadog_alerts→cto-infrastructure-query`, `fetch_github_pull_requests→cto-engineering-actions`, `fetch_jira_backlog→cto-engineering-actions`, `calculate_dora_metrics→cto-team-delivery-health-evaluator`, `execute_iac_drift_scan→cto-engineering-action-iac-drift-remediation`.

## 2. Career
**Capability Clusters:**
- **Positioning & Discovery** — `career-job-market-positioning-evaluator`, `career-job-discovery-fit-ranking`, `career-resume-template-manager`
- **Interview Prep** — `career-interview-compensation-battlecard-creator`, `career-interview-practice-mock-interviewer`
- **Application & Outreach** — `career-governed-application-outreach-manager`, `career-application-execution-orchestrator`, `career-portal-recruiter-workflow`
- **Pipeline Tracking** — `career-pipeline-outcome-tracker` (feeds Positioning & Discovery via outcome data)
- **Upskilling** — `career-upskill-role-targeted-learning-planner`

All clusters read/write the same Master Career Profile — the shared state is why this is one Assistant with several clusters, not several Assistants, and why no single linear caption ever fit it.

**Domain Knowledge:** Hiring processes, compensation structuring (equity, bonuses, base), ATS parsing logic, personal branding, negotiation tactics
**Persistent Data:** Master Career Profile (resume.json), target role criteria, compensation floors, application history log, company exclusion list
**Interfaces:** Job Boards (LinkedIn, Indeed, Glassdoor), ATS Systems (Lever, Greenhouse), Email SMTP/IMAP, PDF Generation Engines
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| career-job-market-positioning-evaluator | Review resume vs listings for resume edits and salary targets | **Schedule** — ongoing market-fit monitoring | systems: profile context; listings: ranked jobs | empty | career_profile_intake, career_job_discovery, career_rank | resume edits, target salary, positioning recs | MATCH |
| career-interview-compensation-battlecard-creator | Interview Q&A and compensation negotiation script | **Event** — fired when an interview is scheduled | company: string; context: role,team,industry | empty | career_interview_prep, career_advisory | Q&A briefing, negotiation script, battlecard | MATCH |
| career-governed-application-outreach-manager | Application submissions with confirm-before-send | **User** — a decision the person makes | application data, outreach data | confirmBeforeSend(bool,default=true) | career_apply_execute | confirmations, outreach records, audit logs | MATCH |
| career-job-discovery-fit-ranking | Discover, score, rank job opportunities | **Schedule** — ongoing job-board monitoring | jobTitles[], locations[], minSalary, maxSalary, autoApplyThreshold, dryRun | premiumJobBoards[], freeJobBoards[] | career_job_discovery, career_apply_execute | ranked opportunities with scores | MATCH |
| career-application-execution-orchestrator | Multi-portal applications with dry-run and audit | **User** — applying is a decision the person makes | targetRoles[], listings[], dryRun(default=true), coverLetters[], customResume, customCoverLetter | empty | career_apply_execute | submissions with status, audit trail | MATCH |
| career-upskill-role-targeted-learning-planner | Upskilling plans for target roles | **Event** — fired by a gap surfaced in pipeline outcome data | gaps[], targetRole, currentSkills | empty | reasoning-based | upskilling plan, resources, micro-tasks | MATCH |
| career-interview-practice-mock-interviewer | Mock interviews with battlecards | **User** — practicing is requested | role, company, battlecard | empty | career_interview_prep | transcript, performance, coaching notes | MATCH |
| career-pipeline-outcome-tracker | Track applications and outcomes | **Event** — fired by an application status change | targetRole, jobTitle, company, status, feedback, offerDetails | empty | career_pipeline_report, career_outcome | pipeline reports, outcome records | MATCH |
| career-resume-template-manager | Resume templates and variants | **User** — template creation is requested | templateName, resumeData, targetRole | empty | career_profile_intake, career_add_template | template records, variant management | EXTRA (not in design) |
| career-portal-recruiter-workflow | Recruiter outreach and portal management | **Event** — fired by a recruiter message or portal state change | dryRun, applyAt, targetCompany, targetPerson, relationshipStage, channel, connectedSendTool | empty | career_apply_execute, career_networking_outreach | outreach drafts, portal records | MATCH (design separates portal+outreach; code combines) |

Base Tools (`isSkill=false`, 10): career_profile_intake, career_job_discovery, career_rank, career_apply_execute, career_add_template, career_networking_outreach, career_pipeline_report, career_outcome, career_interview_prep, career_advisory

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

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| executive-leadership-advisory | Executive presence, C-suite dynamics, leadership strategy | **User** — advice on a specific situation is requested | strategicContext: org strategy; stakeholderData: board, C-suite | reasoningConfig(gpt-4,0.3,4000) | reasoning-based | strategy recs, conflict resolution, stakeholder analysis | PARTIAL (design: board/C-suite; code: general advisory) |
| executive-dev-career | Skill-gap analysis, career roadmaps | **Schedule** — periodic development-planning cadence | developmentGoals[], careerStage, feedbackData | empty | reasoning-based | gap analysis, improvement plan, roadmap | RESTORED |
| executive-feedback | 360 feedback collection and synthesis | **Event** — fired by a 360 feedback submission | feedbackData: 360 responses; stakeholderList[] | empty | reasoning-based | feedback synthesis, themes, recommendations | RESTORED |
| executive-risk-scenario | Scenario modeling for leadership decisions | **User** — scenario modeling for a pending decision is requested | scenarioParams: variables; riskTolerance: thresholds | empty | reasoning-based | scenarios, risk assessment, mitigation | RESTORED |

## 4. Legal
**Capability Clusters:** four independent clusters, no wiring between them:
- **Intake & Triage** — `contract-document-advisory`
- **Legal Research** — `legal-research`
- **Document Ops** — `matter-document-ops`
- **Compliance Tracking** — `compliance-tracking`

**Domain Knowledge:** Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation
**Persistent Data:** Standard Playbook & Clause Library, Organizational Risk & Security Thresholds, Active Matter Directory, Historical Contract Archives
**Interfaces:** Legal Research APIs, Document Management Systems (Google Drive, SharePoint), E-Signature Platforms (PandaDoc, DocuSign), Compliance/Security Logs
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| contract-document-advisory | Intake and triage contracts/matters | **Event** — fired when a document/redline is received | contractText, matterInfo, counterParty | empty | reasoning-based | classification, priority, risk flag | PARTIAL (code: intake; design: risk assessment) |
| legal-research | Statute and case search synthesis | **User** — a research question is asked | statuteQuery, topic, jurisdiction | empty | reasoning-based | research synthesis, precedent analysis | RESTORED |
| matter-document-ops | Draft, redline, clause analysis, doc ops | **User** — a draft/redline is requested | documentData, operation(draft/redline/clause/finalize) | empty | reasoning-based | documents, redlines, clause comparisons | PARTIAL — still exposes `operation` as a required input; correct per §0.9 |
| compliance-tracking | Compliance obligations and audit horizons | **Schedule** — periodic compliance monitoring | complianceParams, regulatoryFeed[], auditHorizon | empty | reasoning-based | compliance status, risk scorecard | PARTIAL (code: compliance; design: risk) |

## 5. Sales
**Capability Clusters:** three independent clusters — a plausible narrative order exists ("find leads → outreach → close"), but nothing in `Consumes` wires them together, so they stay parallel:
- **Deal Advisory** — `lead-deal-advisory`
- **Outreach Drafting** — `outreach-drafting`
- **Pipeline Ops** — `pipeline-ops`

**Domain Knowledge:** B2B sales methodologies (MEDDPICC, Challenger), outbound messaging optimization, CRM hygiene standards, pipeline forecasting
**Persistent Data:** Ideal Customer Profile (ICP) definitions, Product Value Frameworks, Target Account Lists, Historical Deal Stages, Objection-Handling Matrices
**Interfaces:** CRM Systems (Salesforce, HubSpot), Sales Engagement APIs (Outreach, Apollo), Enrichment Data (ZoomInfo, Clearbit), Calendar Systems
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| lead-deal-advisory | CRM analysis, deal health, revenue forecast | **Schedule** — ongoing deal-health monitoring | prospectData, criteria, history[] | empty | reasoning-based | deal health, stuck deals, forecast | PARTIAL (design: velocity; code: advisory) |
| outreach-drafting | Account dossiers, personas, scripts, outreach | **User** — a specific outreach draft is requested | prospectInfo, messageType, context | empty | reasoning-based | dossiers, briefings, scripts, outreach | MISSING (no account brief generation in code) |
| pipeline-ops | Deal stages, status, close tracking | **Event** — fired by a stage/status change | dealData, stage, action | empty | reasoning-based | deal records, transitions, forecast | PARTIAL (design: sequences; code: pipeline ops) |

## 6. Event
**Capability Clusters:** three independent clusters:
- **Planning & Budgeting** — `event-planning-budgeting`
- **Vendor & Contract Management** — `event-vendor-contract-management`
- **Day-of Operations** — `event-day-of-operations`

**Domain Knowledge:** Event logistics management, catering operations (BEOs), vendor contract structures, spatial design principles, crowd management timing
**Persistent Data:** Master Event Specs, Budget Ledger, Vendor Directory & Rating History, Guest List & Dietary Matrix, Seating Models
**Interfaces:** Ticketing/RSVP Platforms (Eventbrite, Luma), Payment Gateways (Stripe), Messaging Platforms (Twilio, Email), Floor Plan Tools
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| event-planning-budgeting | Venue/budget/spatial optimization | **User** — planning is initiated for a specific event | venueSpecs, budgetData, guestCount | empty | reasoning-based | event plan, venue comparison, budget breakdown | MATCH |
| event-vendor-contract-management | Vendor quotes, contracts, comms | **Event** — fired at a contract milestone (renewal, signing date) | vendorData, contractTerms | confirmBeforeSend=true | external APIs | quotes, contracts, comms | PARTIAL (code: vendor; design: guest+vendor) |
| event-day-of-operations | Day-of check-in, seating, ops | **Event** — fired by a day-of state change (check-in, etc.) | operation, dateRange, guestList | confirmBeforeSend=true | external APIs | check-ins, seating, event log | MATCH (existing tool confirmed) |

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

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| restaurant-menu-engineering-cost-strategist | Advise | **Schedule** — ongoing profitability monitoring | menuId, items(name,popularity,cost,price), profitabilityGoals | empty | restaurant-menu-recipe | menu matrix, pricing recs | MATCH |
| restaurant-shift-prep-list-copilot | Aid | **Schedule** — daily prep-list generation | dateRange, station, role, forecastData | empty | kitchen-ops, staffing-labor | prep checklist, shift assignments | MATCH |
| restaurant-reservations-guest-profile-manager | Represent | **Event** — fired by a reservation request | operation, partySize, guestName, tableId, status, channel | confirmBeforeSend=true | external reservation API | bookings, guest profiles | MATCH |
| restaurant-supply-chain-inventory-reorder-manager | Represent | **Event** — fired by inventory crossing a defined reorder threshold (a state condition, not a clock) | item, quantity, supplier | empty | supply-chain | PO drafts, inventory status | MATCH |
| restaurant-financial-forecast-evaluator | Advise | **Schedule** — periodic forecasting | dateRange, metric, department | empty | financial-advisory | P&L analysis, forecasts | IMPLEMENTED (design said gap but code exists) |

## 8. Content
**Capability Clusters:** one cluster, plausibly sequential per item — content genuinely flows strategy → draft → publish. Confirm actual producer/consumer wiring before treating this order as guaranteed.
- **Content Production** — `content-strategy-seo-evaluator` → `editorial-calendar-article-copilot` → `governed-publishing-cms-dispatcher`

**Domain Knowledge:** SEO content architectures, search engine algorithms, content marketing conversion funnels, editorial style guides (AP, Chicago)
**Persistent Data:** Content Style Guide, SEO Keyword Map, Publishing Schedule, Channel Performance Analytics
**Interfaces:** CMS Platforms (WordPress, Ghost, Medium), SEO Tools (Ahrefs, Semrush), Analytics (Google Analytics 4)
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| content-strategy-seo-evaluator | Advise | **Schedule** — ongoing content-performance monitoring | contentItems, metrics, dateRange | empty | content-performance-seo | strategy recs, keyword gaps | MATCH |
| editorial-calendar-article-copilot | Aid | **Event** — fired by strategy output (keyword gaps identified) | topics(title,audience,intent,format,keywords,tone,length) | empty | content-drafting-adaptation | drafted content, calendar entries | MATCH |
| governed-publishing-cms-dispatcher | Represent | **Event** — fired when a draft is completed/approved | channel, contentId, title, dryRun, confirmation | endpointUrl+token(required) | content-multi-channel-publishing | published content, dispatches | EXTRA (Represent tier) |

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

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| songwriter_genre_trend_evaluator | Advise | **Schedule** — periodic trend monitoring | genre, market, timeframe, provider | endpointUrl+apiKey+provider(enum) | external intel | trend report | RESTORED |
| songwriting_lead_sheet_demo_dispatcher | Aid | **User** — a lead sheet is requested | format, theme, genre, mood | empty | creative_drafting | lead sheets, charts | EXTRA |
| songwriting_musical_lyric_cocreation | Aid | **User** — co-creation is requested | theme, mood, structure, topic, duration | empty | creative_drafting | chord progressions, beat sheets | MATCH |
| songwriting_lyric_prosody_evaluator | Advise | **Event** — fired by newly co-created lyrics | lyrics, meter, rhyme, stress | empty | reasoning-based | structural improvements | MATCH |

## 10. Scriptwriter
**Capability Clusters:** one cluster, plausibly sequential — of every Assistant in this document, the research → theme → outline → characters → draft narrative applies most literally here:
- **Script Production** — `scriptwriting-genre-market-evaluator` → `scriptwriting-scene-beat-dialogue-copilot` → `scriptwriting-narrative-arc-pacing-evaluator` → `scriptwriting-script-formatting-submission-manager`

Confirm actual producer/consumer wiring before treating this order as guaranteed — it's the most defensible sequential story of any Assistant here, but that's a narrative read, not independently verified data.

**Domain Knowledge:** Screenwriting standards (Final Draft/Fountain format), narrative theory (Save the Cat, Hero's Journey), dialogue subtext principles, film/TV pacing
**Persistent Data:** Screenplay Drafts, Character Bibles, World/Setting Guides, Scene Breakdown Logs
**Interfaces:** Scriptwriting Software Formats (Fountain, Final Draft), Pitch Deck Platforms
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| scriptwriting-narrative-arc-pacing-evaluator | Advise | **Event** — fired by newly drafted scenes | scriptText, structure, actConfig | empty | reasoning-based | rewrite recs, pacing assessment | MATCH |
| scriptwriting-scene-beat-dialogue-copilot | Aid | **User** — drafting is requested | sceneData, characters, dialogue | empty | creative_drafting | beat sheets, loglines | MATCH |
| scriptwriting-genre-market-evaluator | Advise | **Schedule** — periodic market monitoring | genre, market, format | endpointUrl+apiKey | external intel | genre fit, market comparison | RESTORED |
| scriptwriting-script-formatting-submission-manager | Represent | **Event** — fired when a script is finalized/approved | format, content, submissionTarget | empty | formatting tools | formatted scripts | EXTRA |

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
| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| sports-tactical-roster-evaluator | Advise | **Event** — fired by the match calendar entering the pre-match window | playerMetrics, opponentData | empty | reasoning-based | tactical adjustments | MATCH |
| sports-battlecard-creator | Aid | **Event** — same pre-match condition | opponentData, matchupInfo | empty | reasoning-based | scout reports | MATCH |
| sports-scouting-alert-dispatcher | Represent | **Event** — fired by a player health/transfer state change | playerData, alertSpecs | empty | reasoning-based | tactical alerts | MATCH |

**Wagering Group:**
| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| sports-matchup-odds-explainer | Advise | **Event** — fired by odds becoming available / line movement | oddsData, marketData | empty | reasoning-based | matchup analysis | MATCH (responsible-play required) |
| sports-bankroll-co-pilot | Aid | **Schedule** — periodic bankroll check | bankrollRules, unitLimits, exposure | empty | reasoning-based | sizing analysis | MATCH |
| sports-line-alert-dispatcher | Represent | **Event** — fired by line movement | lineData, bankrollState | empty | reasoning-based | contextualized alerts | MATCH (barred from sportsbook) |

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

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| finance-modeling-analysis | Advise | **Schedule** — periodic model refresh | modelType, scenarioParams | empty | reasoning-based | financial models | PARTIAL |
| risk-regulatory-advisory | Advise | **Schedule** — periodic risk/regulatory monitoring | riskParams, regulatoryUpdates | empty | reasoning-based | risk assessment | RESTORED |
| budget-tracking | Represent | **Schedule** — periodic budget-vs-actual monitoring | budgetData, actuals | empty | reasoning-based | BVA models, summaries | PARTIAL |
| reporting-data-ops | Represent | **Schedule** — periodic reporting | reportType, dataRange | empty | reasoning-based | financial reports | MISSING |

## 13. Wealth
**Capability Clusters:**
- **Data & Research** — `investment-market-data`, `research-planning`
- **Portfolio Management** — `portfolio-risk-advisory`, `bill-pay-rebalancing`

**Domain Knowledge:** Modern Portfolio Theory (MPT), tax-efficient withdrawal strategies, personal cash flow management, asset location rules
**Persistent Data:** Personal Net Worth Ledger, Asset Allocation Targets, Recurring Expense Rules, Tax Profile, Personal Financial Goals
**Interfaces:** Personal Financial Aggregators (Plaid), Brokerage APIs (Alpaca, Interactive Brokers), Bank Feeds
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| investment-market-data | Represent/Proxy | **Schedule** — periodic market data refresh | securities, marketParams | endpointUrl+apiKey+provider | external APIs | market data | RESTORED (closest to production) |
| portfolio-risk-advisory | Advise | **Event** — fired by a market-data update revealing drift | portfolioData, riskTolerance | empty | reasoning-based | risk, drift, rebalancing | RESTORED |
| bill-pay-rebalancing | Represent | **Schedule** — recurring bill cycle | obligations, amounts | confirmBeforeSend | reasoning-based | payments, rebalancing | MATCH |
| research-planning | Aid | **User** — research is requested | portfolioData | empty | reasoning-based | research reports | EXTRA |

## 14. Healthcare
**Capability Clusters:**
- **Practice Operations** — `healthcare-clinical-practice-workflow-evaluator`, `healthcare-appointment-patient-intake-dispatcher`
- **Clinical Support** — `healthcare-clinical-decision-support-evaluator`, `healthcare-patient-care-plan-educational-briefing-copilot`
- **Referral Coordination** — `care-resource-referral-coordinator`

**Domain Knowledge:** Practice management workflows, evidence-based clinical guidelines, HIPAA compliance rules, medical billing/coding cycles
**Persistent Data:** Practice Operational Templates, Patient Communication Rules, Provider Schedule Models, Evidence-Based Clinical Guidelines
**Interfaces:** EHR/EMR Platforms (Epic, AthenaHealth), Telehealth Gateways, Secure HIPAA-Compliant SMS/Email Gateways
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| healthcare-clinical-practice-workflow-evaluator | Advise | **Schedule** — ongoing workflow monitoring | practiceData, metrics | empty | reasoning-based | workflow assessment | MATCH |
| healthcare-clinical-decision-support-evaluator | Advise | **User** — support requested for a specific case | patientData, symptoms, guidelines | empty | reasoning-based | differential diagnoses | MATCH |
| healthcare-patient-care-plan-educational-briefing-copilot | Aid | **User** — a care plan is requested | patientProfile, objectives | empty | reasoning-based | care plans, materials | MATCH |
| healthcare-appointment-patient-intake-dispatcher | Represent | **Event** — fired by an intake form submission / appointment state change | appointmentData, intakeForm | empty | fetch_ehr_appointments, parse_intake_forms | reminders, intake processing | MATCH |
| care-resource-referral-coordinator | Represent | **User** — a referral is requested | resourceType, patientNeed | empty | resource_coordination | referrals | RESTORED |

## 15. Hotel
**Capability Clusters:**
- **Guest Management** — `hotel-guest-experience`, `hotel-reservations-guest-profile`
- **Revenue Advisory** — `hotel-revenue-performance-advisory`
- **Property Operations** — `hotel-property-operations`

**Domain Knowledge:** Hotel metrics (ADR, RevPAR, GOPPAR), PMS operations, guest service standards, yield management, hotel maintenance triage
**Persistent Data:** Property Management System (PMS) Records, Guest Profiles & Preferences, Local Concierge Directory, Maintenance Log, Amenity Inventory
**Interfaces:** Property Management Systems (Opera, Cloudbeds), Maintenance Tracking Tools, Channel Managers, Guest Messaging Systems
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| hotel-revenue-performance-advisory | Advise | **Schedule** — ongoing revenue monitoring | adr, revpar, occupancy, laborCost | empty | reasoning-based | revenue recs, pricing | MATCH |
| hotel-guest-experience | Aid | **Event** — fired by a guest service request | guestProfile, serviceRequests | empty | reasoning-based | concierge KB, responses | MATCH |
| hotel-reservations-guest-profile | Represent | **Event** — fired by a reservation request | operation, partySize, guestName, status, channel | confirmBeforeSend=true | external API | bookings, loyalty | MATCH |
| hotel-property-operations | Represent | **Event** — fired by a reported maintenance/ops issue | operation, roomStatus, maintenanceTask | confirmBeforeSend | external API | dispatch orders | MATCH |

## 16. Education
**Capability Clusters:**
- **Learner Insight** — `education_learner_insight` → `education_adaptive_personalization` (real producer/consumer edge: `adaptive_personalization` explicitly consumes `learner-insight`'s output, the cleanest evidenced sequential case in this document). Note: a placeholder config bug on `education_adaptive_personalization` needs fixing before this cluster clears §1.
- **Assessment** — `education_lesson_assessment_drafting`
- **Resource Library** — `education_resource_library` (design intended one skill; code has it split into two — reconcile)

**Domain Knowledge:** Pedagogical frameworks (Bloom's Taxonomy, Spaced Repetition), curriculum design, assessment scoring methods, student engagement metrics
**Persistent Data:** Curriculum Standards & Rubrics, Student Performance History, Knowledge Gap Maps, Course Material Libraries
**Interfaces:** Learning Management Systems (Canvas, Blackboard, Moodle), Assessment Platforms, Student Information Systems (SIS)
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| education_learner_insight | Advise/Hybrid | **Schedule** — periodic learner-data monitoring | learnerData, lmsConnection | endpointUrl+apiKey | external LMS API | learner profiles | RESTORED |
| education_adaptive_personalization | Advise | **Event** — fired by `education_learner_insight` output | differentiationParams, pacingRules | placeholder bug | learner-insight | learning paths | RESTORED (bug noted — fix before §1) |
| education_lesson_assessment_drafting | Represent | **Event** — fired by a submission received | rubricCriteria, submissions | empty | spaced-repetition | graded results, feedback | MATCH |
| education_resource_library | Aid | **User** — resources are requested | subject, level, accessibility | empty | resource-lib | curated resources | SPLIT (design=1 skill, code=2) |

## 17. Support
**Capability Clusters:**
- **Ticket Lifecycle** — `ticket-understanding` → `response-drafting` → `ticket-ops`, sequential per ticket, concurrent across tickets — the clearest illustration in this document of "sequential per instance, not single-stream for the Assistant"
- **Analytics & Planning** — `analytics-planning`

**Domain Knowledge:** Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage
**Persistent Data:** Product Knowledge Base, Account Health Profiles, Support Escalation Protocols, Historical Ticket Log
**Interfaces:** Helpdesk Platforms (Zendesk, Intercom, Freshdesk), Product Analytics (Mixpanel, Amplitude), CRM Systems
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| ticket-understanding | Advise | **Event** — fired by a new ticket | ticketData, accountHistory | empty | reasoning-based | classification, health, churn flag | PARTIAL |
| response-drafting | Aid | **Event** — fired by `ticket-understanding`'s classification | ticketContext, kbArticles | empty | query_knowledge_base | responses, plans | MATCH |
| ticket-ops | Represent | **Event** — fired by a response/status change | ticketId, status, routingTarget | empty | update_helpdesk_status | status, escalations | MATCH |
| analytics-planning | Advise | **Schedule** — periodic CSAT/analytics review | metrics, timeRange | empty | calculate_csat_score | analytics reports | RESTORED |

## 18. HR
**Capability Clusters:**
- **Recruiting Pipeline** — `candidate-screening`, `recruiting-ops`
- **Analytics & Compliance** — `hiring-analytics-compliance`

All three are real, implemented, design-matched Skills. The open item is confirming each is not still running stub logic, then exposing them — not building anything from scratch.

**Domain Knowledge:** Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)
**Persistent Data:** Organizational Chart, Job Description Library, Compensation Band Benchmarks, Candidate Pipeline Records
**Interfaces:** Applicant Tracking Systems (Greenhouse, Lever), HRIS Systems (Rippling, BambooHR), Calendar APIs
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| candidate-screening | Represent | **Event** — fired by a new application received | resumeText, requirements, candidateName, assessmentData | confirmBeforeSend=true, endpoint, maxRetry | HR_SCREENING_ENDPOINT | screening scores, assessments | MATCH |
| recruiting-ops | Aid | **Split candidate** — bundles a User-triggered sub-capability (draft a JD) with an Event-triggered one (candidate passed screening, schedule interview); cannot resolve to one honest trigger as currently scoped | (currently unified under an `operation` field — remove per §0.9 once split) | confirmBeforeSend=true, endpoint, apiKey | HR_RECRUITING_ENDPOINT | JDs, kits, schedules | MATCH — flag for split per §0.9/§6 |
| hiring-analytics-compliance | Advise | **Schedule** — periodic compliance/analytics monitoring | dateRange, data | HR_HOME | reasoning-based | metrics, reports, checks | MERGED (design: 2 distinct; code: 1 combined) |

## 19. Product
**Capability Clusters:**
- **Planning** — `create-roadmap`, `write-prd`
- **Analytics** — `product-analytics-insight`
- **Delivery Sync — not yet a cluster (open consolidation debt, §6):** `product-jira`, `product-confluence`, `product-slack`, `product-calendar`, `product-markdown-parsing` remain five unconsolidated fragments. Must not reach general availability individually — build one orchestrating Skill on top of them first.

**Domain Knowledge:** Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation
**Persistent Data:** Product Vision & Strategy Docs, Feature Backlog, User Persona Models, Competitor Capability Matrix
**Interfaces:** Project Management Tools (Jira, Linear), Product Analytics (Mixpanel, Pendo), Feedback Systems (Canny, UserVoice), Documentation (Confluence, Notion)
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| create-roadmap | Advise | **User** — a roadmap update is requested | initiatives, strategyDocs | empty | reasoning-based | prioritized roadmap | MATCH |
| write-prd | Aid | **User** — a PRD is requested for a specific requirement | requirements, userStories | empty | reasoning-based | PRDs, user stories | MATCH |
| product-analytics-insight | Advise | **Event** — fired by a launch | metric, data, dates | empty | reasoning-based | analysis results | RESTORED |
| (product-jira, product-confluence, product-slack, product-calendar, product-markdown-parsing) | Represent backlog sync | — | — | — | — | — | SPLIT across 5 (no single orchestrator) — see §6 |

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

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| plan-campaign | Advise | **User** — a campaign plan is requested | campaignName, budget, channels | empty | reasoning-based | campaign plan | MATCH |
| analyze-performance | Advise | **Schedule** — periodic performance monitoring | metrics, channel, dateRange | empty | reasoning-based | performance reports | MATCH |
| marketing-content-generation | Aid | **Event** — fired by a content brief | contentType, contentData | confirmBeforeSend | CMS endpoint | ad copy, sequences | SPLIT (1 of 3) — see §6 |
| marketing-social-media | Represent | **Schedule** — posts run on a configured cadence | platform, message, schedule | confirmBeforeSend | social APIs | scheduled posts | SPLIT (1 of 3) — see §6 |
| marketing-seo | Aid | **Schedule** — periodic SEO audit | url, keywords | empty | SEO API | audit reports | EXTRA |
| marketing-market-research | Aid | **User** — specific research is requested | researchQuery, scope | empty | research API | market reports | RESTORED |
| marketing-audience-insights | Aid | **Schedule** — ongoing audience monitoring | audienceParams | empty | analytics API | segments, personas | RESTORED (2 skills for 1 design) |
| marketing-email | Represent | **Event** — fired when campaign content is ready to send | campaignData, recipients | confirmBeforeSend | email API | campaigns, sends | SPLIT (1 of 3) — see §6 |

## 21. Analytics
**Capability Clusters:**
- **Business Insight Reporting** — `analytics_business_insight_report` only. `analytics-grounded-reporting` and `analytics-warehouse-query` are wrapper duplicates with no distinct value — deprecate, don't cluster them as if they were separate capabilities.

**Domain Knowledge:** Business intelligence architectures, SQL/data modeling principles, statistical trend analysis, cross-functional KPI frameworks
**Persistent Data:** Data Warehouse Schema Mappings, Metric Definitions & KPI Dictionary, Historical Query Cache
**Interfaces:** Data Warehouses (Snowflake, BigQuery), BI Tools (Looker, Tableau, Metabase)
**Domain KB Delivery:** TBD

| ID | Description | Trigger | Inputs | Config | Consumes | Produces | Design |
|---|---|---|---|---|---|---|---|
| analytics_business_insight_report | Advise | **Split candidate** — `mode` spans an ad hoc query (User-triggered) and trend monitoring (Schedule-triggered); cannot resolve to one honest trigger as currently scoped | mode, metric, provider, warehouse | endpointUrl+apiKey+provider(self-wrapping) | self | insights, trends, results | MATCH — flag for split per §0.9/§6 |
| analytics-grounded-reporting | Advise | — | metric, dataset | empty | analytics_business_insight_report | reports | EXTRA wrapper — deprecate, see §6 |
| analytics-warehouse-query | Advise | — | query | empty | analytics_business_insight_report | results | EXTRA wrapper — deprecate, see §6 |

---

# Part C — Summary

| Assistant | Clusters | Skills | Open Items |
|---|---:|---:|---|
| CTO | 4 | 6 | Domain KB delivery TBD |
| Career | 5 | 10 | Domain KB delivery TBD |
| Executive | 4 | 4 | 2 Skills missing entirely; Domain KB delivery TBD |
| Legal | 4 | 4 | `matter-document-ops` still exposes `operation`; Domain KB delivery TBD |
| Sales | 3 | 3 | `outreach-drafting` missing account-brief generation; Domain KB delivery TBD |
| Event | 3 | 3 | Domain KB delivery TBD |
| Restaurant | 5 | 5 | Domain KB delivery TBD |
| Content | 1 | 3 | Confirm sequential wiring; Domain KB delivery TBD |
| Songwriter | 3 | 4 | Domain KB delivery TBD |
| Scriptwriter | 1 | 4 | Confirm sequential wiring; Domain KB delivery TBD |
| Sports | 2 (isolated) | 6 | In-Game/Predictive Modeling missing; Domain KB delivery TBD |
| Finance | 4 | 4 | `reporting-data-ops` not implemented; Domain KB delivery TBD |
| Wealth | 2 | 4 | Domain KB delivery TBD |
| Healthcare | 3 | 5 | Domain KB delivery TBD |
| Hotel | 3 | 4 | Domain KB delivery TBD |
| Education | 3 | 4 | Placeholder config bug on `adaptive_personalization`; resource-library split reconciliation; Domain KB delivery TBD |
| Support | 2 | 4 | Domain KB delivery TBD |
| HR | 2 | 3 | `recruiting-ops` split candidate (§6); Domain KB delivery TBD |
| Product | 2 + 1 unconsolidated | 3 + 5 | 5-way delivery-sync consolidation debt (§6); Domain KB delivery TBD |
| Marketing | 3 + 1 unconsolidated | 5 + 3 | 3-way execution consolidation debt (§6); research "2 skills for 1 design"; Domain KB delivery TBD |
| Analytics | 1 | 1 + 2 wrappers | `analytics_business_insight_report` split candidate; 2 wrappers to deprecate (§6); Domain KB delivery TBD |

**Standing requirements that apply across every Assistant, not called out per row:**
- No Skill is registered until it clears §1 in full — this is not tracked via any flag.
- Every Assistant's Domain Knowledge needs a stated delivery mechanism before any of its Skills can be considered done — currently TBD everywhere.
- `confirmBeforeSend` is applied on Represent-tier Skills throughout — this should become a typed requirement of the Represent tier, not a convention each Skill remembers to set.
- The Sports dual-group isolation pattern (DEC-010) is a real, reusable pattern — other Assistants may need the same treatment if two of their clusters should never share data or reasoning, not just Sports.
