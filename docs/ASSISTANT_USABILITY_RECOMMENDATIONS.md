# Assistant UX and Product Design Recommendations

## Purpose

This document focuses on the product design quality of the Assistants and Skills themselves: what they do, how they fit together, what users are expected to understand, and where the experience is confusing, incomplete, or likely to fail in real use.

This is intentionally not a code-correction review, and it does not re-litigate implementation details or technical compliance issues. This is a usability, workflow, schema, and capability review for the people who will design, tune, and ship the Assistants.

---

## Design Principles

Every Assistant should behave like a guided work system, not a loose bag of tools.

1. Start with user intent, not internal tool names.
2. Hide technical IDs and system internals from the user unless the user is actively configuring a connection.
3. Use context to auto-fill what is obviously known; ask only for what is missing.
4. Connect Skills when there is a clear, same-context handoff; never auto-launch a risky or mutating action without review.
5. Treat configuration as setup, not as part of normal task flow.
6. Preserve safe defaults and make destructive or high-impact actions explicit.
7. Show the user what is connected, what is missing, and what is being inferred.
8. Use a small number of high-value, clearly named workstreams instead of many overlapping tools with vague names.

---

## Product constructs: Higher-order Skills, tools, and lanes

These terms should not be used interchangeably.

### Higher-order Skill

A higher-order Skill is a user-facing workflow or job that coordinates multiple lower-level tools and decisions. It is the product-level unit the user is trying to complete, not the atomic action itself.

Examples:

- Career Coach: role search and application workflow
- Product Assistant: roadmap → PRD → delivery workflow
- Marketing Assistant: campaign brief → content → launch → optimize workflow
- Healthcare Assistant: patient review → care plan → scheduling/communication workflow

### Tool

A tool is an atomic capability or function. It usually does one thing well and is called by a higher-order Skill or by a user who is intentionally selecting a specific function.

Examples:

- system overview / metric query
- draft article
- schedule interview
- create PRD section
- score candidate

### Workflow lane or mode

A lane is not a new Skill type. It is a way of organizing the Assistant experience into user-facing sections within one Assistant or higher-order Skill. Lanes are design and UX partitions, not independent product capabilities.

Examples:

- CTO: Monitor and Diagnose / Plan and Modernize / Incident Response / Approve and Execute
- Support: Queue / Triage / Draft Response / Escalate
- Sports: Performance & Tactical Review / Bankroll & Risk Review

Lanes help users understand what kind of work they are in. They should not be treated as separate products or separate skill registries unless they are intentionally productized as their own higher-order workflows.

### Capability classification rule

- If it is the main job the user is trying to complete, it is a higher-order Skill.
- If it is a single action or service invocation, it is a tool.
- If it is a UI section or workflow partition inside an existing Assistant, it is a lane.

---

## Cross-Assistant Recommendation: How Skills Should Connect

### Decision rule

The output of one Skill should be fed into another Skill only under one of these conditions:

- Same object or same user context: the second Skill is clearly operating on the same product, candidate, patient, campaign, event, or account.
- The output is structured and reusable: the data fields are named clearly and can be mapped without ambiguity.
- The action is low-risk or review-only: insight, evaluation, draft creation, prioritization, or recommendation generation.
- The user has chosen the handoff: a button such as “Use this result in...” or “Continue with this candidate” appears after review.

### Recommended launch pattern

- Auto-launch for low-risk, same-context follow-up only when the user has already given clear intent and the second Skill is the obvious next step.
- Conditional launch when there is a meaningful threshold or business rule. Example: only launch outreach when the candidate score clears a selected cutoff.
- User-button launch for almost all mutating or high-risk actions. Example: “Send email”, “Publish plan”, “Schedule patient visit”, “Apply to job”.
- Never auto-run multi-step actions without a visible confirmation state.

### Recommended rule by output type

- Whole-object handoff: good for product brief → roadmap → PRD, campaign plan → content generation, event plan → vendor workflow.
- Row-by-row handoff: appropriate when one Skill returns a list of ranked items and the next Skill acts on one selected row at a time. Example: candidate list → interview prep, lead list → outreach, issue list → incident war room.
- Bulk handoff: should require explicit user approval and a summary before execution.

### Product recommended default

Most Assistants should support three handoff modes:

1. Use result in next step
2. Save as draft
3. Ignore / start fresh

This preserves user control and avoids accidental chaining.

---

## Cross-Assistant Recommendation: Internal IDs and Internal Schema Fields

### Rule

Do not expose internal IDs or implementation fields to the average user.

Examples of fields that should be hidden or transformed into friendly selectors:

- patientId → Select patient
- eventId → Select event
- contractType → choose contract category
- ticketId → Select ticket
- learnerId → Select learner
- campaignId → Choose campaign
- endpointUrl → Connect service
- operation → action label (Book, View, Draft, Send, Review)
- provider → Service provider selector
- dryRun → Preview only
- confirmation → Approve and send
- resumeId → not exposed; derive from active profile context

### Recommendation

The UI should present friendly context, not raw data keys. Internal values remain in the schema for system use, but the UX should render them as selectors, labels, chips, or contextual defaults.

---

## Cross-Assistant Recommendation: Configuration vs. Input

The design issue is not simply whether a value is technical or user-facing. The real distinction is scope:

- Global environment configuration is shared platform setup and should not be part of any Assistant or Skill UX.
- Assistant configuration is the recurring operating setup for that Assistant and should be stored with the Assistant.
- Skill configuration is the recurring setup for that Skill and should be stored with the Skill, not repeated as a per-run user input.
- Task input is the dynamic content for the current job and should be filled at runtime.

### 1) Global environment configuration

These are platform-level or environment constants that apply across the product, not to one Assistant or one Skill.

Examples:

- runtime environment
- API host defaults
- common service endpoints
- shared secret stores
- global feature flags
- platform-wide defaults

These belong in environment or platform configuration, not in the user-facing Skill form.

### 2) Assistant configuration

These are the recurring operating settings for a given Assistant and should be configured once per Assistant instance or profile.

Examples:

- default team or organization context
- preferred tone or operating model
- common service connections
- default scheduling and review policies
- standard goals and guardrails
- data source preferences

These belong in Assistant configuration, not in every skill execution.

### 3) Skill configuration

These are recurring settings for a specific Skill and should be persisted with the Skill or its assistant context.

Examples:

- baseUrl
- apiKey or auth settings
- provider connection
- default facility
- default timezone
- default source channel
- brand guidelines
- approval workflow
- publishing calendar
- connected system list
- system-specific defaults

These should appear in the Skill configuration area, not as required fields in the task input form. If a value is needed to execute the Skill, the system should resolve it from configuration before presenting the user with a task form.

### 4) Task input

These are the values that change from run to run and represent the current user objective.

Examples:

- patient symptoms
- candidate resume text
- campaign brief
- initiative goals
- event date and venue
- support ticket summary
- product requirement text
- budget targets

These belong in the runtime task input fields.

### Recommended rule

Use a three-layer model:

- Global environment configuration: platform-level constants
- Assistant/Skill configuration: persistent operational defaults
- Task input: current request and active object context

This reduces user confusion and prevents recurring technical settings from being treated as everyday user input.

### Trigger-driven skill rule

A strong design rule for scheduled, state-based, and event-driven Skills is:

- If the Skill is triggered by state, event, or schedule, it should generally have no task-input schema beyond data passed from the triggering source or from a previous Skill.
- It should rely on configuration for its operating parameters and on runtime context for the object it is acting on.
- The user should not be required to re-enter the same configuration each time the Skill fires.

This applies especially to Skills such as:

- recurring digest and review Skills
- alert-driven and threshold-based Skills
- scheduled follow-ups
- state-change handlers
- event-based workflows

In short: trigger-driven Skills should behave like autonomous operational routines, not like ad hoc manual forms.

---

## Cross-Assistant Recommendation: Terminology and Naming

The current skill naming mix is often implementation-heavy, vague, or internally coded. The product UX should favor user language.

### Replace internal or technical terms with user-friendly terms

- “Infrastructure Query” → “System Overview” or “Live Monitoring Check”
- “Engineering Actions” → “Take Action in Connected Tools”
- “Records & Scheduling Ops” → “Patient Records and Appointments”
- “Candidate Screening & Scheduling Manager” → “Applicant Review and Interview Coordination”
- “Workforce Planning & Compensation Evaluator” → “Hiring and Compensation Planning”
- “Marketing Content Generation” → “Campaign Content Studio”
- “Analyze Performance” → “Review Campaign Results”
- “Plan Campaign” → “Create Campaign Brief”
- “Create Roadmap” → “Build Product Roadmap”
- “Write PRD” → “Draft Product Requirements”
- “Clinical Decision Support” → “Clinical Review Assistant” or “Case Review Assistant”
- “Operations & Scheduling” → “Schedule and Coordination”

### Avoid vague names

- “Ops” is too broad and ambiguous in most Assistant flows.
- “Manager”, “Coordinator”, and “Evaluator” are acceptable only when the user experience clearly shows the task and decision-making boundary.
- “Advisory” is too generic unless the output is clearly a recommendation and not an action.

### Recommendation

Every Assistant should use a user-facing title, a short subtitle, and a clear description of what it does and what it does not do.

---

## Assistant-by-Assistant Recommendations

## 1) Career Coach

### Where it works well

- The assistant has a lifecycle-oriented flow: profile, matching, opportunities, applications, preparation, outcomes.
- It has a strong “career journey” concept that naturally supports follow-up.

### Design failures

- Several skills still feel like technical utilities rather than a single career workflow.
- The user may not know which skill to use next: fit ranking, resume template, interview prep, outreach, tracking, or outcome analysis.
- Internal system terms and profile state are likely to leak into the UX.

### Recommendations

- Consolidate into a single guided flow with phases:
  - Profile and preferences
  - Role fit and discovery
  - Target list and application plan
  - Preparation and interview readiness
  - Tracking and follow-up
- Use “Use result in next step” buttons between stages.
- Auto-launch only when the user is already in the application workflow and the next step is the obvious next action.
- Show materials as drafts, not as final actions.
- Use friendly fields: “Target role”, “Preferred locations”, “Salary floor”, “Target companies”, not raw resume/profile IDs.
- Hide low-level config like endpoint, token, Gmail sync details behind a connection drawer.

### Skill connection rule

- Job fit ranking → application shortlist: user-controlled, not automatic.
- Application shortlist → interview kit: user-triggered.
- Interview outcome → pipeline tracker: auto-save and display as structured updates.
- Outreach sending: always require approval.

### Missing capabilities

- A dedicated “career plan” summary that tracks current goals, open tasks, and future actions.
- A “confidence and risk” view showing how strong the application plan is.
- A clear distinction between “save draft”, “apply now”, and “schedule follow-up”.

---

## 2) Content Assistant

### Design failures

- There are multiple content-generation and publishing tasks, but the product story is not obvious.
- Publishing, scheduling, and performance review are mixed together.
- The assistant risks feeling like a CMS console rather than a content workflow partner.

### Recommendations

- Frame as a content production system with four stages:
  - Brief and goals
  - Draft and adapt
  - Review and optimize
  - Publish and measure
- Build one consistent content workspace for each campaign or article.
- Use row-by-row handoff from content ideas to drafts to platform variants.
- Require explicit publish confirmation, even when the system has a content calendar.

### Skill connection rule

- Drafting → SEO review: automatic if the draft is complete and the user has chosen a publishing goal.
- SEO review → publish plan: user-controlled.
- Publish plan → scheduling: user-triggered with preview.

### Missing capabilities

- A content calendar view with article state, due dates, and approval status.
- A “content library” that stores approved briefs, drafts, and variants.
- Platform-specific “publish here” choice rather than a generic CMS action.

---

## 3) Creative Assistant

### Design failures

- Songwriting and scriptwriting are conceptually similar but feel like separate products rather than one creative workspace.
- The assistant lacks a strong “creative brief → draft → revision” loop.
- Creative tasks may be too open-ended without an outcome target.

### Recommendations

- Unify the creative experience around a single brief board: audience, voice, objective, format, length, references.
- Distinguish between idea generation, drafting, revision, and adaptation.
- Add a “revise this draft with tone/format/goal changes” flow.
- Make it clear whether the user is working on a lyric, song, scene, script, outline, or pitch.

### Skill connection rule

- Trend insight → creative brief: user-controlled or automatic if the brief is being refreshed.
- Brief → draft: automatic if the user is still in the same creative session.
- Draft → revision: user-button launch; never silent.

### Missing capabilities

- A revision history and comparison view.
- One-click adaptation between formats (script to video outline, lyric to hook, scene to pitch).
- “Save as concept”, “save as draft”, and “save as approved” states.

---

## 4) CTO Assistant

### Design failures

- The Assistant includes both read-only and mutating system actions, but the split is not always clear.
- Internal provider choices and technical objects are too exposed.
- Users may not know whether they are viewing telemetry, creating a remediation action, or approving a risky operation.

### Recommendations

- Separate the experience into four workflow lanes or modes:
  - Monitor and diagnose
  - Plan architecture and modernization
  - Prepare incident response
  - Approve actions and remediations
- The diagnostic mode should be read-only by default.
- The remediation mode should require review and confirmation before execution.
- These are workflow lanes inside the CTO Assistant, not separate higher-order Skills unless the product later decides they should operate as independent user journeys.

### Skill connection rule

- Infrastructure or telemetry query result → architecture review or incident synthesis: this should only happen when the user chooses “Use this result” or when the result is clearly the same system and same incident context. It should not be automatic in a blind pass-through.
- Incident synthesis → remediation plan: recommended after review.
- Remediation plan → action approval: explicit user approval required.

This is intentionally not a generic “query result to anything” rule. The input must clearly belong to the same system, same incident, or same object context.

### Missing capabilities

- A clear “system health overview” dashboard with current risk, incident status, and recommended next actions. This is a higher-order product view, not a single tool.
- A single change log showing what was run, what was recommended, and what still needs approval. This is a workflow capability, not a raw tool.

---

## 5) Education Assistant

### Design failures

- The assistant appears to have a set of disconnected school tasks instead of a single learner-support journey.
- Adaptive personalization is conceptually central but appears as a separate, manual step instead of a natural continuation of insight.

### Recommendations

- Define the flow as:
  - Learner profile and performance insight
  - Personalized learning plan
  - Assessment drafting
  - Resource sequencing and support
- Make the learner profile the anchor object.

### Skill connection rule

- Insight → adaptation: automatic when the learner and context match.
- Adaptation → assessment draft: user-triggered or auto-suggested if the learner is in a current learning cycle.
- Assessment → resource suggestion: user-controlled.

### Missing capabilities

- A learner progress timeline.
- “Use latest insight” toggle that becomes the default when data exists.
- A clear distinction between “recommended”, “assigned”, and “completed” work.

---

## 6) Event Assistant

### Design failures

- Event planning, vendor management, and day-of operations are interdependent, but the assistant does not yet clearly model a single event lifecycle.
- It risks processing details without a visible event workboard.

### Recommendations

- Present one event workspace with sections:
  - Plan and budget
  - Vendors and contracts
  - Logistics and timeline
  - Day-of operations
  - Risk and contingency
- Provide event-level summary states like “draft”, “approved”, “vendor confirmed”, “ready for event day”.

### Skill connection rule

- Planning → budget and vendor selection: same-event auto handoff.
- Vendor outcome → day-of operations: user-triggered with approval.
- Day-of operating actions: explicit confirmation only.

### Missing capabilities

- A single event timeline and checklist.
- A shared “decision log” for vendor choices, budget changes, and contingency decisions.

---

## 7) Executive Assistant

### Design failures

- Executive workflows are highly sensitive to context and risk but can feel generic because the outputs are often advisory rather than decision-oriented.
- Recommendations may not clearly distinguish between analysis, coaching, and action.

### Recommendations

- Present executive support as a structured decision workspace:
  - strategy review
  - leadership and team feedback
  - risk and challenge review
  - career and development planning
- Keep strategic recommendations separate from direct operational actions.

### Skill connection rule

- Leadership review → feedback synthesis: same-context auto handoff.
- Feedback synthesis → development plan: user-controlled.
- Risk scenario → action plan: user approval required.

### Missing capabilities

- A timeline of leadership decisions and changes.
- Clear “recommended strategy” vs “executed plan” states.

---

## 8) Finance Assistant

### Design failures

- Finance has multiple analytical modes but may not explain whether the user is modeling, reporting, or making a decision.
- It should feel like a financial operating workspace rather than a set of disconnected analysis tools.

### Recommendations

- Make the user journey explicit:
  - Current position
  - Forecast and scenario design
  - Risk and compliance review
  - Budget decisions and control
- Distinguish between “analysis only” and “actionable recommendation” states.

### Skill connection rule

- Forecasting → risk review: automatic if the scenario is still active.
- Risk review → budget planning: user-triggered.
- Budget changes or external actions: explicit approval required.

### Missing capabilities

- A single model dashboard with assumptions, scenarios, variance, and decisions tracked over time.
- Clear product language around “preview”, “proposal”, and “committed plan”.

---

## 9) Healthcare Assistant

### Design failures

- This assistant is high-risk and must be deeply context-aware; a generic tool list is not enough.
- Exposure of patient and record IDs in a clinical workflow would be a serious usability problem and a safety concern.
- The assistant needs a strong sense of patient context and review boundaries.

### Recommendations

- Create a single patient care workspace with:
  - active patient context
  - symptoms and visit notes
  - risk review
  - recommended follow-up
  - appointment and communication actions
- Make patient selection a clear contextual selector, not freeform ID input.
- Keep “clinical review” and “action” in separate phases.

### Skill connection rule

- Symptom assessment → risk review: same-case auto handoff.
- Risk review → care plan: user-reviewed, not auto-sent.
- Scheduling and communication: user approval required.

### Missing capabilities

- Encounter timeline and chronology view.
- A safety review mode that clearly separates preliminary suggestions from final clinical decisions.
- A clear read-only summary before any action or patient-visible communication.

---

## 10) Hotel Assistant

### Design failures

- The hotel workflow is operational and cross-functional, but it risks turning into a generic admin dashboard.
- There is a mismatch between reservation management, operations, staffing, and financial monitoring.

### Recommendations

- Structure the assistant around the guest journey and operating day:
  - reservation and check-in
  - room and staffing coordination
  - guest service issues
  - revenue and operations review
- Keep guest and reservation selection in user-friendly selectors.

### Skill connection rule

- Reservation → service coordination: same-reservation handoff.
- Service issue → staffing or room decision: contextual and user-reviewed.
- Operational actions: human approval required.

### Missing capabilities

- A day-of operations board.
- A guest history and service issue timeline.
- A “live operations summary” rather than many independent admin tools.

---

## 11) HR Assistant

### Design failures

- There are enough workflow stages to be a strong recruiting system, but the user experience is currently modular and not yet narrative.
- The distinction between resume evaluation, interview scheduling, and hiring planning is not well framed.

### Recommendations

- Define the flow as:
  - intake and candidate pool
  - screening and qualification
  - interview coordination
  - hiring planning and compensation review
- Use a recruiter dashboard with candidate states: reviewed, shortlist, interview, decision, hired.

### Skill connection rule

- Candidate screen → interview invitation: same candidate, same role, user review.
- Interview result → hiring recommendation: user-triggered and reviewable.
- Scheduling and outreach: approval required.

### Missing capabilities

- A candidate tracking table with status and rationale.
- A “decision summary” showing how a candidate matched the role.
- A better distinction between “screening output” and “recruiting action”.

---

## 12) Investment Assistant

### Design failures

- Investment tasks are rich in nuance, but the UX can become opaque if recommendation and execution are not clearly separated.
- A user may not understand whether a result is an analysis, a scenario, or an actual recommendation.

### Recommendations

- Present three modes:
  - portfolio review
  - risk and scenario analysis
  - plan and life-event simulation
- Keep scenarios explicit and comparable.

### Skill connection rule

- Portfolio view → risk analysis: same-account auto handoff.
- Risk analysis → planning scenario: user-controlled.
- Any actual trading or external action: explicit approval and re-review.

### Missing capabilities

- A portfolio summary with assumptions and scenario comparison.
- Clear labeling of “what changed” and “what is recommended”.

---

## 13) Legal Assistant

### Design failures

- Legal tasks are highly document-heavy; the user experience should prioritize context and review rather than a general list of tools.
- There is a risk of mixing research, drafting, and operational legal tasks without clear boundaries.

### Recommendations

- Structure the workflow as:
  - matter intake
  - research and clause review
  - risk/compliance check
  - client or internal communication
- Clearly distinguish draft work from formal legal advice.

### Skill connection rule

- Contract review → clause research: same matter, same-context handoff.
- Research → compliance check: user-controlled.
- Client communication and workflow actions: explicit approval required.

### Missing capabilities

- A matter workspace with timeline, relevant documents, and advice history.
- A clear “review draft” vs “final legal position” state.

---

## 14) Marketing Assistant

### Design failures

- Marketing has a strong workflow potential but currently feels spread across disconnected tasks.
- The assistant risks being too tactical and not strategic enough.

### Recommendations

- Frame as a campaign lifecycle:
  - brief and strategy
  - audience and channel plan
  - content and creative execution
  - launch and optimize
- Keep creative, performance, and channel work in the same campaign workspace.

### Skill connection rule

- Campaign brief → audience and channel plan: auto if in same campaign.
- Plan → content generation: user-triggered, with preview.
- Content and results → optimization loop: auto-suggest, but approval before publish changes.

### Missing capabilities

- One campaign summary with objective, audience, channel mix, content calendar, performance targets, and recent updates.
- A “what changed” summary after performance analysis.

---

## 15) Product Assistant

### Design failures

- The product assistant has valuable product workstreams, but they are too tool-like and not visibly connected as a single planning system.
- Roadmaps, PRDs, and analysis results should form a single product narrative.

### Recommendations

- Present one product workspace with:
  - opportunity and brief
  - roadmap and priorities
  - PRD and requirements
  - delivery and milestone tracking
  - evidence and analytics
- Keep strategy and delivery in distinct lanes.

### Skill connection rule

- Strategy brief → roadmap: same-product auto handoff.
- Roadmap → PRD: user-controlled; apply selected priorities.
- Delivery tracking → analytics review: same-product and same-release handoff.

### Missing capabilities

- A product dashboard that shows decision rationale, trade-offs, and open actions.
- A better “what changed” summary between roadmap revisions.

---

## 16) Restaurant Assistant

### Design failures

- Restaurant operations need an operational flow; right now the tool set looks function-based rather than shift-based.
- Users may not know what they are trying to manage: reservations, kitchen flow, staffing, or financial performance.

### Recommendations

- Create a single service-day view:
  - reservations and guest flow
  - kitchen and service timing
  - inventory and supply
  - staffing and labor
  - sales and performance
- Show tasks by shift and by service period.

### Skill connection rule

- Reservation or guest flow → kitchen/service coordination: same service period, auto-suggested.
- Inventory changes → staffing or prep actions: user approval required.
- Any customer-facing change or payout action: explicit confirmation.

### Missing capabilities

- A shift summary with capacity, risks, and action items.
- A kitchen timing and critical path view.

---

## 17) Sales Assistant

### Design failures

- Sales workflows are inherently pipeline-driven, but the current tool set may be too generic and not clearly tied to an active opportunity.
- There is a difference between research, outreach, and decision support that should be visible.

### Recommendations

- Build a pipeline workspace with stages and next best actions.
- Use opportunity-centric context as the default instead of isolated tools.

### Skill connection rule

- Prospect or lead review → deal recommendation: same deal or account, auto-suggested.
- Deal recommendation → outreach or follow-up: user-triggered.
- Bulk outreach or external send: explicit approval required.

### Missing capabilities

- A single opportunity summary with account context, next best action, and risk signals.
- Better “user decision” states between recommendation and action.

---

## 18) Support Assistant

### Design failures

- The assistant must serve customer support operations and likely needs an active queue, not a list of tools.
- The distinction between understanding a ticket, responding, and escalating is critical and should be more explicit.

### Recommendations

- Present a support queue with states:
  - new
  - triaged
  - under review
  - escalated
  - resolved
- Treat resolution drafts as drafts until approved.

### Skill connection rule

- Ticket intake → understanding and prioritization: same ticket, same-context auto handoff.
- Understanding → draft response: user-triggered or auto-suggested.
- Escalation or external send: explicit approval required.

### Missing capabilities

- A ticket timeline and customer history view.
- Better “recommended resolution” vs “sent response” distinction.

---

## 19) Analytics Assistant

### Design failures

- Analytics is likely to be powerful but abstract if presented only as metric reports and warehouse queries.
- Users need to understand what is being measured, what changed, and why it matters.

### Recommendations

- Make the assistant a reporting and interpretation assistant, not simply a query engine.
- Show “What changed / Why it matters / What to do next” as default output.

### Skill connection rule

- Metric report → trend or anomaly review: same dataset, auto handoff.
- Trend review → action recommendation: user-controlled.
- Querying external warehouse data: user-triggered and clearly labeled as read-only unless connected to a downstream action.

### Missing capabilities

- A concise executive summary plus drill-down options.
- A clearer distinction between descriptive analysis, diagnostic insight, and recommended action.

---

## 20) Sports Assistant

### Design failures

- This is one of the clearest examples where product boundaries matter.
- Performance and wagering are fundamentally different contexts and should never be mixed in the same flow.

### Recommendations

- Keep Group A and Group B fully separate in both the UI and data model.
- Use clear labels such as “Performance & Tactical Review” and “Bankroll & Betting Risk Review”.
- Distinguish read-only analysis from operational or risk-sensitive decisions.

### Skill connection rule

- Tactical evaluation → next decision support: same team/opponent context, user-reviewed.
- Bankroll or line alerts → risk review: user-controlled and clearly labeled as decision support, not execution.
- Any action that risks money or a betting decision: explicit approval and separate supervision.

### Missing capabilities

- Distinct dashboards with clean labels for each data group.
- Hard visual separation between analytics-only and risk-sensitive workflows.

---

## 21) Sales and Support combined operational assistants

The two operational assistants should be treated as workflow systems, not as command-line toolsets.

### General recommendation

Every operational assistant should expose:

- current queue or active work list
- object selected by the user
- next best action
- draft or preview state
- approval state
- record of what was changed

This reduces confusion and makes the product feel coherent, not transactional.

---

## 22) Scriptwriting and Songwriting Assistants

### Design failures

- These are naturally creative and should feel like editorial or writing workspaces.
- Without a strong brief, they risk producing generic content with no clear objective.

### Recommendations

- Create a standard setup pattern:
  - goal and audience
  - tone and style
  - format and constraints
  - references and inspirations
  - output mode
- Add an “expand / tighten / rewrite / adapt” toolset rather than disparate ad hoc actions.

### Skill connection rule

- Brief → draft: automatic within the same session.
- Draft → revision: user-controlled.
- Revision → adaptation to another format: user-button handoff.

### Missing capabilities

- Project history and revision compare view.
- A clear distinction between draft, version, and approved artifact.

---

## Redundant or Overlapping Skills: Reconciliation Recommendations

The design goal should be to eliminate overlap by making the Assistant feel like a guided workflow instead of a list of near-identical tools.

### Recommended reconciliations

- Marketing: combine “Plan Campaign”, “Analyze Performance”, and “Campaign Content Generation” into one campaign workspace.
- Content: merge content generation, SEO review, and publishing into a single editorial pipeline.
- Product: unify roadmap, PRD, and delivery review around a single product thread.
- Education: align insight, adaptation, assessment, and resource planning around a single learner plan.
- Healthcare: unify clinical review, scheduling, and communication around a patient care workflow.
- Career: integrate fit ranking, application, interview prep, and tracking into one job-search flow.
- CTO: separate “read” and “act” sections so operators do not confuse advisory outputs with execution.

### Strong recommendation

If two Skills do not produce meaningfully different user value, they should be collapsed into one user flow with structured sub-steps rather than kept as separate listing items.

---

## Capability Gaps to Fill

These are the most important missing product capabilities across the Assistants:

1. Active workspace context for each Assistant
2. Human-review state before any mutating action
3. Summary card for current status, next step, and risks
4. Single-thread support for same object across stages
5. Distinct states for draft, recommended, approved, and executed
6. Friendly selectors instead of raw IDs
7. Connection setup with clear defaults and missing-connector messaging
8. Revision and history views
9. Better labeling of “analysis”, “recommendation”, and “action”
10. User-facing explanations of what the Assistant does and does not do

### Capability classification guidance

The following gap types should be implemented as different product artifacts:

- Higher-order Skills:
  - Career Coach work journey
  - Content production workflow
  - Creative brief-to-draft flow
  - Education learner plan workflow
  - Event planning and operations workspace
  - Executive decision workspace
  - Finance decision and scenario workspace
  - Healthcare patient care workflow
  - Hotel service-day workspace
  - HR recruiting workflow
  - Marketing campaign lifecycle
  - Product roadmap and delivery workflow
  - Restaurant service-day workflow
  - Support queue and resolution workflow
  - Sports analytics and risk workspace separation

- Tools:
  - system overview query
  - draft article or copy
  - schedule interview
  - score candidate
  - create PRD section
  - generate campaign brief
  - create roadmap item
  - query warehouse data
  - generate incident summary

- Workflow lanes or modes:
  - CTO read / plan / respond / approve sections
  - Support queue / triage / draft / escalate
  - Sports performance review / risk review
  - Executive strategy / feedback / risk / development partitions

The exact classification depends on whether the user is being given a full job to do, a single action, or just a UX partition inside a current workflow.

---

## Implementation Checklist

Use this checklist to convert the design recommendations into implementation work.

### A. Assistant workflow design

- [ ] Each Assistant has a clear primary workflow and a visible end-to-end journey.
- [ ] The workflow is expressed as stages, not as a flat list of tools.
- [ ] Each stage clearly states what the user is doing and what comes next.
- [ ] The workflow distinguishes analysis, recommendation, draft, approval, and execution.
- [ ] The product shows a visible next step after every result.
- [ ] The user can save, discard, or continue the current work without losing context.

### B. Skill handoff rules

- [ ] Skills only pass output to another Skill when the same object or context is clearly in use.
- [ ] Whole-object handoffs are supported with clear user confirmation.
- [ ] Row-by-row handoffs are only used where one selected item is being acted on.
- [ ] Bulk handoffs require an explicit summary and approval step.
- [ ] Mutating actions are never auto-fired from a prior analysis result without review.
- [ ] Low-risk follow-ups may auto-suggest but must remain visible and reversible.

### C. UX data and schema hygiene

- [ ] Raw internal IDs are hidden from the standard user experience.
- [ ] Internal fields are mapped to friendly selectors or contextual labels.
- [ ] The UX displays role-based, user-friendly selections instead of technical keys.
- [ ] Configuration values are moved to Settings or Connection management.
- [ ] Task inputs are separated from account-level setup values.
- [ ] Friendly labels replace vague or implementation-driven names.

### D. Naming and language

- [ ] Every Assistant has a user-facing title and subtitle.
- [ ] Skills use user language instead of engineering terminology.
- [ ] “Ops”, “Manager”, “Evaluator”, and “Advisory” are only used where the user role is explicit.
- [ ] Every skill description explains what it does and what it does not do.
- [ ] High-risk actions are described in plain language before execution.

### E. Assistant-specific product standards

- [ ] Career Coach is delivered as a job-search journey rather than isolated tools.
- [ ] Content Assistant is delivered as a content production workflow.
- [ ] Creative Assistant uses a clear brief → draft → revise flow.
- [ ] CTO Assistant separates monitoring, planning, and execution into distinct modes.
- [ ] Education Assistant centers the learner journey and learning plan.
- [ ] Event Assistant is structured around a single event workspace.
- [ ] Executive Assistant keeps strategy, review, and action separate.
- [ ] Finance Assistant distinguishes analysis from decision and execution.
- [ ] Healthcare Assistant separates review from patient-facing action.
- [ ] Hotel Assistant centers on the guest and service-day workflow.
- [ ] HR Assistant presents a candidate workflow with status states.
- [ ] Investment Assistant differentiates analysis, scenario, and recommendation.
- [ ] Legal Assistant keeps matter intake, review, and drafting separate.
- [ ] Marketing Assistant is framed as a campaign lifecycle.
- [ ] Product Assistant is framed as a product decision and delivery workspace.
- [ ] Restaurant Assistant centers on shift and service-day operations.
- [ ] Sales Assistant is built around opportunity and pipeline stages.
- [ ] Support Assistant uses a queue-based operational workflow.
- [ ] Analytics Assistant emphasizes interpretation and next actions.
- [ ] Sports Assistant separates performance analysis from wagering-related risk decisions.
- [ ] Songwriting and Scriptwriting Assistants use a brief-driven creative workspace.

### F. Redundancy and consolidation

- [ ] Overlapping Skills are merged into a single workflow when they do not create distinct user value.
- [ ] Near-duplicate tasks are grouped under shared stages and user outcomes.
- [ ] The Assistant surfaces the most important task first instead of listing all tools equally.
- [ ] The UX has a clear hierarchy: core workflow, supporting tools, optional actions.

### G. Missing capability gaps

- [ ] Each Assistant has a clear context object or workspace.
- [ ] Draft, recommended, approved, and executed states are explicit.
- [ ] History or revision tracking exists for iterative work.
- [ ] Users can compare or review variations before choosing a direction.
- [ ] The UI explains missing connectors, inactive data, and assumptions.
- [ ] Assistants make clear when they are giving analysis, recommendation, or action output.

### H. Acceptance criteria for launch

- [ ] The Assistant can be understood by a new user in under 60 seconds.
- [ ] A user can complete the primary workflow without manually discovering hidden configuration.
- [ ] A user can tell which action is safe, which is preview-only, and which requires explicit approval.
- [ ] No user-facing form exposes raw internal IDs or technical implementation data.
- [ ] The skill flow is coherent regardless of whether the user starts in the middle of the journey.
- [ ] Assistants support clear progression from information → recommendation → action.

---

## Detailed Codebase Implementation Task List

This backlog is designed for the current architecture in this repo, not for an arbitrary future product. It is tied directly to the assistant registry, canonical skill patterns, and test structure already in the codebase.

The existing implementation pattern is:
- skill modules live under services/tool-executor/src/data/skills/
- each assistant exports a skill array and, in some cases, a canonical skill array
- the registry is surfaced through services/tool-executor/src/data/skills/index.ts
- the runtime relies on the factory in services/tool-executor/src/data/skills/code-skill-factory.ts
- assistant behavior is validated in tests under services/tool-executor/src/__tests__/

The recommendations should be implemented in that structure rather than by creating a new generic Assistant product model.

### Phase 1: Audit the current assistant and skill registry

#### Task 1.1: Inventory every assistant export and skill classification
- Review all assistant modules under services/tool-executor/src/data/skills/*
- Record which entries are base tools versus higher-order wrappers.
- Confirm which arrays are exported through services/tool-executor/src/data/skills/index.ts.
- Acceptance criteria:
  - every assistant skill module has a reviewed classification list
  - every export is mapped to a product role: base tool, higher-order skill wrapper, or UX lane wrapper
  - no assistant is treated as an unclassified pile of tools

#### Task 1.2: Identify overlapping or near-duplicate skills across assistants
- Compare similar capabilities across assistants (for example, planning, analysis, scheduling, publishing, review, and recommendation flows).
- Flag the duplicates that are operationally similar but not meaningfully different.
- Acceptance criteria:
  - duplicate skills are identified at the registry level
  - overlap is documented by file and capability name
  - the proposed consolidation is visible before code changes begin

#### Task 1.3: Define the product boundary of each assistant in code
- For each assistant folder, identify whether it is primarily a workflow, decision system, operational queue, or content pipeline.
- Document the boundary without assuming each assistant has only one job.
- Acceptance criteria:
  - each assistant has a real product description that matches its exported skill set
  - multiple higher-order skills may coexist within one assistant but are mapped to staged workflows rather than random actions

### Phase 2: Normalize the assistant module structure

#### Task 2.1: Standardize each assistant skill file around the same pattern
- In each assistant module, keep a single exported skill array and a canonical list where supported.
- Ensure the exported arrays follow the same naming, shape, and ordering pattern used across the repo.
- Acceptance criteria:
  - all assistant modules follow the same export pattern
  - assistant arrays are readable and comparable across the registry
  - the shape remains compatible with the rest of the tool executor

#### Task 2.2: Separate base operational tools from higher-order wrappers
- For assistants like CTO, Education, and others already using canonical arrays, ensure the distinction is explicit in code.
- Use isSkill and wrapper composition consistently rather than mixing at the same level.
- Acceptance criteria:
  - base tools remain self-contained and callable without chaining
  - higher-order wrappers clearly call downstream skill tools or tool outputs
  - the distinction is observable from the exported array contents and tests

#### Task 2.3: Decide which flows should remain assistant-level lanes and which should be promoted to explicit skills
- Review the assistant modules for internal workflow groupings that are currently represented as flat arrays.
- Create a clear policy: some are UX lanes, some are higher-order skills, and some stay as tool-level capabilities.
- Acceptance criteria:
  - every grouped flow has a documented classification
  - no lane is accidentally treated as a separate product in the registry
  - remaining unclassified flows are resolved by code review rather than by assumption

### Phase 3: Update the registry and exports to reflect actual workflow boundaries

#### Task 3.1: Refactor the assistant registry exports in services/tool-executor/src/data/skills/index.ts
- Confirm every assistant module is exported through the central registry.
- Add missing canonical exports where the codebase already expects them.
- Remove or deprecate accidental duplicates or orphaned arrays.
- Acceptance criteria:
  - registry export list is consistent with filesystem modules
  - canonical exports match the intended assistant product shape
  - no assistant disappears from the registry or appears twice under different names

#### Task 3.2: Reconcile module names and public identifiers
- Check for inconsistent naming across assistant modules: campaign, content, brief, plan, review, recommendation, and action labels.
- Standardize names to product language rather than engineering terms, while preserving canonical IDs.
- Acceptance criteria:
  - the user-facing name and the internal id are not confused
  - tool ids remain stable while display names match product understanding

#### Task 3.3: Update assistant arrays to reflect staged workflows instead of flat tool dumps
- Replace or reorder the exported arrays so they represent a coherent workflow sequence where appropriate.
- Keep tools usable individually, but reduce the cognitive overload of a flat list.
- Acceptance criteria:
  - array order matches product flow and user intent
  - related skills are grouped by stage when appropriate
  - the surface area of each assistant is easier to understand without documentation

### Phase 4: Fix schema and configuration hygiene in the existing skill factory model

#### Task 4.1: Audit inputSchema and outputSchema across assistant modules
- Review representative assistants and confirm each exported skill has a defined schema.
- Flag internal IDs, implementation-only keys, and raw connection fields that are exposed in the runtime form.
- Acceptance criteria:
  - all exported skills have valid input and output schema definitions
  - user-facing forms do not include raw internal IDs unless explicitly needed for configuration

#### Task 4.2: Move recurring configuration into configuration-level settings
- Update skills that currently expose configuration fields as if they were runtime input.
- Keep environment and provider-specific values in config fields, not in the normal job form.
- Acceptance criteria:
  - recurring setup values are stored as Skill or Assistant configuration
  - runtime task input contains only active object and current objective values

#### Task 4.3: Standardize trigger definitions by assistant and skill type
- Review triggers in skill definitions to separate user-triggered actions, scheduled tasks, and event-driven tasks.
- Ensure scheduled or event-driven flows do not require the same repeated user input each cycle.
- Acceptance criteria:
  - trigger type is explicit and consistent across modules
  - trigger-driven skills rely on configuration and runtime context instead of repeated manual form entry

### Phase 5: Implement approval and same-context handoff rules in the existing codebase

#### Task 5.1: Add same-context handoff enforcement to skill wrappers and orchestration logic
- Identify places where one skill output is currently passed blindly into another.
- Require a guard that verifies the same object or same context before chaining.
- Acceptance criteria:
  - cross-object or cross-context handoff is blocked or requires explicit review
  - same-context chaining remains supported when clearly valid

#### Task 5.2: Add approval gates to mutating skills
- Review the current external action skills and add or tighten approval/confirmation handling where the skill can mutate external systems.
- Use the patterns already present in CTO remediation code as the reference model.
- Acceptance criteria:
  - dangerous actions require a confirmation state before execution
  - dry-run, preview, or confirm-before-send behavior is enforced consistently

#### Task 5.3: Add visible summary states for action previews
- For any state that can create external change, present a summary before the action executes.
- Ensure the user sees what object is affected and what change is being made.
- Acceptance criteria:
  - the UI or output can distinguish preview vs actual execution
  - the output exposes the action scope before commit

### Phase 6: Refactor the known problematic assistants to match the repo’s actual patterns

#### Task 6.1: CTO workflow cleanup
- Use the existing CTO pattern as the model: base tools + canonical higher-order wrappers.
- Keep read-only diagnostic tools separate from action-oriented remediation skills.
- Acceptance criteria:
  - infrastructure and telemetry queries are clearly read-only
  - action flows have approval and confirmation safeguards

#### Task 6.2: Education workflow cleanup
- Use the established array pattern in education/index.ts and tighten the distinction between insight, personalization, assessment, and resource tasks.
- Confirm learner profile and objective remain central rather than manual side tasks.
- Acceptance criteria:
  - the learner context is persistent and not treated as ad hoc runtime input
  - assessment, recommendation, and assignment remain separate states

#### Task 6.3: Marketing workflow cleanup
- Review the current plan-campaign and analyze-performance pattern and ensure they are grouped within a campaign lifecycle rather than separate ad hoc tools.
- Acceptance criteria:
  - campaign planning and performance review can be chained by the same campaign object
  - publishing and optimization require preview and approval

#### Task 6.4: Product and content workflow cleanup
- Group roadmap, draft, publish, and optimization tasks into product-specific or content-specific stage flows.
- Use canonical wrappers where the flow is genuinely a higher-order job rather than a single atomic action.
- Acceptance criteria:
  - each module expresses the actual workflow, not a bag of unrelated tasks

### Phase 7: Update code and test coverage to enforce the design recommendations

#### Task 7.1: Extend the existing test strategy to cover workflow boundaries
- Update or add tests under services/tool-executor/src/__tests__ to enforce:
  - canonical vs base tool distinction
  - duplicate-free exports
  - required schema presence
  - trigger coverage
  - approval-related behavior where applicable
- Acceptance criteria:
  - tests validate the registry shape, not just the presence of code
  - assistant-level classification rules are enforced by test

#### Task 7.2: Add regression tests for risky handoff and approval logic
- Add tests around same-context chaining and confirmation-before-action behavior.
- Audit the current CTO tests as the reference pattern for high-risk governance checks.
- Acceptance criteria:
  - risky tools cannot pass silently into execution
  - same-context-only handoff logic is covered by automated tests

#### Task 7.3: Validate the registry remains stable after refactor
- Run the tool-executor test suite after all module changes.
- Check for export drift, naming inconsistencies, or runtime breakage introduced by reorganizing skill arrays.
- Acceptance criteria:
  - all relevant tests pass
  - no assistant module loses its canonical export or public contract

### Phase 8: Implementation priority ordering for this repo

#### Priority 1: Immediate code-level fixups
- services/tool-executor/src/data/skills/index.ts
- assistant skill modules for CTO, Education, Marketing, and Product
- code-skill-factory.ts for schema and config hygiene
- tests that enforce skill classification and approval gating

#### Priority 2: Registry cleanup
- remove or consolidate duplicate skills across similar assistant modules
- normalize naming and ordering across the exported arrays
- align each module to a consistent stage taxonomy

#### Priority 3: UX and orchestration refinement
- improve handoff logic and visible next-step behavior in module wrappers
- classify lanes vs higher-order skills in a traceable way
- add clearer approval state treatment for mutating actions

#### Priority 4: Cross-assistant consistency pass
- review the remaining assistants for workflow staging and overlap
- align naming and state semantics across the registry
- reduce generic tool dumping across low-risk assistants

---

## Sprint-by-Sprint Implementation Roadmap

This is the recommended execution order for this repo, using the current assistant registry and testing structure as the delivery target.

### Sprint 1: Registry audit and classification

Goal: Establish the actual product and technical boundaries before changing behavior.

Files to focus on:
- services/tool-executor/src/data/skills/index.ts
- services/tool-executor/src/data/skills/cto/index.ts
- services/tool-executor/src/data/skills/education/index.ts
- services/tool-executor/src/data/skills/marketing/index.ts
- services/tool-executor/src/data/skills/product/index.ts

Tasks:
- inventory all exported skill arrays and canonical arrays
- classify each entry as base tool, higher-order skill wrapper, or lane-style workflow grouping
- identify duplicate or near-duplicate capabilities across assistants
- document which flows are truly assistant-level workflows versus single-action tools

Definition of done:
- every assistant module has a reviewed classification list
- overlaps are documented and agreed before code changes
- the registry reflects actual assistant business boundaries instead of flat tool dumps

### Sprint 2: Schema and configuration hygiene

Goal: Remove low-level technical leakage and enforce the configuration-versus-input split.

Files to focus on:
- services/tool-executor/src/data/skills/code-skill-factory.ts
- representative assistant modules under services/tool-executor/src/data/skills/*

Tasks:
- review inputSchema and outputSchema for each exported skill
- remove internal implementation fields from the standard user-facing contract where they do not belong
- ensure persistent platform or provider config is placed in configSchema, not runtime task input
- standardize naming so labels match product language and workflow meaning

Definition of done:
- recurring settings are config, not task input
- the user-facing schema is cleaner and more product-appropriate
- the skill factory pattern enforces a consistent contract across assistants

### Sprint 3: Handoff and approval enforcement

Goal: enforce safe workflow chaining and prevent silent execution.

Files to focus on:
- skills modules that wrap multiple actions or synthesize downstream tasks
- CTO workflows are the clearest reference implementation
- any assistant module with mutating or external action behavior

Tasks:
- add same-context validation before chaining one skill’s output into another
- require explicit review before mutating actions such as send, publish, schedule, apply, or remediate
- add preview/approval states to all external actions that affect real systems
- add bulk-action safeguards for higher-volume workflows

Definition of done:
- cross-context chaining is blocked or explicitly escalated
- mutating actions require review and approval before commit
- the same object or same workflow context is required before a handoff is allowed

### Sprint 4: Assistant-specific refactors for the highest-risk modules

Goal: turn the most confusing assistants into coherent workflows rather than flat lists of capabilities.

Primary files:
- services/tool-executor/src/data/skills/cto/index.ts
- services/tool-executor/src/data/skills/education/index.ts
- services/tool-executor/src/data/skills/marketing/index.ts
- services/tool-executor/src/data/skills/product/index.ts
- services/tool-executor/src/data/skills/content/index.ts

Tasks:
- refactor CTO into clear read-only diagnostic and approval-driven execution paths
- tighten the education workflow around learner profile + plan + assessment + resource progression
- reorganize Marketing around campaign lifecycle stages instead of disconnected tactical tools
- align Product with product brief → roadmap → PRD → delivery progression
- review Content and Creative for workflow cohesion and revision history

Definition of done:
- these assistants read as coherent workflows, not tool catalogs
- stage boundaries are visible to users and reflected in the exported skill structure
- high-risk actions remain behind review/approval gates

### Sprint 5: Test, regression, and governance hardening

Goal: lock the system into the agreed product and technical structure.

Files to focus on:
- services/tool-executor/src/__tests__/
- key assistant modules and export files

Tasks:
- expand tests to cover skill classification and export consistency
- add regression tests for same-context handoff rules
- add tests for approval/confirmation behavior on mutating actions
- validate canonical vs base tool separation across the registry
- run the tool-executor test suite and fix any breakage caused by reclassification or reorder

Definition of done:
- tests assert the intended workflow boundaries and not just the existence of functions
- risky handoff and execute flows are covered
- the registry remains stable and legible after refactor

### Sprint 6: Cross-assistant consistency pass

Goal: remove the remaining generic, flat-tool feeling across low-risk assistants.

Files to focus on:
- remaining assistant modules under services/tool-executor/src/data/skills/

Tasks:
- review the remaining modules for stage structure and workflow cohesion
- consolidate near-duplicate capabilities into shared stages where possible
- ensure all assistants have a clear object or workspace context
- standardize names and stage language across the registry

Definition of done:
- the registry reads as a coherent product family rather than a collection of independent tool dumps
- each assistant has a recognizable operational pattern
- low-risk assistants are not overloaded with equal-weight actions

---

## Final Product Recommendation

The Assistants should be treated as guided work environments, not as collections of raw tools. The most important design change is not just better skill names; it is the creation of a coherent user journey for each Assistant.

The strongest default pattern is:

- start with context
- propose the next best step
- let the user review and approve
- allow handoff to the next relevant skill
- keep the decision visible and understandable

This will make the system easier to trust, easier to use, and easier to extend without creating a pile of overlapping, poorly differentiated skills.
