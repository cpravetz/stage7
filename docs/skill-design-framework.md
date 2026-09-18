# Assistant Skill Design Framework v1
### Worked example: Career Coach

This document is the reusable method for re-deriving skills on any of the 21 assistants,
worked in full for Career Coach so it can serve as the reference case. The method is the
8 steps; the fix for Career Coach is the proof it produces something better than "discrete
skills that are slightly better than raw functions."

---

## The method

1. **Domain** — what problem space does this assistant own end-to-end?
2. **Advise** — where must the assistant give the user reasoned options, not act, because the
   decision is personal, values-based, or irreversible?
3. **Proxy** — where can the assistant act *as* the user, directly, because the action is
   mechanical, low-risk, or reversible with review?
4. **Aid** — where does the user have to act personally (a call, an interview, a decision
   conversation), but the assistant can prepare the material that makes that moment easier?
5. **Higher-order skills** — group into the set of *features* a user would expect this Assistant to be capable of performing. A Skill is not a step or discrete function, as the current tools define, but an integrated process that gets to a natural outcome. This is the point where atomic CRUD functions get folded into workflows.
6. **Outputs** — for each higher-order skill, what does the user actually receive?
7. **Config & inputs** — what does the skill need to produce that output, and — critically —
   what should it *derive itself* from stored context vs. require from the user?
8. **Triggers** — user-initiated, scheduled (date/time), event-driven (new data arrived), or
   data-driven (a threshold/condition was met). Most of the original 25 tools only had one
   trigger type available: a human pressing a button. That's the tell that they were built as
   functions, not skills.

### The cross-cutting classification (applies at step 6–7)

Every skill also needs to be tagged by **what it actually depends on**:

| Class | Depends on | Original mistake |
|---|---|---|
| **Reasoning-only** | Data already in context (resume, profile, stored jobs) + the assistant's own model | Modeled as `createExternalActionSkill` requiring a third-party `endpointUrl` + `apiKey` that was never configured, so it always failed |
| **Real external integration** | A live system of record (a job board's actual API, Gmail, Notion, an ATS) | Modeled identically to reasoning-only skills — same stub shape, same fake "provider" config — so it was indistinguishable from something that couldn't possibly work |
| **Internal code** | Real data fetch, then execution on top of it with code defined for the task (lower-order tools or general tools)| Split across two disconnected tools with no shared state |
| **Hybrid** | Real data fetch, then reasoning on top of it | Split across two disconnected tools with no shared state |

Collapsing all four into one `createExternalActionSkill` factory is exactly the
over-simplification you flagged: it made "needs a stub" and "needs a real MCP/API
connection" look like the same design decision. They aren't. A skill's classification
here determines whether step 7's config schema should contain an MCP server reference,
a real credential, or nothing external at all.

---

## Applied: Career Coach

### 1. Domain
Managing a job search end-to-end: positioning (resume/profile), discovery (finding
relevant roles), execution (applying, tracking), preparation (interviews), and decisions
(offers, negotiation, networking) — as one continuous pipeline, not five unrelated tools.

### 2. Advise (assistant gives reasoned options, doesn't act)
- Should I take this offer vs. the alternative / vs. staying put?
- What's my negotiation leverage and opening position?
- Is my resume actually strong for this specific role, and why or why not?
- Is this company/role worth pursuing given my stated priorities?

These are judgment calls with the user's values at stake (risk tolerance, compensation
priorities, life circumstances). The assistant's job is to reason well and lay out
trade-offs — never to submit an acceptance or a counter-offer on the user's behalf.

### 3. Proxy (assistant acts directly, on the user's behalf)
- Searching job boards using criteria derived from the stored profile
- Scoring/ranking listings against that profile
- Filling and submitting applications using the stored resume + generated cover letter
- Tracking application status and logging outcomes
- Scheduling/sending routine follow-ups on a cadence, once the user has approved the pattern

These are high-volume, mechanical, and reversible-with-review — the textbook case for
letting the assistant just do it, with a dry-run/review gate rather than a
manually-operated button per step.

### 4. Aide (assistant prepares, user performs)
- Interview prep: likely questions, model answers grounded in the user's actual
  experience, mock Q&A
- Drafting (not sending) a specific networking message for the user to personalize and send
- Talking points for a negotiation call
- A polished resume/cover letter draft for the user's final sign-off

### 5. Higher-order skills (replacing the 25 atomic tools)

| # | Skill | Absorbs (old tool ids) | Nature |
|---|---|---|---|
| A | **Career Profile & Resume Intake** | `career_setup`, plus the missing resume-creation step | none external — local parse/store |
| B | **Job Discovery & Fit Ranking** | `career_scrape` + `career_rank` | hybrid (real board APIs, if connected, + reasoning) |
| C | **Application Execution** | `career_apply`, `career_add_portal`, `career_add_template` | hybrid (real portal submission where connected) |
| D | **Interview Preparation** | `career_interview` | reasoning-only |
| E | **Career Advisory** | `career-resume-optimizer`, `career-resume-analyzer`, `career-resume-formatter`, `career-salary-analyzer`, `career-negotiation-advisor`, `career-offer-evaluator` | reasoning-only — collapses 6 stub tools into 1 real one |
| F | **Networking & Outreach** | `career-networking-advisor`, `career-followup-advisor` | aide by default; proxy only if an outreach channel (email/LinkedIn MCP) is connected |
| G | **Pipeline Reporting & Sync** | `career_outcome`, `career_html_report`, `career_notion_sync`, `career_gmail_sync`, `career_expand`, `career_upskill` | hybrid — real sync needs real MCP connectors; reporting is reasoning-only |

`career_reset` becomes a utility action inside Profile & Resume Intake, not a standalone skill.

### 6–7. Outputs, config & inputs per skill

**A. Career Profile & Resume Intake**
- *Output:* a structured profile + parsed resume record, used as the default context for every other skill.
- *User-supplied:* an uploaded file (pdf/docx/md/txt) and a handful of preferences (target roles, salary floor, locations, exclusions) the assistant cannot infer.
- *Assistant-derived:* structured resume fields (skills, roles, dates, achievements) parsed from the upload — never re-typed by the user.
- *Config:* none external. Local storage only.

**B. Job Discovery & Fit Ranking**
- *Output:* a ranked list of current listings with a fit score and a one-line rationale per listing.
- *User-supplied (optional overrides only):* refine query, exclude a source, narrow location.
- *Assistant-derived by default:* search queries from `profile.preferences.targetRoles`/`keywords`, sources chosen by what's actually connected (real job-board MCP if present; otherwise the assistant says plainly that results are unverified/placeholder rather than silently faking listings).
- *Config:* real board integrations declared as MCP connectors, not stub API-key fields. If none are connected, the skill must say so rather than emit synthetic data as if it were real.

**C. Application Execution**
- *Output:* submitted applications (or a dry-run preview) with resume/cover letter attached, and a tracking record.
- *User-supplied:* which ranked jobs to apply to (or an auto-apply threshold they set once, e.g. "auto-apply above 85 fit score").
- *Assistant-derived:* resume and cover letter selection — always from the single stored resume record from Skill A, never a re-specified `resumeId` with no creation path.
- *Config:* real portal submission requires a real portal integration (MCP or registered submit config); without one, this reduces to "prepare the application, open it for the user to submit" rather than pretending to submit.

**D. Interview Preparation**
- *Output:* likely questions + grounded model answers + a short mock-interview script, keyed to a specific job from Skill B.
- *User-supplied:* which job, optionally which interview stage.
- *Assistant-derived:* everything else, from resume + job description already on file.
- *Config:* none external.

**E. Career Advisory** (resume strength, salary benchmarking, negotiation strategy, offer evaluation)
- *Output:* a reasoned recommendation with trade-offs stated explicitly, not a single verdict.
- *User-supplied:* the specific question/decision (e.g., the competing offer terms).
- *Assistant-derived:* everything else, from stored resume/profile/job history — no external "optimization provider" required, because this is exactly the reasoning an LLM assistant should do natively.
- *Config:* optional — salary benchmarking is *stronger* with a real market-data MCP connector if one exists, but functions without one by reasoning from general knowledge with appropriate caveats. That optionality (works standalone, improves if connected) is the correct shape — not a hard dependency on an unconfigured stub.

**F. Networking & Outreach**
- *Output:* a drafted, personalized outreach message and a follow-up cadence.
- *User-supplied:* who, and what relationship stage.
- *Assistant-derived:* tone and content from profile + target company/role.
- *Config:* drafting needs nothing external. Actually *sending* requires an explicit, connected channel (email/LinkedIn MCP) and always stays confirm-before-send — this is where proxy has a hard line.

**G. Pipeline Reporting & Sync**
- *Output:* a status rollup (applications, interviews, offers) and, where connected, a sync to the user's actual tracking system.
- *User-supplied:* nothing, ordinarily.
- *Assistant-derived:* pulled from Skill C's tracking data.
- *Config:* real sync (Notion, Gmail) requires a real MCP connector; reporting itself does not.

### 8. Triggers

| Skill | User-initiated | Scheduled | Event-driven |
|---|---|---|---|
| A | "here's my resume" | — | — |
| B | "find me jobs" | daily/weekly digest of new matches | a new listing crosses the user's fit threshold |
| C | "apply to these" / auto-apply setting | — | — |
| D | "prep me for this interview" | — | an interview is detected/logged (via G) |
| E | "should I take this offer" | — | an offer is logged |
| F | "draft outreach to X" | scheduled follow-up cadence | a contact hasn't replied in N days |
| G | "how's my pipeline" | weekly summary | a status changes (rejection, interview, offer) |

This is the piece the original design was missing entirely: only "user presses a
button" existed as a trigger. A real career-coach *assistant* should notice that
a promising job appeared, that a follow-up is overdue, or that an interview was
just scheduled, and proactively surface that — not wait to be operated.

---

## Applying this to the other 20 assistants

The repeatable part is steps 1–5: domain → advise/proxy/aide → collapse into
outcome-shaped skills. The repeatable failure to check for is the same one found
here — atomic CRUD exposed as user-facing "skills," advisory reasoning wrongly
modeled as external stub calls, and no trigger besides manual invocation. Grading
an assistant "A" complete should mean all of steps 6–8 are filled in for every
skill, with the classification table applied honestly — not that the stub shape
compiles.

---

## Applied: The Other 20 Assistants

Detailed 8-step assessments for every assistant below live in `docs/assistant-skill-assessments/`. Each follows the same method in this document: domain → advise/proxy/aide → outcome-shaped skills → outputs, config & inputs → triggers, with the reasoning-only / real-external / hybrid classification applied honestly.

### Business

| Assistant | Assessment |
|---|---|
| Product Manager | [product.md](assistant-skill-assessments/product.md) |
| Content Creator | [content.md](assistant-skill-assessments/content.md) |
| Event Planner | [event.md](assistant-skill-assessments/event.md) |
| Legal Advisor | [legal.md](assistant-skill-assessments/legal.md) |
| Sales CRM | [sales.md](assistant-skill-assessments/sales.md) |

### People

| Assistant | Assessment |
|---|---|
| Education | [people.md](assistant-skill-assessments/people.md) |
| HR | [people.md](assistant-skill-assessments/people.md) |
| Executive | [people.md](assistant-skill-assessments/people.md) |
| Marketing | [people.md](assistant-skill-assessments/people.md) |
| Support | [people.md](assistant-skill-assessments/people.md) |

### Specialists

| Assistant | Assessment |
|---|---|
| Analytics | [specialists.md](assistant-skill-assessments/specialists.md) |
| Songwriter | [specialists.md](assistant-skill-assessments/specialists.md) |
| Scriptwriter | [specialists.md](assistant-skill-assessments/specialists.md) |
| Finance | [specialists.md](assistant-skill-assessments/specialists.md) |
| Healthcare | [specialists.md](assistant-skill-assessments/specialists.md) |

### Operations

| Assistant | Assessment |
|---|---|
| Restaurant Operations | [operations.md](assistant-skill-assessments/operations.md) |
| Hotel Operations | [operations.md](assistant-skill-assessments/operations.md) |
| Sports Wager Advisor | [operations.md](assistant-skill-assessments/operations.md) |
| CTO | [operations.md](assistant-skill-assessments/operations.md) |
| Investment Advisor | [operations.md](assistant-skill-assessments/operations.md) |

### Cross-Cutting Findings

**Outcome-shaped skills.** Every assessment collapses many atomic tools into higher-order skills named after user outcomes ("draft a lesson plan," "book a room," "analyze this matchup") rather than system actions. Skill counts range from 4 to 9 depending on domain complexity (Finance uses 8 rows, Healthcare uses 9); the count is small enough to navigate and large enough to own an end-to-end domain.

**Advise / Proxy / Aide boundaries.** In every case, Advise stays strictly advisory—values-based, irreversible decisions are never executed. Proxy handles high-volume mechanical work behind confirm-before-live gates. Aide prepares material for a human moment the user must personally perform. No assessment lets the assistant sign contracts, place bets, submit legal filings, or fire staff. These boundaries describe intended design; in the current source, not every assistant has implemented all three modes for every skill.

**Shared state.** Where implemented, a small set of shared state keys (e.g., `sales.opportunities[]`, `event.plan`, `product.context`) flows between skills, so one skill's output becomes the next skill's input. Most assistants do not have functioning shared state today: Finance and Healthcare external skills share no state; Songwriter and Scriptwriter share only a local drafts store (`CREATIVE_HOME/drafts.json`); Analytics has only a local metrics store. Proposed shared-state contracts exist in several assessments but are not yet wired into the source.

**Reasoning-only vs. real external vs. hybrid classification.** Every skill is tagged by what it actually depends on. Reasoning-only skills need no connector and work offline. Real-external skills require a live MCP/API connection and degrade to dry-run or an explicit "not connected" when unconfigured. Hybrid skills fetch external data then reason on top of it, and must share state with the skill that owns the data source. In the current source, many skills modeled as real-external are stubs or catalog-only bindings with no implementation; the classification indicates the intended design shape, not current availability.

**Honest connector fallback.** When a connector is absent, no assessment permits faking live data. The intended behavior is to return `mode: "dry-run"`, state plainly that the connector is unconfigured, and offer a locally-derived alternative. This is the single most consistent pattern across all 20 assessments: every external shell must be honest about its connectivity. Note: this is the intended behavior; actual source implementations vary—some connectors are stubs returning dry-run, while others are unimplemented catalog-only bindings.

**Confirmation gates.** Every external write—and in several cases any state mutation—requires a dry-run preview and explicit user confirmation. Destructive actions, financial commitments, external sends, and limit changes carry additional gates. Gates are defined as policy for all 20 assessments but are not uniformly enforced in code; scheduled and event-driven triggers must never bypass them regardless.

**Trigger types.** The original designs universally lacked triggers beyond user-initiated ("press a button"). Every mature assessment adds scheduled (cadences/digests), event-driven (state changes, webhooks), and data-driven (threshold crossings) triggers, making the assistant proactive rather than purely reactive. Most trigger types are proposed in the assessments rather than implemented in current source code; where defined, they create drafts, alerts, or review items and do not bypass confirmation gates.


---

## Appendix: Product Manager — Business Assistant Assessment

### Domain
Owns the product decision and delivery loop end-to-end: discover/structure customer and business needs, define requirements and success measures, prioritize and roadmap outcomes, coordinate delivery, inspect product evidence, and align stakeholders — connected through persistent product context.

### Advise
- Which problem, segment, or outcome receives next capacity and what trade-offs each creates
- How goals/initiatives should be scored, sequenced, or de-scoped given dependencies, risk, capacity
- What adoption, retention, funnel, or experiment results imply; whether evidence supports launch/iterate/rollback
- What to publish, escalate, or negotiate with engineering, leadership, customers, or partners
Assistant presents options, assumptions, evidence, consequences; never makes scope, launch, pricing, or stakeholder decisions.

### Proxy
- Parse product documents; generate local PRD/roadmap drafts
- Query Jira, Confluence, analytics, Slack, calendar; normalize and summarize
- Prepare Jira issue payloads, Confluence page bodies, calendar proposals, stakeholder-message drafts
- Maintain local product, delivery, approval records; produce recurring summaries
Live external writes gated; reads, calculations, drafts, dry runs are proxy work.

### Aide
- Prepare PRD review pack, roadmap review, release-readiness brief, decision memo
- Draft stakeholder updates, release notes, meeting agendas, talking points for user to personalize
- Prepare customer-discovery questions, experiment readouts, escalation options
- Surface open questions, missing acceptance criteria, assumptions, risks, unresolved dependencies
User conducts conversations, approves decisions, performs external communication/commitments.

### Higher-Order Skills

| # | Skill | Current IDs Absorbed | Nature |
|---|-------|---------------------|--------|
| A | Requirements & Discovery | `write-prd`, `product-markdown-parsing` | Hybrid: local PRD generation + external parser (local fallback) |
| B | Roadmap & Portfolio Planning | `create-roadmap` | Reasoning-only: local algorithmic prioritization, sequencing, capacity, risks, OKRs |
| C | Product Evidence & Analytics | `product-data-analysis` | Hybrid: live analytics/BI data + metric interpretation; no synthetic data |
| D | Delivery Coordination | `product-jira`, `product-calendar` | Hybrid: live Jira/calendar reads/writes + delivery reasoning |
| E | Knowledge & Stakeholder Operations | `product-confluence`, `product-slack` | Hybrid: live Confluence/Slack ops + drafting, formatting, audience-aware reasoning |

### Outputs & Config/Inputs

**A. Requirements & Discovery** — Output: structured source model + PRD with problem, scope, goals, metrics, non-goals, questions, users, INVEST stories, acceptance criteria, requirements, dependencies, assumptions, risks, rollout criteria. User-supplied: markdown/doc content, problem statement, scope, audience, optional goals/metrics/constraints. Assistant-derived: document sections, story drafts, acceptance criteria, requirement categories, UX flows, rollout phases, gap list. Config: `write-prd` none external; `product-markdown-parsing` requires `MARKDOWN_PARSER_API_URL/KEY`. Fallback: local markdown extraction labeled unverified; ask for missing problem/scope.

**B. Roadmap & Portfolio Planning** — Output: roadmap with RICE/WSJF scores, dependency order, quarter/capacity allocation, milestones, risks, themes, OKRs, critical path, utilization. User-supplied: optional quarter, goals, initiatives, themes, timeHorizon, capacity. Assistant-derived: scores, ordering, scheduling, milestones, risk flags, theme balance, OKR scaffolding. Config: none external. Fallback: draft with missing inputs marked as assumptions/gaps.

**C. Product Evidence & Analytics** — Output: metric series, cohort/retention/funnel views, trend/anomaly summary, interpretation, caveats, recommended action. User-supplied: metric, dimensions/filters, date range, granularity, dataset override. Assistant-derived: query normalization, comparisons, cohort/funnel interpretation, signal-vs-noise caveats, decision options. Config: live analytics/BI connector (`PRODUCT_ANALYTICS_API_URL/TOKEN`). Fallback: cached/user data marked stale/local; never fabricate metrics.

**D. Delivery Coordination** — Output: Jira issue/sprint records or dry-run payloads, dependency/status rollups, release-readiness, calendar events/proposals, action list, change audit. User-supplied: Jira operation/project/issue details; calendar operation/summary/times/attendees. Assistant-derived: default project/issue mappings, normalized status/dependency summaries, conflict checks, reminders, change diffs. Config: Jira (`JIRA_BASE_URL/EMAIL/TOKEN`), Calendar (`CALENDAR_API_URL/ACCESS_TOKEN`). Fallback: prepare payload/local plan, return explicit "not executed."

**E. Knowledge & Stakeholder Operations** — Output: Confluence page/space records or dry-run bodies, Slack message/channel results or drafts, stakeholder updates, release notes, audience/tone variants, publication audit. User-supplied: Confluence operation/space/page/title/body; Slack operation/channel/text. Assistant-derived: page/message structure, audience wording, summaries from product/delivery state, formatting, suggested recipients. Config: Confluence (`CONFLUENCE_BASE_URL/EMAIL/TOKEN`), Slack (`SLACK_BASE_URL/BOT_TOKEN`). Fallback: local draft, "not published/sent."

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Content Creator — Business Assistant Assessment

### Domain
Owns the content lifecycle end-to-end: goals, audience, voice, and channel strategy; trend and audience research; editorial planning; drafting, adaptation, and repurposing; SEO and performance analysis; publishing or scheduling; and evidence-led iteration through shared campaign and content state.

### Advise
- Which topics, formats, channels, and campaign sequence best serve the goal and audience
- Whether a piece should publish now, be scheduled, revised, localized, or held
- Which headlines, hooks, CTAs, keywords, and claims balance reach, accuracy, and brand trust
- What traffic, engagement, conversion, ranking, and audience signals imply for the next investment
The assistant presents options, assumptions, trade-offs, and confidence; the user approves strategy and public action.

### Proxy
- Create local drafts, outlines, adaptations, repurposed variants, metadata, and channel copy
- Build an editorial plan and calendar from goals, audience, constraints, and stored content
- Retrieve and normalize trends, audience insights, analytics, and SEO data from connected providers
- Prepare and validate publish, schedule, update, delete, and retrieval payloads as dry runs
- Maintain local content, campaign, calendar, research, and approval records

### Aide
- Prepare content briefs, editorial calendars, campaign plans, and review packets
- Draft headlines, hooks, outlines, blog copy, social variants, video scripts, newsletters, and localization options
- Prepare SEO checklists, keyword maps, performance narratives, audience summaries, and optimization recommendations
- Assemble a channel, audience, schedule, metadata, and risk preview for user approval

### Higher-Order Skills

| # | Skill | Exact current IDs | Nature |
|---|---|---|---|
| A | Editorial Strategy & Planning | `content-planner` | Hybrid: local planning; live planner binding requires a real connector |
| B | Trend & Audience Research | `content-trend-analysis`, `content-audience-insights` | Hybrid: external research plus assistant synthesis |
| C | Drafting & Adaptation | `content_drafting_adaptation`, `draft-blog-post`, `social-media-post`, `content-adaptation` | Reasoning-only: source implementation is local; aliases are catalog-only |
| D | SEO & Performance Intelligence | `content_performance_seo`, `content-seo`, `content-analytics` | Hybrid: external analytics/SEO data plus interpretation |
| E | Multi-Channel Publishing | `content_multi_channel_publishing`, `content-blog-platform`, `content-video-platform` | Real external: live CMS/social/video/newsletter action |

The source export implements `content_drafting_adaptation`, `content_performance_seo`, and `content_multi_channel_publishing`; the other listed IDs are current catalog-only bindings.

### Outputs & Config/Inputs

**A. Editorial Strategy & Planning** — Output: brief, audience/channel strategy, topic backlog, calendar, milestones, KPI hypotheses, assumptions, and gaps. User-supplied: goal, brand/product, audience, channels, dates, constraints, tone, content types, and KPI priorities. Assistant-derived: themes, channel mix, slots, priorities, briefs, and missing inputs. Config/fallback: local planning needs no connector; `content-planner` is catalog-only, so live planning requires a real connector and otherwise returns a labeled local plan.

**B. Trend & Audience Research** — Output: dated reports with sources/provenance, scope, segments, demand signals, competitor observations, recommended topics, confidence, and caveats. User-supplied: question, market/region, date range, platforms, audience hypotheses, and competitors. Assistant-derived: queries, source selection, normalization, synthesis, opportunities, and caveats. Config/fallback: real provider connectors and credentials; without one, use only user/stored observations marked stale or unverified and never fabricate trends.

**C. Drafting & Adaptation** — Output: saved draft record with `id`, task, content type, topic, outline/draft, adapted or repurposed versions, word count, and `storePath`; current code emits outline/template-style content. User-supplied: `task`, `contentType`, topic or `sourceContent`, target format/platform/language/audience, tone, length, and keywords. Assistant-derived: outline, copy, variants, metadata, ID, and path. Config/fallback: none external; `CONTENT_HOME` defaults to `/tmp/content/drafts.json`; missing adaptation source returns an explicit error and incomplete briefs stay visibly incomplete.

**D. SEO & Performance Intelligence** — Output: metrics, trends, comparisons, rankings, segments, audit findings, recommendations, provider, freshness, and caveats. User-supplied: operation, content IDs, channel, date range, metrics, dimensions, filters, URL, keywords, market, and competitors. Assistant-derived: provider/query selection, normalized metrics, gaps, segments, and priorities. Config/fallback: `CONTENT_INTELLIGENCE_ENDPOINT` plus `CONTENT_INTELLIGENCE_API_KEY`; absent connector returns dry-run/error and only cached or user data labeled stale, never synthetic current metrics.

**E. Multi-Channel Publishing** — Output: channel payload and external result with operation status, external IDs/URLs, response, and errors; dry-run exposes the proposed request. User-supplied: channel, operation, content fields, and platform-specific social/video/newsletter fields. Assistant-derived: payload mapping, defaults, status, schedule, and external IDs from the response. Config/fallback: `CONTENT_PUBLISHING_ENDPOINT` plus bearer `CONTENT_PUBLISHING_ACCESS_TOKEN`; absent or failed connector returns validation/dry-run/error and never claims publication.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Event Planner — Business Assistant Assessment

### Domain
Owns the event lifecycle end-to-end: objectives, format, timeline, budget, vendor and contract procurement, seating and access, day-of monitoring and incident response, and post-event reconciliation, connected through a canonical event plan and external systems of record.

### Advise
- Whether a venue or vendor deposit is acceptable given cancellation and force-majeure terms
- Which contract liability clause fits the organization’s risk appetite
- Whether to release payment now or hold it for deliverable verification
- Whether budget allocation and contingency match the event type, scale, and risk register
- Whether QR, badge-scan, manual, or facial-recognition check-in fits privacy and throughput needs
The assistant explains trade-offs and recommendations; the user or authorized operator approves commitments and external actions.

### Proxy
- Generate a local plan, category budget, phase timeline, and risk register from event facts
- Score and rank venue/vendor options against budget and criteria
- Optimize seating within table, layout, and preference constraints as a preview
- Schedule payment reminders, contract-renewal nudges, and approved staff-alert drafts
- Maintain plan, vendor, contract, payment, seating, check-in, monitoring, and issue records

### Aide
- Prepare the run-of-show, BEO, seating chart, and table plan for sign-off
- Draft contract terms, payment schedules, and vendor communications for legal/finance review
- Prepare issue-response playbooks, escalation paths, and day-of staff briefings
- Draft the post-event survey, reconciliation checklist, and stakeholder report

### Higher-Order Skills

| # | Skill | Exact current source ID | Nature |
|---|---|---|---|
| A | Event Planning & Budgeting | `event_planning_budgeting` | Reasoning-only: local code and `EVENT_HOME` store |
| B | Vendor & Contract Management | `event_vendor_contract_management` | Real external: vendor platform connector |
| C | Day-of Seating & Access | `event_day_of_operations` | Real external: operations platform connector |
| D | Day-of Monitoring & Incident Response | `event_day_of_operations` | Real external: same operations connector, distinct outcome |

The current export has three implementation IDs; C and D split the overloaded `event_day_of_operations` outcome because their triggers differ. Legacy catalog-only IDs are `plan-event`, `event-budget-tracker`, `event-vendor-database`, `event-seating`, `event-monitor`, `event-check-in`, `event-contract`, and `event-payment`.

### Outputs & Config/Inputs

**A. Event Planning & Budgeting** — Output: structured event plan with facts, categories, allocated/spent/committed values, phases, vendors, risks, KPIs, and `EVENT_HOME/plans.json` (default `/tmp/event`). User-supplied: required `eventName`, type, date, venue, attendees, `budgetTotal`, and optional breakdown, vendors, risks, and timeline. Assistant-derived: source defaults (Venue 30%, Catering 25%, A/V 15%, Marketing 10%, Speakers 10%, Staffing 5%, Decor 5%, plus a separate 10% contingency), phases, risks, and KPIs. Config/fallback: none external; works offline and returns incomplete drafts when required facts are absent.

**B. Vendor & Contract Management** — Output: external-envelope vendor, contract, payment, invoice, and 1099 records. User-supplied: operation, IDs/data, `eventId`, filters, optional endpoint, and `dryRun`. Assistant-derived: payment schedules, invoice/1099 preparation, and validation. Config/fallback: `baseUrl`, `token`, `provider`, optional payment providers/templates/terms/workflows, and `EVENT_VENDOR_ACCESS_TOKEN`; absent connector returns dry-run/error, while `contract-sign` and `payment-send` are refused and must be performed in-platform.

**C. Day-of Seating & Access** — Output: seating assignments, check-in records/reports, and dry-run payloads from `event_day_of_operations`. User-supplied: operation, required `eventId`, session/attendee/table identifiers, seat/check-in data, optional endpoint, and `dryRun`. Assistant-derived: optimized seating and throughput reports. Config/fallback: operations `baseUrl`, `token`, `provider`, check-in methods, seating engine, dashboard, and channels via `EVENT_OPERATIONS_ACCESS_TOKEN`; absent connector yields a manual seating recommendation and explicit “operations platform not connected,” never a fake scan.

**D. Day-of Monitoring & Incident Response** — Output: attendance, capacity, flow, issue-log/resolution, broadcast status, and run-of-show updates. User-supplied: operation, required `eventId`, session, issue/alert data, optional endpoint, and `dryRun`. Assistant-derived: thresholds, escalation routing, and issue summaries. Config/fallback: same operations connector; without a live feed, monitoring reports unavailable, alerts remain drafts, and issue records stay in an exportable local queue.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Legal Advisor — Legal Assistant Assessment

### Domain
Owns legal-work intake and decision support: contract review and clause drafting, authority research, compliance and risk analysis, matter administration, document control and privilege handling, and eDiscovery. The assistant organizes and analyzes work but does not replace counsel, sign documents, file pleadings, or bind the user.

### Advise
- Whether to accept, reject, or revise contract terms and the trade-offs of liability, termination, IP, confidentiality, payment, and dispute clauses
- Which authorities support a position, how binding/current they are, and what uncertainty remains
- Which obligations apply and which remediation option fits the facts and risk tolerance
- How to prioritize litigation, contractual, regulatory, and reputational risk
- How to handle privilege, discovery scope, production, deadlines, settlement, or escalation
The assistant provides options, evidence, assumptions, and consequences; the user or qualified counsel decides.

### Proxy
- Search configured authority, statute, case-law, compliance, risk, case-management, tagging, and eDiscovery systems
- Create local review/clause records; normalize, tag, deduplicate, and index documents
- Calculate deadlines, risk scores, issue lists, review priorities, and matter timelines
- Prepare reversible discovery searches/exports and external payloads as dry runs

### Aide
- Prepare redline summaries, clause alternatives, negotiation positions, and signing checklists
- Draft research briefs with citations, dates, jurisdiction, and negative-treatment warnings
- Prepare compliance matrices, remediation plans, risk memos, escalation packets, and case timelines
- Prepare document questions, privilege logs, collection plans, review instructions, and production manifests for human approval

### Higher-Order Skills

| # | Skill | Exact current IDs | Nature |
|---|---|---|---|
| A | Contract Review & Drafting | `review-contract`, `draft-clause` | Reasoning-only: local code; template-based current implementation |
| B | Authority Research & Case Law | `legal-research`, `legal-statute-database`, `legal-case-search` | Hybrid: external retrieval plus synthesis |
| C | Compliance & Legal Risk | `legal-compliance`, `legal-risk-assessment` | Hybrid: external rules/risk service plus reasoning |
| D | Matter & Case Administration | `legal-case-management` | Hybrid: external matter system plus workflow reasoning |
| E | Document Control, Privilege & eDiscovery | `legal-document-tagging`, `legal-ediscovery` | Hybrid: external document/discovery systems plus review reasoning |

### Outputs & Config/Inputs

**A. Contract Review & Drafting** — Output: saved review (`id`, `contractType`, `textLength`, risks, clauses, `createdAt`, `source`, `storePath`) or clause (`id`, `clauseType`, terms, text, metadata, path), plus issue/redline summary and disclaimer. User-supplied: required `contractText` or `clauseType`, optional type/terms, jurisdiction, posture, risk tolerance, and approval constraints. Assistant-derived: labels, severity, status, draft text, metadata, and questions. Config/fallback: no external connector; `LEGAL_HOME` defaults to `/tmp/legal`; incomplete input remains an incomplete/template result, never a legal conclusion.

**B. Authority Research & Case Law** — Output: authority packet with query, jurisdiction, date range, ranked sources, citations/identifiers, source dates, treatment status, and uncertainty-aware synthesis. User-supplied: required query, jurisdiction, date range, sources, max results, optional endpoint, and `dryRun`. Assistant-derived: source selection, weights, citation format, deduplication/ranking, currency checks, and synthesis. Config/fallback: research/statute/case endpoints and their bearer/API credentials; absent connector uses only user/stored authorities marked unverified and never invents citations.

**C. Compliance & Legal Risk** — Output: compliance matrix, remediation actions, owners/dates, risk factors, score/level, scenario, mitigations, and residual risk. User-supplied: document text or facts, jurisdiction/regulation/effective date or matter/risk factors/documents, optional endpoint, and `dryRun`. Assistant-derived: rule mapping, factors, severity/score, evidence gaps, mitigations, deadlines, and audit metadata. Config/fallback: compliance/risk endpoints plus API keys; absent connector returns dry-run/local analysis labeled not checked against live rules and never issues an attestation.

**D. Matter & Case Administration** — Output: matter/case record and timeline with status, parties/client, jurisdiction, deadlines, tasks, team, billing reference, and audit trail. User-supplied: operation, `caseId` where required, `caseData`, client/matter IDs, optional endpoint, and `dryRun`. Assistant-derived: default workspace/matter identity, normalized status, deadlines, template fields, tasks, reminders, and audit metadata. Config/fallback: `LEGAL_CASE_MANAGEMENT_ENDPOINT`, bearer `LEGAL_CASE_MANAGEMENT_ACCESS_TOKEN`, workspace/deadline/collaboration/billing config; absent connector returns dry-run/local draft and never claims a live mutation.

**E. Document Control, Privilege & eDiscovery** — Output: tags/index, privilege/work-product flags, collection/search/review/export runs, manifests, review assignments, production manifest, and privilege log. User-supplied: document ID/content/tags/taxonomy/matter or eDiscovery operation/custodians/date range/search terms, optional endpoint, and `dryRun`. Assistant-derived: taxonomy mapping, privilege detection, deduplication, collection/review priority, production format, and log fields. Config/fallback: tagging endpoint/API key and eDiscovery endpoint/bearer token; absent connector returns local plans only—no collection, export, production, or external write.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: CTO / Engineering Leadership Assistant Assessment

### Domain
Owns technical leadership end-to-end: architecture review, tech stack selection, cloud infrastructure, engineering operations, observability, deployment, and team management — as a continuous strategic-technical advisory system, not 15 disconnected tools.

### Advise
- Should we migrate to microservices or optimize the monolith first?
- Given compliance requirements and team expertise, which cloud/service mix is optimal?
- Is our current on-call load sustainable, and what's the burnout risk?
- Should we invest in DevOps automation or hire more engineers first?

These are strategic decisions with organizational and financial stakes. The assistant reasons through trade-offs with evidence — never creates Jira tickets, deploys infrastructure, or commits code autonomously.

### Proxy
- Running architecture pattern detection and concern identification from requirement text
- Scoring and ranking tech stack candidates against weighted multi-factor criteria
- Computing DORA metrics, system health snapshots, and cost analyses from connected systems
- Aggregating incident status, on-call schedules, and resource utilization from live platforms

These are high-volume, mechanical, and reversible-with-review — the textbook case for proxy action with dry-run/review gates.

### Aide
- Drafting an architecture decision record (ADR) with trade-offs and risk assessment (user reviews/approves)
- Preparing a cloud cost optimization report with recommendations (user decides which to fund)
- Creating a talent gap analysis and hiring plan (user approves budget/roles)
- Summarizing technical debt items with prioritization for a leadership review (user sets priorities)

### Higher-Order Skills

| # | Skill | Exact Current IDs | Nature |
|---|---|---|---|
| A | Architecture & Tech Strategy | `architecture-review`, `tech-stack-recommendation` | reasoning-only — algorithmic from requirement text + local knowledge base; no external connection needed |
| B | Cloud Infrastructure & Cost | `cto-aws`, `cto-gcp`, `cto-azure`, `cto-cost-optimization` | real external — live cloud provider APIs and cost platform; all are stub connectors |
| C | Engineering Operations | `cto-jira`, `cto-github` | real external — live Jira/GitHub instances with credentials; stub connectors |
| D | Observability & Incident Management | `cto-datadog`, `cto-pagerduty` | real external — live Datadog/PagerDuty instances; stub connectors |
| E | Infrastructure, Deployment & Reliability | `cto-kubernetes`, `cto-iac-monitoring`, `cto-service-mesh`, `cto-database-operations`, `cto-disaster-recovery`, `cto-team-metrics` | real external — live K8s cluster, IaC monitoring, service mesh, DB, DR, and team metrics APIs; all stub connectors |

### Outputs & Config/Inputs

**A. Architecture & Tech Strategy** — Output: architecture reviews with detected patterns/concerns/recommendations, tech stack recommendations with ranked candidates and factor breakdowns, ADR drafts. User-supplied: system name, requirements text, project description, constraints (scale, budget, compliance, team skills, timeline). Assistant-derived: pattern detection from keyword analysis, technology inference, architecture style, concerns, recommendations, ranked candidates with scores. Config: none external required — entirely algorithmic from local knowledge base (`architecture-patterns.json`, `tech-stacks.json`); no connector fallback needed.

**B. Cloud Infrastructure & Cost** — Output: cloud spend reports, resource status across AWS/GCP/Azure, anomaly detection, cost optimization recommendations, reserved instance suggestions. User-supplied: resource types, regions, analysis periods. Assistant-derived: spend summaries, anomaly flags, waste identification from cloud APIs. Config: cloud provider API endpoints + credentials required per provider. Fallback: "no cloud connector configured for [provider]." Cost optimization endpoint optional but enhances recommendations.

**C. Engineering Operations** — Output: Jira issues/PRs/sprints, GitHub security alerts, repository stats, PR creation. User-supplied: project keys, issue summaries, repository names, descriptions. Assistant-derived: issue creation, status aggregation, alert summaries. Config: Jira base URL + email + API token; GitHub base URL + token required. Fallback: "read-only mode — cannot create/update issues."

**D. Observability & Incident Management** — Output: DORA metrics, system health dashboards, active incidents, on-call schedules. User-supplied: service names, dashboard IDs, team names. Assistant-derived: metric queries, health assessments, incident summaries, schedule lookups. Config: Datadog base URL + API/application keys; PagerDuty base URL + token required. Fallback: "no observability connector configured."

**E. Infrastructure, Deployment & Reliability** — Output: K8s cluster health, IaC drift scans, service mesh topology, DB instance status, DR compliance, team capacity/burnout metrics. User-supplied: cluster names, namespaces, workspaces, team IDs, database instances. Assistant-derived: health checks, drift detection, dependency maps, performance analysis, capacity forecasts. Config: K8s endpoint + token; IaC monitoring endpoint + API key; service mesh endpoint + token; DB operations endpoint + token; DR endpoint + token; team metrics endpoint + token all required per service. Fallback: "[service] not configured."

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Investment Advisor Assistant Assessment

### Domain
End-to-end investment management: portfolio analysis, market data, quantitative research, risk assessment, optimization, and financial planning — as a continuous analytical advisory system, not 8 disconnected tools.

### Advise
- Should I rebalance now, or wait for a different market condition?
- Given my risk tolerance and time horizon, is this allocation appropriate or does it need adjustment?
- Is this stock fairly valued relative to its sector and historical range?
- Should I prioritize tax-loss harvesting or contribution increases this year?

These are financial decision-making calls with real money at stake. The assistant reasons through trade-offs and quantifies scenarios — never executes trades, never transfers funds, never commits capital.

### Proxy
- Running portfolio risk calculations (VaR, stress tests, factor decomposition) from provided data
- Computing efficient frontiers, efficient allocations, and Sharpe-optimal portfolios
- Scoring and ranking investment opportunities using multi-criteria models
- Running Monte Carlo projections for retirement/goal timelines

### Aide
- Drafting a rebalancing plan with specific trades, tax implications, and rationale (user reviews/executes)
- Preparing an investment opportunity memo with scoring, peer comparison, and valuation analysis (user decides)
- Creating a financial plan draft with retirement projections, tax strategies, and goal tracking (user finalizes)
- Summarizing portfolio risk exposure in plain language with action items (user decides risk tolerance adjustments)

### Higher-Order Skills

| # | Skill | Exact Current IDs | Nature |
|---|---|---|---|
| A | **Portfolio Analysis & Planning** | `portfolio-analysis`, `investment-financial-planner` | Hybrid — local portfolio data (code skill) + financial planning engine (stub requiring endpoint+API key) |
| B | **Market Data & Research** | `investment-market-data`, `investment-market-research` | Real external — live market data APIs (Bloomberg, Refinitiv, AlphaVantage, Polygon) and research platforms (FactSet, Morningstar); all stub connectors |
| C | **Quantitative Analysis & Evaluation** | `investment-analysis`, `investment-evaluator`, `investment-portfolio-optimizer` | Hybrid — real optimization/risk models (external stubs) + reasoning over results |
| D | **Risk Management** | `investment-financial-risk-assessment` | Real external — requires risk calculation platform; stub connector |

### Outputs & Config/Inputs

**A. Portfolio Analysis & Planning** — Output: portfolio holdings analysis with allocation/risk/return metrics, financial plans with retirement/tax/estate projections, Monte Carlo outcome distributions, goal tracking. User-supplied: holdings, risk tolerance, age/income/goals, time horizon, tax status. Assistant-derived: allocation analysis, risk metrics (Sharpe, max drawdown), projected outcomes, tax optimization opportunities, retirement readiness. Config: financial planning engine connector optional — without it: algorithmic planning from general knowledge with disclaimers ("not a licensed financial planner"). Portfolio analysis runs locally with no external dependency.

**B. Market Data & Research** — Output: real-time/historical quotes, fundamentals, options chains, analyst reports, earnings data, ESG scores, economic calendars. User-supplied: symbols, date ranges, data types (optional: specific providers). Assistant-derived: aggregated market data, research summaries, comparative metrics. Config: market data API key + endpoint required for live quotes; research platform credentials required for analyst reports. Without: "no market data connector — analysis based on user-supplied holdings only." Must be explicit, not silent.

**C. Quantitative Analysis & Evaluation** — Output: DCF/comps/factor model valuations, portfolio optimization (efficient frontier, risk parity, Black-Litterman), security scoring/ranking, peer comparison. User-supplied: portfolio data, symbols, constraints (optional: model parameters). Assistant-derived: valuations, optimal allocations, scores, peer rankings, factor exposures. Config: analysis/optimizer/evaluator APIs optional. Without them: algorithmic analysis from user-supplied data + model reasoning with caveats.

**D. Risk Management** — Output: portfolio VaR, stress test results, factor risk decomposition, liquidity/credit exposure, regulatory capital calculations. User-supplied: portfolio holdings, confidence levels, holding periods (optional: regulatory framework). Assistant-derived: VaR estimates, scenario losses, risk concentrations, compliance status. Config: risk assessment API optional. Without it: algorithmic risk estimation from portfolio data with statistical caveats.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Sales CRM — Business Assistant Assessment

### Domain
End-to-end sales pipeline management: lead capture → scoring/qualification → opportunity tracking → outreach & meeting execution → proposal/quote generation → deal closure → forecasting & analytics. The assistant owns the full revenue loop, not discrete CRM buttons.

### Advise
- Lead prioritization: scoring dimensions/weights matching ICP; when to override the model.
- Pipeline health & forecast confidence: weighted pipeline vs. quota; which deals to push, park, disqualify.
- Outreach approach: channel, cadence, tone, sequence design per segment; compliance boundaries.
- Proposal/quote structure: packaging, pricing tiers, discount authority, approval routing.
- Deal strategy: competitive positioning, negotiation levers, close plan per opportunity.
- Meeting preparation: discovery questions, objection-handling framework, next-step commitments per stage.

### Proxy
- CRM sync: create/read/update leads, contacts, accounts, opportunities, activities (Salesforce/HubSpot/Pipedrive).
- Email outreach send via connected provider (SendGrid/Mailgun/SES/Brevo) with tracking.
- Meeting scheduling via Google/Outlook/Calendly; send invites.
- Proposal generation: render docs from templates, populate pricing, queue for e-signature.
- Analytics queries: pipeline velocity, win-rate, quota-attainment, cohort reports.
- Lead scoring execution and forecast computation from opportunity data.

### Aide
- Discovery call prep: agenda, likely questions, competitor battlecards, tailored value props.
- Demo script & run-through: flow, data stories, objection responses personalized to prospect.
- Proposal/quote review package: formatted doc, pricing rationale, discount justification, approval checklist.
- Negotiation talking points: concession matrix, walk-away terms, creative options.
- Follow-up email drafts: contextual, personalized, ready for user to edit/send.
- Forecast narrative: executive-ready summary with drivers, risks, recommendations.

### Higher-Order Skills

| # | Skill | Current IDs | Nature |
|---|-------|-------------|--------|
| A | Lead Intelligence & Scoring | `score-leads` | reasoning-only |
| B | Pipeline Forecasting & Health | `forecast-sales` | reasoning-only |
| C | CRM Data Synchronization | `sales-crm` | real external |
| D | Email Outreach Execution | `sales-email-outreach` | real external |
| E | Meeting Lifecycle Management | `sales-meeting-assistant` | real external |
| F | Proposal & Quote Generation | `sales-proposal-generator` | real external |
| G | Sales Analytics & Reporting | `sales-analytics` | real external |

### Outputs & Config/Inputs

**A. Lead Intelligence & Scoring** — Output: ranked lead list with score (0–100), category, dimension breakdown, recommended action. User-supplied (optional): `weights`, `threshold`, explicit `leads` array. Assistant-derived: leads from CRM sync or prior run; scoring criteria hard-coded defaults. Config: none external; `SALES_HOME` local store. Fallback: operates locally; no connector needed.
**B. Pipeline Forecasting** — Output: forecast object (period, pipeline, quota attainment, win rate, velocity, slippage risk, recommendations). User-supplied (optional): `quota`, `period`, `stageWeights`. Assistant-derived: opportunities from Skill C; stage weights default to B2B SaaS progression. Config: none external. Fallback: reasoning-only from local data.
**C. CRM Data Sync** — Output: external schema (mode dry-run/live/error, payloads, IDs). User-supplied: `operation`, `entity`, `data`/`filters`/`entityId`. Assistant-derived: `ownerId`, lead source mappings, stage normalization. Config: `baseUrl`, `accessToken`, `provider` (salesforce\|hubspot\|pipedrive), field mappings. Fallback: `mode: "error"`, operate on local store, disclose "CRM not connected."
**D. Email Outreach** — Output: external schema (message IDs, tracking, open/click events). User-supplied: `operation`, `to`, `subject`, body or `templateId`+data, `sequenceId`, `scheduledAt`. Assistant-derived: `fromAddress`/`fromName`, templates, compliance rules. Config: `baseUrl`, `apiKey`, `provider` (sendgrid\|mailgun\|ses\|brevo). Fallback: `draft` works; `send`/`schedule` error with guidance.
**E. Meeting Lifecycle** — Output: event ID, calendar link, transcript, action items. User-supplied: `operation`, `leadId`, `subject`, `startTime`, `attendees`, `meetingType`. Assistant-derived: `timezone`, templates, transcription provider. Config: OAuth `accessToken`, `provider`, `defaultCalendarId`. Fallback: agenda/prep doc only; cannot book.
**F. Proposal & Quote** — Output: document ID, preview URL, tracking, signatures. User-supplied: `operation`, `leadId`, `opportunityId`, `templateId`, `templateData`, `lineItems`, `totalAmount`, `recipientEmails`. Assistant-derived: pricing tables, signature settings, approval workflow. Config: `baseUrl`, `apiKey`, `provider` (pandadoc\|proposify\|quoter). Fallback: `create` renders locally; `send`/`signatures` error.
**G. Sales Analytics** — Output: metric series, cohort breakdowns, dashboards, forecast models, alerts. User-supplied: `metric`, `dateRange`, `dimensions`, `filters`. Assistant-derived: templates, layouts, cohort definitions, forecast models. Config: `baseUrl`, `apiKey`, `provider` (salesforce-wave\|hubspot-reports\|looker\|tableau). Fallback: error; synthesize reasoning-only forecast from local cache.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Education — People Assistant Assessment

### Domain
End-to-end instructional support: curriculum planning (lesson plans, quizzes, activities, multimedia content), learner analytics (performance, progress, engagement, at-risk detection), adaptive personalization recommendations, and educational resource management — coordinated around the learner profile and curriculum standards.

### Advise
- Is this lesson plan structurally sound for objectives and learner profile?
- Which adaptation strategies given learner performance and engagement data?
- Is this learner at risk, and what intervention tier is appropriate?
- Which quiz questions are well-calibrated to difficulty and coverage?
- Should I prioritize accessibility remediation on this resource?

### Proxy
- Draft lesson plans, quizzes, activities, multimedia integration plans from parameters.
- Store generated drafts in local `EDUCATION_HOME`.
- Organize and tag resources in connected repository (when connector configured).

### Aide
- Generate lesson plan draft for teacher review/customization.
- Produce quiz with answer key for teacher sign-off.
- Draft activity structures teacher can adapt.
- Suggest resource organization tags for teacher approval.

### Higher-Order Skills

| # | Skill | Current IDs | Nature |
|---|-------|-------------|--------|
| A | Instructional Materials Drafting | `education_lesson_assessment_drafting` | reasoning-only |
| B | Learner Analytics & Insight | `education_learner_insight` | hybrid |
| C | Adaptive Personalization Advisory | `education_adaptive_personalization` | reasoning-only |
| D | Resource Discovery & Management | `education_resource_library` | real external |

### Outputs & Config/Inputs

**A. Instructional Materials Drafting** — Output: structured draft (lesson plan/quiz/activity/content plan). User-supplied: `subject`, `topic`, `grade`, `duration`, `standards`, `objectives`, `activityType`, `quizType`, `difficulty`, `questionCount`. Assistant-derived: phases, materials, differentiation, Bloom's objectives, question stems, answer keys. Config: none external; `EDUCATION_HOME` local. Fallback: local parse/store; no connector needed.
**B. Learner Analytics & Insight** — Output: learning profile (style, performance, progress, motivation, engagement, at-risk flags). User-supplied: `learnerId` (required), `courseId`, `dateRange`. Assistant-derived: analysis from LMS data via connector. Config: LMS MCP (`provider`: canvas/google-classroom/schoology/brightspace/powerschool/infinite-campus/custom; `baseUrl` + `token`). Fallback: dry-run mode; disclose "results illustrative, not live"; no fabricated LMS data.
**C. Adaptive Personalization** — Output: tiered recommendations (immediate/short-term/long-term/monitoring) for pacing/content/process/product/engagement. User-supplied: `learnerId` (required), `teacherGoals`, `courseContext`. Assistant-derived: adaptation logic from insight data (Skill B). Config: none external. Fallback: operates on in-context data; no connector needed.
**D. Resource Discovery & Management** — Output: organized/indexed resources, search results, accessibility audits. User-supplied: `operation`, `file`, `tags`, `query`, `folder`, `accessibilityStandard`. Assistant-derived: auto-tagging from taxonomy, accessibility scoring. Config: repository MCP (`provider`: google-drive/sharepoint/canvas-commons/oer-commons/custom; `baseUrl` + `token`). Fallback: dry-run; disclose "would be tagged/moved"; no silent writes.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: HR — People Assistant Assessment

### Domain
End-to-end recruitment lifecycle: candidate sourcing and screening, interview scheduling, communication workflows, job posting and board management, candidate assessments, compliance verification, and hiring analytics — coordinated around candidate and hiring-manager context.

### Advise
- Which candidates advance based on screening + assessment results?
- Is this job posting EEOC/GDPR/OFCCP compliant?
- Which job boards offer best ROI for this role?
- Should we proceed with an offer given assessment scores?
- What's optimal panel composition and scheduling strategy?

### Proxy
- Post and update job listings on configured boards.
- Send candidate communications (rejection, scheduling, offer letters).
- Search candidates via LinkedIn Recruiter; sync to ATS.
- Sync interview events to external calendar.

### Aide
- Screening scores and gap analysis for HR review.
- Candidate communication templates for approval.
- Compliance report for HR sign-off before posting.
- Hiring pipeline reports for leadership review.

### Higher-Order Skills

| # | Skill | Current IDs | Nature |
|---|-------|-------------|--------|
| A | Candidate Sourcing & Screening | `screen-resume`, `hr-ats`, `hr-linkedin` | hybrid |
| B | Interview Coordination | `schedule-interview`, `hr-calendar` | proxy |
| C | Candidate Communication | `hr-email` | real external |
| D | Job Posting & Compliance | `hr-job-board`, `hr-compliance` | hybrid |
| E | Assessment & Selection | `hr-assessment` | real external |
| F | Recruitment Analytics & Reporting | `hr-hiring-analytics`, `hr-compliance` | hybrid |

### Outputs & Config/Inputs

**A. Candidate Sourcing & Screening** — Output: ranked shortlist with match scores, gaps, LinkedIn snippets. User-supplied: `jobRequirements`, `searchCriteria`. Assistant-derived: match scores, candidate enrichment from ATS/LinkedIn. Config: ATS MCP (`HR_ATS_ENDPOINT` + `HR_ATS_API_KEY`), LinkedIn MCP (`HR_LINKEDIN_ENDPOINT` + `HR_LINKEDIN_ACCESS_TOKEN`). Fallback: local `screen-resume` only; disclose "ATS/LinkedIn not connected."
**B. Interview Coordination** — Output: interview record + calendar event. User-supplied: `candidateName`, `panel`, `scheduledAt`, `interviewType`. Assistant-derived: availability checking, conflict resolution, invite generation. Config: calendar MCP (`HR_CALENDAR_ENDPOINT` + `HR_CALENDAR_ACCESS_TOKEN`). Fallback: local storage; hint at `CALENDAR_BASE_URL` + `CALENDAR_API_KEY`.
**C. Candidate Communication** — Output: sent email with delivery tracking. User-supplied: `to`, `subject`, body or `templateId`+data. Assistant-derived: template selection, personalization. Config: email MCP (`HR_EMAIL_ENDPOINT` + `HR_EMAIL_API_KEY`). Fallback: draft locally; prompt manual send; never fake delivery.
**D. Job Posting & Compliance** — Output: listing ID + compliance report with flagged issues. User-supplied: `jobData`, `jobPostingContent`, `regulations`. Assistant-derived: compliance analysis, remediation templates. Config: job board MCP (`HR_JOB_BOARD_ENDPOINT` + `HR_JOB_BOARD_API_KEY`); compliance rules reasoning-only. Fallback: generate posting + compliance locally; manual board submission.
**E. Assessment & Selection** — Output: invitation sent + results retrieved. User-supplied: `candidateEmail`, `testId`, `assessmentId`. Assistant-derived: test selection, scoring rubric. Config: assessment provider MCP (`HR_ASSESSMENT_ENDPOINT` + `HR_ASSESSMENT_API_KEY`). Fallback: generate questions + rubric locally; no external test claimed.
**F. Recruitment Analytics** — Output: pipeline report, time-to-fill, source effectiveness, diversity report, audit trail. User-supplied: `dateRange`, `filters`, `metrics`. Assistant-derived: metric calculations from ATS data. Config: data warehouse MCP (`HR_ANALYTICS_ENDPOINT` + `HR_ANALYTICS_API_KEY`). Fallback: report zero results; ask user to connect source; never fabricate.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Executive Assistant Assessment

### Domain
Owns executive development and decision support end-to-end: strategic choices and risk, performance evidence, 360/EQ assessment, feedback synthesis, skill-gap analysis, development and coaching plans, communication presence, career roadmaps, and calendar/email coordination through shared executive context.

### Advise
- Which strategic scenario or risk response fits the executive's goals and constraints?
- Which 360/EQ themes and development priorities matter most?
- How should the executive communicate, negotiate, or respond to feedback?
- Which career path, milestone sequence, or coaching investment is appropriate?
Recommendations remain advisory; the executive approves decisions, commitments, and external sends.

### Proxy
- Apply local decision frameworks; model scenarios and risks from supplied facts.
- Collect and normalize assessment and feedback records; analyze performance and communication data.
- Prepare development, improvement, coaching, resource, and career-plan records.
- Prepare calendar/email payloads and draft, schedule, or sync only after the applicable gate.

### Aide
- Draft decision briefs, risk registers, 360 questions, feedback summaries, talking points, coaching agendas, and roadmap options for sign-off.
- Prepare review packets and missing-input lists; the executive conducts consequential conversations and approves final actions.

### Higher-Order Skills

| # | Skill | Exact current IDs | Classification |
|---|---|---|---|
| A | Strategic Decision, Risk & Performance Intelligence | `decision-framework`, `executive-scenario-modeler`, `executive-risk-assessment`, `executive-performance-analyzer` | **Hybrid** — reasoning core; optional live solver/metrics |
| B | 360° Leadership Assessment & Feedback | `executive-leadership-assessment`, `executive-feedback-collector`, `executive-feedback-analysis`, `executive-eq-assessment` | **Hybrid** — live assessment/feedback collection plus synthesis |
| C | Development Planning & Coaching | `leadership-coaching`, `executive-skill-gap`, `executive-development-plan`, `executive-improvement-plan`, `executive-resource-recommender` | **Hybrid** — local/reasoning plans plus optional skill/resource providers |
| D | Communication Presence & Coaching | `executive-communication-analyzer`, `executive-presence-analyzer`, `executive-communication-coach` | **Hybrid** — external analyzers fetch transcript/media data; coaching is reasoning-only; connectors optional |
| E | Career & Executive Presence Planning | `executive-career-planner`, `executive-career-roadmap` | **Hybrid** — career planner benefits from market data connector; roadmap is reasoning-only |
| F | Calendar & Communication Ops | `executive-calendar`, `executive-email` | **Real external** — live calendar/email systems |

### Outputs & Config/Inputs

**A. Strategic Decision, Risk & Performance Intelligence** — Output: decision brief, scenario projections, risk register, and performance report. Inputs: decision/framework, scenario variables/assumptions, risk domain/timeframe, executive ID, period, KPIs, and benchmark. Config: local reasoning; optional `EXEC_SCENARIO_MODELER_ENDPOINT`/API key and `EXEC_PERFORMANCE_ANALYZER_ENDPOINT`/API key. Fallback: built-in reasoning or supplied metrics, labeled non-live.

**B. 360° Leadership Assessment & Feedback** — Output: 360 report, EQ evaluation, themes, sentiment, and trends. Inputs: executive/assessment IDs, competencies, period, assessor/recipient IDs, dimensions, responses, and feedback. Config: `EXEC_LEADERSHIP_ASSESSMENT_ENDPOINT`, `EXEC_FEEDBACK_COLLECTOR_ENDPOINT`, `EXEC_FEEDBACK_ANALYSIS_ENDPOINT`, and `EXEC_EQ_ASSESSMENT_ENDPOINT` with their credentials. Fallback: manually supplied feedback analyzed locally; never fabricate survey distribution or responses.

**C. Development Planning & Coaching** — Output: coaching, development, improvement, skill-gap, milestone, and resource records. Inputs: executive ID, area/goals, role and current/required skills, focus areas, timeframe, actions, and preferences. Config: `EXECUTIVE_HOME` local store for `leadership-coaching`; optional `EXEC_SKILL_GAP_ENDPOINT`, `EXEC_DEVELOPMENT_PLAN_ENDPOINT`, `EXEC_IMPROVEMENT_PLAN_ENDPOINT`, and `EXEC_RESOURCE_RECOMMENDER_ENDPOINT` with credentials. Fallback: derive gaps/plans from context and disclose non-exhaustive recommendations.

**D. Communication Presence & Coaching** — Output: communication/presence analysis and tailored coaching feedback/exercises. Inputs: text/channel/context or session ID, transcript/video, dimensions, executive ID, skill area, message, feedback, and length. Config: optional `EXEC_COMMUNICATION_ANALYZER_ENDPOINT`, `EXEC_PRESENCE_ANALYZER_ENDPOINT`, and `EXEC_COMMUNICATION_COACH_ENDPOINT` with credentials. Fallback: built-in analysis labeled as such.

**E. Career & Executive Presence Planning** — Output: target-role plan, roadmap, milestones, dependencies, and progress view. Inputs: executive ID, target role, timeframe, interests, constraints, milestones, dependencies, and timeline. Config: optional `EXEC_CAREER_PLANNER_ENDPOINT`/API key for market data; roadmap runs locally. Fallback: directional plan with an explicit market-data caveat.

**F. Calendar & Communication Ops** — Output: calendar event/availability result and email send/schedule/tracking result or draft. Inputs: calendar action/event data/calendar ID/time range; email recipients, subject, body/template, and scheduled time. Config: `EXEC_CALENDAR_ENDPOINT` plus `EXEC_CALENDAR_ACCESS_TOKEN`; `EXEC_EMAIL_ENDPOINT` plus `EXEC_EMAIL_API_KEY`. Fallback: local draft/dry-run; never claim sync or delivery.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "analyze this decision", "model a scenario", "assess risk", "check performance" | monthly strategy/risk review | new initiative or performance refresh | risk score exceeds threshold or KPI variance crosses limit |
| B | "run a 360", "analyze feedback" | quarterly assessment cycle | survey closes or new feedback arrives | response rate below 75% or high-severity theme appears |
| C | "create a development plan", "start coaching" | quarterly plan review | skill gap or feedback analysis completes | milestone overdue or gap priority rises |
| D | "analyze this message", "coach my communication" | monthly communication review | transcript, meeting, or feedback arrives | clarity/presence score falls below target |
| E | "plan my career", "build my roadmap" | annual career review | promotion or role change recorded | transition criteria met or dependency overdue |
| F | "schedule a meeting", "send an email" | daily calendar sync or message cadence | meeting request or reply arrives | calendar conflict, delivery failure, or rate-limit retry |

Scheduled and data-driven triggers create drafts, alerts, or review items; they never bypass confirmation gates.
---

## Appendix: Marketing — People Assistant Assessment

### Domain
End-to-end campaign lifecycle management: audience intelligence and market research, content creation and publishing, multi-channel execution (social, email, SEO), and performance analytics — all coordinated around the campaign record and KPI targets.

### Advise
- Which channels offer the best ROI for this product and audience segment?
- Should I pivot the campaign based on current performance trends?
- Which content themes will resonate with this audience segment?
- Are we hitting our SEO targets, and what should we optimize next?
- What's the optimal send time and personalization for this email segment?

### Proxy
- Publish content to configured CMS; schedule social posts; send marketing emails
- Manage document assets; audit SEO on live URLs
- All external writes gated behind dry-run + confirmation; reads, calculations, drafts are proxy work

### Aide
- Draft campaign plan, content copy, SEO audit report, and audience segment analysis for user review
- Prepare performance analysis drafts for stakeholder sign-off

### Higher-Order Skills

| # | Skill | Exact current IDs | Classification |
|---|-------|-------------------|----------------|
| A | Campaign Strategy & Audience Intelligence | `plan-campaign`, `marketing-market-research`, `marketing-audience-insights` | **Hybrid** — local planning plus real research/insights fetches |
| B | Content Production & Publishing | `marketing-content-generation`, `marketing-document-management` | **Hybrid** — content generation is LLM-native; CMS/document publishing is real external |
| C | Multi-Channel Execution | `marketing-social-media`, `marketing-email` | **Real external** — social and email connectors required |
| D | SEO Management | `marketing-seo` | **Hybrid** — keyword/ranking data is real external; optimization suggestions are reasoning-only |
| E | Campaign Performance Analytics | `analyze-performance` | **Reasoning-only** — local code skill, MARKETING_HOME store |

### Outputs & Config/Inputs

**A. Campaign Strategy & Audience Intelligence** — Output: campaign plan, audience segments, market research report. User-supplied: product, budget, channels, targetMarket, competitors, query. Assistant-derived: channel allocation, timeline, KPIs, segmentation logic. Config: research MCP (`MARKETING_RESEARCH_ENDPOINT` + token), audience MCP (`MARKETING_AUDIENCE_INSIGHTS_ENDPOINT` + key). Fallback: plan from general knowledge with "market data not connected" disclosure.

**B. Content Production & Publishing** — Output: published/scheduled content, stored document asset. User-supplied: contentType, title, body, topic, audience, tone, campaignId, operation. Assistant-derived: content body, auto-tagging. Config: CMS (`MARKETING_CMS_ENDPOINT` + `MARKETING_CMS_API_KEY`), document (`MARKETING_DOCUMENT_ENDPOINT` + `MARKETING_DOCUMENT_ACCESS_TOKEN`). Fallback: draft locally; "not published — CMS not configured."

**C. Multi-Channel Execution** — Output: published social post, sent email with tracking. User-supplied: platform, content/message, to, subject, scheduledAt, campaignId. Assistant-derived: platform copy adaptation, personalization. Config: social (`MARKETING_SOCIAL_ENDPOINT` + `MARKETING_SOCIAL_ACCESS_TOKEN`), email (`MARKETING_EMAIL_ENDPOINT` + `MARKETING_EMAIL_API_KEY`). Fallback: drafts locally; never claims external delivery.

**D. SEO Management** — Output: audit report, keyword rankings, optimization recs, crawl issues. User-supplied: url, keywords, market, searchEngine, operation. Assistant-derived: optimization suggestions, gap analysis. Config: SEO (`MARKETING_SEO_ENDPOINT` + `MARKETING_SEO_API_KEY`). Fallback: on-page LLM analysis; "SEO data not connected — best-practice heuristics."

**E. Campaign Performance Analytics** — Output: performance report with metrics, trends, comparisons. User-supplied: campaignId, metrics, dateRange, filters, granularity. Assistant-derived: normalization, trend detection, benchmarks. Config: none external (local code skill). Fallback: reports zero results; never fabricates metrics.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "plan a campaign for X" | quarterly planning cycle | new competitor enters market | budget threshold → reallocation |
| B | "draft content on Y" | scheduled content calendar | content plan approved | calendar slot opens → auto-draft |
| C | "post this on LinkedIn" | scheduled publish queue | content approved for publish | best-time-to-post → auto-schedule |
| D | "audit example.com" | monthly rank tracking | page published → trigger audit | ranking drops below threshold → action |
| E | "how did campaign perform" | daily/weekly digest | campaign ends → final report | KPI underperforms → alert and pivot |

---
## Appendix: Customer Support Assistant — People Assistant Assessment

### Domain
End-to-end customer support lifecycle: ticket resolution and knowledge management, customer sentiment and issue analysis, omnichannel communication with CRM integration, escalation and SLA management, customer follow-up engagement, and support operations analytics and capacity planning — coordinated around ticket record and customer context.

### Advise
- How to prioritize tickets by sentiment/urgency; escalation tier and root-cause patterns; response to negative reviews; staffing forecasts.

### Proxy
- Resolve/close tickets (local); generate/send response drafts (email/social when connected); schedule follow-ups (CRM/scheduling when connected); sync ticket/customer data to CRM.

### Aide
- Generate response drafts for agent review; prepare root-cause analysis for lead; draft staffing forecast; draft escalation notes for human review.

### Higher-Order Skills

| # | Skill | Current IDs | Nature |
|---|-------|-------------|--------|
| A | Ticket Resolution & Response | `resolve-ticket`, `search-kb`, `support-response` | Hybrid |
| B | Customer Sentiment & Issue Intelligence | `support-sentiment-analysis`, `support-issue-analysis` | Reasoning-only |
| C | CRM Sync & Customer Data | `support-crm` | Real external |
| D | Escalation & SLA Management | `support-escalation` | Real external |
| E | Follow-up & Customer Engagement | `support-follow-up` | Real external |
| F | Support Analytics & Capacity Planning | `support-analytics`, `support-planning` | Real external |

### Outputs & Config/Inputs
**A.** Output: resolved ticket, draft response with KB refs. User: `ticketId`, `issue`, `query`, `customerMessage`, `tone`, `template`, `includeKB`. Assistant: response text, KB-grounded actions, confidence. Config: optional KB connector; fallback: local KB + model, disclose "no external KB".
**B.** Output: sentiment, emotion, root cause, urgency. User: `text`, `ticketId`, `issueText`, `customerInfo`, `productContext`, `history`. Assistant: scoring, theme extraction, classification. Config: optional sentiment provider; fallback: built-in model, disclose "analyzed via built-in model".
**C.** Output: synced CRM records. User: `operation`, `entity`, `data`, `filters`. Assistant: field mapping. Config: CRM MCP (`SUPPORT_CRM_BASE_URL` + key); fallback: local only, prompt to connect.
**D.** Output: escalation record, SLA status. User: `operation`, `ticketId`, `level`, `assignedTo`, `reason`, `slaBreach`. Assistant: path from hierarchy, SLA calc. Config: escalation MCP; fallback: local recommendation, flag "not synced".
**E.** Output: scheduled/sent follow-up. User: `operation`, `ticketId`, `customerId`, `type`, `channel`, `template`. Assistant: timing rules, personalization. Config: follow-up channel MCP; fallback: draft with timing, user sends.
**F.** Output: forecast, capacity plan, metrics. User: `query`, `filters`, `granularity`, `metrics`, `teamSize`. Assistant: forecasting, capacity calc. Config: analytics + planning MCPs; fallback: manual data entry, no fabricated metrics.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Analytics — Specialist Assistant Assessment

**Domain.** End-to-end business intelligence: metric definition, data ingestion from warehouses and local stores, insight generation (trend, anomaly, benchmarking), and report delivery. The source exports `analytics_business_insight_report` (code) and `analytics_warehouse_query` (external action). The `performance-analytics-assistant` catalog additionally exposes the catalog-only names `generate-report` and `identify-trends`.

**Advise.** Which metric mix is the real leading indicator of business health; whether a trend is seasonal or structural; what alert threshold and false-positive tolerance are appropriate; how to weight conflicting signals (e.g., revenue up, churn up). The assistant reasons and lays out trade-offs; it never mutates source systems or commits to thresholds on the user's behalf.

**Proxy.** Pulling the latest metric slice from the local metrics store; computing stats, regression, moving averages, and z-score anomaly detection; returning the insight/trend JSON artifact to the caller; preparing a warehouse query for user approval before execution (only when the external connector is configured).

**Aide.** Drafting the warehouse query for user approval before execution; preparing the narrative an analyst would present to stakeholders; suggesting which metric definitions need owner sign-off.

**Higher-order skills.**

| # | Skill | Exact current IDs | Classification |
|---|---|---|---|
| A | Metric & Data Source Onboarding | (new; no current ID) | Reasoning-only — local config and parse |
| B | Insight Report & Trend Analysis | `analytics_business_insight_report`; catalog `generate-report`, `identify-trends` | Reasoning-only/local; intended Hybrid only after a live warehouse fetch is wired |
| C | Warehouse Query Builder | `analytics_warehouse_query` | Real external — requires a live warehouse MCP/API |
| D | Anomaly & Alerting | folded into B | Reasoning-only/local |
| E | Stakeholder Report Delivery | (new; no current ID) | Reasoning-only render; Hybrid only if a BI push connector is wired |

**Outputs & Config/Inputs.** *Implemented:* `analytics_business_insight_report` returns `success` plus an `insight` and `storePath`. The insight contains metric/dataset, period/timeframe, data points, stats or regression (`slope`, `intercept`, `rSquared`), moving averages in trends mode, anomalies with `warning`/`critical` severity, interpretation, recommendation, and a `source` label. *Higher-order/proposed:* a human-readable stakeholder report and an alert payload when a threshold is crossed. The current code does not emit either artifact; it emits JSON only. User-supplied: `mode` (`report` or `trends`), `metric`, `period`, `dataset`, and `timeframe`; alert thresholds are an assessment-level input, not a current schema field. Assistant-derived: slice selection, stats, linear regression, moving averages, z-score anomalies, interpretation, recommendation. Config: the code reads `ANALYTICS_METRICS_PATH` (default `/tmp/analytics/metrics.json`) and `ANALYTICS_WAREHOUSE_CONFIG` (default `/tmp/analytics/warehouse-config.json`). `analytics_warehouse_query` requires `ANALYTICS_WAREHOUSE_ENDPOINT`, `ANALYTICS_WAREHOUSE_API_KEY`, and config fields `baseUrl`, `apiKey`, `provider`. Fallback: the code skill uses the local metrics store when no warehouse data path is available; presence of the warehouse config file only changes the emitted `source` label and does not fetch warehouse rows. The external query returns `mode: 'dry-run'` or an explicit error when unconfigured, never simulated live data.

**Triggers.**

| Skill | User | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | Define a metric or data source | — | Metric definition or source config changes | Required metric/source metadata is missing |
| B | Report on metric X for period Y; analyze trends for dataset X | Daily/weekly top-line digest | New local data lands or a warehouse data path is connected | Alert threshold or anomaly severity is crossed |
| C | Run a warehouse SQL query | — | Warehouse credentials are registered or rotated | Query timeout or result-size limit is reached |
| D | Investigate an anomaly | — | New metric slice lands | Absolute z-score exceeds 2 (warning) or 3 (critical) |
| E | Prepare a stakeholder report | Report delivery cycle | Report approval or distribution window opens | Required metric or audience context is missing |

**Safety/approval boundaries.** Read-only on data; no mutation of source systems. Warehouse queries run only after credential review; the external query timeout is 120 seconds. No credentials are logged. A report or alert is advisory until the user approves any external delivery.

**Shared state/data flow.** The only implemented data store is the local metrics store (`ANALYTICS_METRICS_PATH`, default `/tmp/analytics/metrics.json`). `ANALYTICS_WAREHOUSE_CONFIG` is a config-file path, not an implemented data-fetch integration. `analytics_warehouse_query` does not ingest raw rows into Skill B today; that flow is a proposed Hybrid integration.

**Implemented vs. stub.** `analytics_business_insight_report` is implemented with local computation and an honest local fallback. `analytics_warehouse_query` is an external-action stub. `generate-report` and `identify-trends` are catalog-only bindings, not source implementations.



## Appendix: Songwriter — Creative Assistant Assessment

**Domain.** End-to-end song creation: concept, structure, lyric writing, rhyme/meter engineering, genre/trend awareness, and revision. The source exports `creative_drafting` (code) and `creative_trend_planning` (external action). The `songwriter-assistant` catalog additionally exposes `write-lyrics` and the catalog-only `songwriter-trend-analysis`.

**Advise.** Which theme and mood best serve the artist's identity and this release cycle; whether the current chorus hook is strong enough relative to genre conventions; whether the release should target a trend wave or carve its own niche; whether the proposed structure serves the intended radio/format placement.

**Proxy.** Generating and persisting full lyrics (verses, chorus, bridge, outro) from a brief; applying a rhyme scheme and structure selection per genre; revising a stored draft when an implementation consumes `existingContent` — the current source accepts that field but does not produce a revision diff; preparing trend or release-planning requests as dry runs when no connector is configured.

**Aide.** Drafting chord-progression and melody suggestions for the user to arrange with their producer; preparing a pitch/coverage memo for the label or playlist team; building a release checklist the artist signs off on.

**Higher-order skills.**

| # | Skill | Exact current IDs | Classification |
|---|---|---|---|
| A | Song Concept & Brief Intake | `write-lyrics` (catalog); `creative_drafting` (lyrics path) | Reasoning-only/local |
| B | Lyric Generation & Structure Engineering | `creative_drafting` (lyrics path) | Reasoning-only — model-generated and persisted locally |
| C | Trend & Release Timing Advisory | `creative_trend_planning` (songwriter subset); `songwriter-trend-analysis` (catalog-only) | Real external — requires a chart/genre API |
| D | Revision & Iteration Loop | `creative_drafting` (`existingContent` path) | Reasoning-only intended; current source does not implement revision output |
| E | Performance & Setlist Planning | (new; no current ID) | Reasoning-only |

**Outputs & Config/Inputs.** *Implemented:* a saved draft record with `id`, `format`, `theme`, `genre`, `mood`, `topic`, `duration`, `style`, `audience`, `createdAt`, `source: 'reasoning'`, `lyrics.sections`, `lyrics.fullText`, `structure`, `rhymeScheme`, `sections`, and `storePath`. *Higher-order/proposed:* a concept brief, revision diff, melody/chord suggestions, and a trend-signal summary with caveats. These are not emitted by the current code skill. User-supplied: required `format` (`lyrics` or `song`); optional `theme`, `genre`, `mood`, `structure`, `topic`, `duration`, `style`, `audience`, and `existingContent`. Assistant-derived: section-by-section lyric content, structure normalization, rhyme-scheme mapping, and theme vocabulary selection. Config: `creative_trend_planning` requires `CREATIVE_INTELLIGENCE_ENDPOINT`, `CREATIVE_INTELLIGENCE_API_KEY`, and config fields `baseUrl`, `apiKey`, `provider` (e.g., Spotify, Soundcharts, Billboard, or Chartmetric). Fallback: `creative_drafting` needs no connector and uses `CREATIVE_HOME` (default `/tmp/creative`). An unconfigured trend connector returns `mode: 'dry-run'` or an explicit error; general-knowledge advisory text must be labeled non-live and must not invent chart positions. `songwriter-trend-analysis` has no current source implementation.

**Triggers.**

| Skill | User | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | Write a song about X in genre Y | — | Brief or artist context changes | Required format or theme is missing |
| B | Generate lyrics from this brief | — | Brief is updated | Rhyme-density or repetition score is below threshold |
| C | What is trending in genre Y? | Weekly trend scan | Chart/genre signal or pitch window arrives | Trend velocity or audience-demand threshold changes |
| D | Revise this stored draft | — | Artist feedback arrives | Repetition, meter, or dialogue-quality score is below threshold |
| E | Plan a setlist for this gig | — | Gig calendar or release date changes | Audience-profile mismatch is detected |

**Safety/approval boundaries.** No copyrighted text is reproduced beyond brief fair-use quotes. Trend data is advisory only; no automated submissions to stores, playlist services, or distribution platforms.

**Shared state/data flow.** `creative_drafting` writes `CREATIVE_HOME/drafts.json` (default `/tmp/creative/drafts.json`). Song and script records share that store and are disambiguated by `format`. Trend data, if connected, is read-only and may inform both creative assistants; it does not write either store. The current source has no revision-diff state.

**Implemented vs. stub.** `creative_drafting` is implemented with local persistence. `creative_trend_planning` is an external-action stub. `write-lyrics` and `songwriter-trend-analysis` are catalog-only bindings.

## Appendix: Scriptwriter — Creative Assistant Assessment

**Domain.** Owns script development end-to-end across video, film, podcast, and presentation formats: concept, format/audience brief, outline and beat sheet, scene structure, dialogue, pacing, revision, and production handoff, connected through the shared creative draft store.

**Advise.** Which narrative structure, hook, tone, scene count, and pacing best serve the format, duration, platform, and audience; whether the beats, dialogue, and visual notes serve the story and retention goal; which revision direction best addresses feedback without losing the core concept. The assistant presents options, assumptions, and trade-offs; the user approves creative direction, claims, and external use.

**Proxy.** Generate and persist an original script draft from a brief; derive scene count, act structure, beats, dialogue placeholders, and visual notes; revise a stored draft only when the revision path is implemented — the current source accepts `existingContent` but does not generate a revision diff; prepare trend/planning requests and production-handoff artifacts as dry runs.

**Aide.** Prepare a pitch-deck outline, shooting/production schedule, casting breakdown, and review packet for the user to finalize; draft talking points and approval notes for director/producer review.

**Higher-order skills.**

| # | Skill | Exact current source/catalog IDs | Classification |
|---|---|---|---|
| A | Concept & Format Intake | `write-script` (catalog); `creative_drafting` (source) | Reasoning-only/local |
| B | Script Generation & Scene Engineering | `creative_drafting` (script path) | Reasoning-only — model-generated and persisted locally |
| C | Trend & Format Advisory | `creative_trend_planning` (scriptwriter subset); `scriptwriter-content-planner` (catalog-only) | Real external — requires a creative-intelligence connector |
| D | Outline & Beat Sheet | `creative_trend_planning` (`plan`, `outline`, `structure` operations) | Real external — catalog/source external-action path |
| E | Revision & Feedback Loop | `creative_drafting` (`existingContent` path); `scriptwriter-content-planner` (`revise`, catalog-only) | Hybrid — local draft state plus an external planning/revision path; catalog-only portion is not live |
| F | Production Handoff Pack | (new; no current ID) | Reasoning-only render |

The current creative source defines `creative_drafting` and `creative_trend_planning`; the catalog also exposes `write-script` and binds `scriptwriter-content-planner`. Catalog-only bindings must not be treated as live until an implementation and connector exist.

**Outputs & Config/Inputs.** *Implemented:* a saved draft record with `id`, `format`, `topic`, `duration`, `actStructure`, `scenes[]`, `totalScenes`, metadata, and `storePath`. Each scene includes number, act, title, duration, setting, characters, beats, dialogue placeholder, and notes. *Higher-order/proposed:* a separate beat sheet, revision diff, trend report, and production handoff. The current code does not emit these as separate artifacts. User-supplied: required `format` (`script`, `video`, `film`, `podcast`, or `presentation`); optional `theme`, `genre`, `mood`, `structure`, `topic`, `duration`, `style`, `audience`, and `existingContent`; planning/trend fields `operation`, `market`, `timeframe`, `keywords`, `title`, `targetDuration`, `tone`, `episode`, `sceneCount`, `content`, `outline`, `campaignId`, and `dryRun` are defined by the external planning/trend schema; the catalog-only planner binding has no current implementation. Assistant-derived: scene count, act structure, scene templates, beats, dialogue placeholders, visual notes, revision diff, handoff, and caveated trend synthesis. Config: `creative_drafting` needs no connector and uses `CREATIVE_HOME` (default `/tmp/creative`). `creative_trend_planning` requires `CREATIVE_INTELLIGENCE_ENDPOINT` plus `CREATIVE_INTELLIGENCE_API_KEY` (config `baseUrl`, `apiKey`, `provider`). Fallback: absent or failed connector returns `mode: 'dry-run'` or an explicit error and uses only local/user material; never fabricate trends. `write-script` and `scriptwriter-content-planner` are catalog-only bindings.

**Triggers.**

| Skill | User | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "write a script on X for format Y and duration Z" | — | Brief or audience context changes | Required format, topic, or duration is missing |
| B | Generate the script or scene plan | — | Approved brief or format changes | Scene count or pacing outside the format range |
| C | What is trending for format/genre X? | Weekly format-trend scan | New chart/genre signal or production window arrives | Trend velocity or audience-demand threshold changes |
| D | Build the outline or beat sheet | — | Concept or approved structure changes | Beat or scene-coverage gap is detected |
| E | Revise this draft | — | Feedback or new source material arrives | Pacing, repetition, or dialogue score is below threshold |
| F | Prepare the production handoff | — | Script approval or production window opens | Cast, location, scene detail, or deadline context is missing |

**Safety/approval boundaries.** No defamation or targeted personal portrayal without consent. No automated upload to video platforms or distribution services. Any future external write, publication, or upload requires a dry-run preview and explicit confirmation. Scheduled and event-driven triggers create drafts or alerts only and never bypass gates.

**Shared state/data flow.** `creative_drafting` writes `CREATIVE_HOME/drafts.json` (default `/tmp/creative/drafts.json`), shared with Songwriter and disambiguated by `format`. The current source has no trend-state store and no revision-diff store. Connected trend data is intended to be read-only and shared with Songwriter; it does not write either store.

**Implemented vs. stub.** `creative_drafting` is implemented with local script persistence. `creative_trend_planning` is an external-action stub. `write-script` and `scriptwriter-content-planner` are catalog-only bindings.


---
## Appendix: Finance / Financial Analyst Assistant Assessment

**Domain.** End-to-end corporate and investment finance: financial modeling, investment analysis, risk metrics, scenario planning, budget tracking, data cleaning, regulatory work, document management, and reporting. The source exports two implemented code skills, `financial-model` and `analyze-investment`. The catalog adds eight catalog-only IDs: `finance-financial-analysis`, `finance-reporting`, `finance-financial-data`, `finance-financial-risk-assessment`, `finance-budget-tracker`, `finance-data-cleaning`, `finance-regulatory`, and `finance-document-management`.

**Advise.** Is this investment's risk-adjusted return justified versus the benchmark and an alternative allocation? Are the model's growth and cost assumptions defensible, or optimistic? What does the sensitivity table imply for decision confidence and payback profile? How much of projected IRR is driven by terminal-value assumptions? The assistant presents options, trade-offs, and uncertainty; the user or CFO approves commitments.

**Proxy.** Building the full financial model: period projections, FCFF, NPV, IRR, ROIC, and base/bull/bear sensitivity. Running investment analysis: CAPM, VaR, Sharpe/Sortino, Monte Carlo percentiles, scenarios, and risk classification. Returning model and analysis JSON to the caller; the current code does not write artifacts to disk. Preparing reporting, budget, cleaning, and regulatory outputs as dry runs until their catalog-only implementations exist.

**Aide.** Drafting the assumption memo the CFO signs off on. Preparing board slides from model output. Building a budget-tracking template the finance team owns.

**Higher-order skills.**

| # | Skill | Exact current IDs | Classification |
|---|---|---|---|
| A | Model & Assumption Intake | (new; no current ID) | Reasoning-only — local config and parse |
| B | Financial Modeling & Valuation | `financial-model`, `finance-financial-analysis` | Reasoning-only/deterministic local math; `finance-financial-analysis` is catalog-only |
| C | Scenario & Sensitivity Analysis | `financial-model` (`sensitivity` output) | Reasoning-only/deterministic local math |
| D | Investment & Risk Analysis | `analyze-investment`, `finance-financial-risk-assessment` | Reasoning-only/deterministic local math; risk binding is catalog-only |
| E | Reporting & Board Pack | `finance-reporting`, `finance-financial-data` | Reasoning-only render; intended Hybrid if an ERP/BI connector is wired; both IDs are catalog-only |
| F | Budget Tracking & Forecast Refresh | `finance-budget-tracker` | Reasoning-only once actuals are supplied; catalog-only |
| G | Data Cleaning & Reconciliation | `finance-data-cleaning` | Reasoning-only/local transform; catalog-only |
| H | Regulatory Filing & Document Management | `finance-regulatory`, `finance-document-management` | Real external — filing gateway and document system; both IDs are catalog-only |

Finance uses eight rows because its catalog exposes more distinct outcomes than the 4–7 default; each row is the smallest coherent grouping preserving a separate user outcome.

**Outputs & Config/Inputs.**

- *A:* a normalized, versioned assumption record with validation flags and gaps (proposed; no current ID).
- *B:* model JSON with period-by-period revenue, costs, gross profit/margins, EBITDA, EBIT, NOPAT, capex, working-capital change, free cash flow, cumulative FCF, summary NPV/IRR/payback/ROIC, and totals.
- *C:* base/bull/bear sensitivity records containing NPV and IRR. These are already present in the `financial-model` output.
- *D:* investment analysis JSON with simple/CAPM/compounded returns, base/bull/bear scenarios, VaR 95/99, Sharpe/Sortino, max drawdown, downside deviation, Monte Carlo percentiles, probability of loss, expected shortfall, risk classification, and benchmark comparison.
- *E–H:* proposed board pack/KPI report, budget variance and forecast refresh, cleaned/reconciled dataset with transformation provenance, and regulatory filing/document records with draft/submitted status. The current source does not implement these outputs.

User-supplied: *Model inputs*: required `revenue` and `costs`; optional `periods` (1–20, default 5), `growthRate`, `costGrowthRate`, `taxRate`, `discountRate`, `capexSchedule`, and `workingCapitalPct`. *Investment inputs*: required `asset` and `amount`; optional `horizon` (1–30, default 10), `expectedReturn`, `volatility`, `riskFreeRate`, `correlation`, and `cashFlows`. Assistant-derived: projections, NPV/IRR, payback, ROIC, sensitivity, risk metrics, Monte Carlo results, scenarios, risk classification, and benchmark comparison. Connector fallback: the two code skills require no external connector and return deterministic JSON to stdout. The eight catalog-only IDs have no implementation or connector schema in the current source. Reporting/data, budget, cleaning, regulatory, and document capabilities must use real connectors when implemented; absent connectors return an explicit dry-run/error and never fabricate metrics, cleaned data, or filed returns.

**Triggers.**

| Skill | User | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | Capture these assumptions | — | Assumption document is added or changed | Required field or validation check fails |
| B | Build or refresh the model for X | Monthly forecast refresh | Actuals arrive or assumptions change | NPV flips sign or payback exceeds limit |
| C | Run base/bull/bear sensitivity | Model refresh cycle | Assumption or scenario definition changes | Bear-case NPV flips sign or IRR crosses hurdle |
| D | Analyze investment Y | Quarterly risk review | New benchmark, correlation, or cash-flow data arrives | VaR breaches limit or probability of loss exceeds threshold |
| E | Generate the board pack | Monthly/quarterly board cycle | Model or investment output is updated | KPI variance exceeds X% |
| F | Update the budget or forecast | Monthly close/forecast cycle | Actuals or a new budget version arrives | Budget variance exceeds threshold |
| G | Clean or reconcile this data | On data import | New file/schema arrives | Reconciliation discrepancy exceeds threshold |
| H | Prepare a filing or document package | Filing deadline cadence | Regulation or document requirement changes | Missing evidence, approval, or filing reference |

**Safety/approval boundaries.** Output is advisory; the assistant never executes trades, transfers funds, or files returns. Regulatory filing and any external write require a dry-run preview and explicit user or authorized-signatory confirmation. Scheduled and event-driven triggers create drafts or alerts only.

**Shared state/data flow.** Current source has no shared state: `financial-model` and `analyze-investment` emit JSON to stdout and do not persist files. The catalog-only skills have no state or implementation. A future shared-state contract would use `finance.assumptions`, `finance.models[]`, `finance.investments[]`, `finance.reports[]`, `finance.data.cleaned[]`, `finance.regulatory.filings[]`, connector config references, and an approval audit log, with flow `assumptions -> model -> investment/risk -> report/compliance`.

**Implemented vs. stub.** `financial-model` and `analyze-investment` are implemented deterministic code skills with no network dependency. All eight `finance-*` catalog bindings are catalog-only and have no current source implementation.

---

## Appendix: Restaurant Operations — Operations Assistant Assessment

### Domain
End-to-end restaurant operations: inventory, procurement, reservations, guest experience, kitchen workflow, staffing, and financial analytics — as one integrated operating system for a restaurant, not 28 disconnected tools.

### Advise
- Should I change my menu/pricing strategy given current ingredient costs and demand patterns?
- Which staff scheduling approach optimizes labor cost vs. service quality for this week?
- Is this guest complaint a one-off or a pattern, and what systemic fix is warranted?
- Should I pursue a new supplier or renegotiate existing contracts?

### Proxy
- Tracking inventory levels against par/reorder points and flagging low-stock items
- Comparing current reservation load to table capacity and suggesting optimal seating
- Generating staff shift schedules within labor-rule constraints (once approved pattern)
- Logging and categorizing guest feedback for trend analysis

### Aide
- Drafting vendor negotiation talking points (user conducts the call)
- Preparing a health inspection self-assessment checklist (user reviews/signs)
- Creating a menu revision proposal with cost-margin analysis (user approves changes)
- Drafting a recovery plan for service failures (user decides compensation)

### Higher-Order Skills

| # | Skill | Exact Current IDs | Classification |
|---|---|---|---|
| A | **Inventory & Procurement** | `manage-inventory`, `restaurant-purchase-order`, `restaurant-order-optimizer`, `restaurant-supplier-management`, `restaurant-price-tracking`, `restaurant-waste-management` | Hybrid — local inventory data (code skill) + real external supplier/price APIs (stubs) |
| B | **Reservations & Guest Experience** | `restaurant-reservation-system`, `restaurant-table-management`, `restaurant-guest-profile`, `restaurant-table-turnover`, `restaurant-reservation-analytics`, `restaurant-guest-feedback` | Real external — reservation platforms (OpenTable/Resy/SevenRooms), guest profile systems; requires live connectors |
| C | **Kitchen & Menu Operations** | `restaurant-kitchen-display`, `restaurant-prep-scheduler`, `restaurant-station-coordinator`, `restaurant-service-flow`, `restaurant-recipe-management`, `restaurant-recipe-costing`, `restaurant-menu-engineering`, `restaurant-menu-optimizer` | Real external — kitchen display systems, recipe management platforms (MarketMan/xtraCHEF); requires live connectors |
| D | **Staffing & Labor Management** | `restaurant-staff-scheduler`, `restaurant-labor-analytics`, `restaurant-server-communication`, `restaurant-demand-forecast` | Hybrid — local scheduling logic + real external workforce (7shifts/Hot Schedules) and forecasting (Crunch-Time/Teneo) APIs |
| E | **Financial Analytics & Strategy** | `restaurant-financial-analytics`, `restaurant-variance-analysis`, `restaurant-trend-analysis`, `restaurant-sales-analytics`, `restaurant-pricing-strategy` | Reasoning-only — operates on locally stored sales/COGS data; external benchmark data is optional enhancement, not a hard dependency |
| F | **Floor & Quality Operations** | `restaurant-floor-management`, `restaurant-quality-control` | Real external — floor management and QC systems; requires live connectors |

### Outputs & Config/Inputs

**A. Inventory & Procurement** — Output: item records (par/reorder, status), purchase orders, waste logs, reorder-priority list. User-supplied: inventory items/quantities/units, vendor contacts, reorder thresholds. Assistant-derived: categories, unit costs, shelf-life estimates, status, supplier assignment from a pool. Config: POS sync endpoint+token optional (fallback "POS not connected — managing locally"); supplier/price APIs require real connector — without one the skill says so rather than fabricating supplier data.
**B. Reservations & Guest Experience** — Output: ranked reservation lists, table assignments, guest profiles (preferences/allergies/loyalty), turnover metrics, feedback sentiment summaries. User-supplied: reservation details (party size, date, guest name); guest preferences/allergies. Assistant-derived: table recommendations from layout, fit scoring from history, sentiment from feedback text. Config: reservation platform MCP (OpenTable/Resy/SevenRooms), not stub API-key fields; fallback "no live booking channel configured — local data only."
**C. Kitchen & Menu Operations** — Output: recipe records (costs/yields), menu-engineering scores (popularity/profitability), prep schedules, station assignments, kitchen ticket status. User-supplied: recipes, ingredients, menu items, station definitions. Assistant-derived: cost per serving, margin analysis, prep timing, category assignments. Config: kitchen system MCP (Toast/Square/Clover) and recipe platforms (MarketMan/xtraCHEF); fallback "local recipe/kitchen data only."
**D. Staffing & Labor Management** — Output: shift schedules, labor cost projections, demand forecasts, staff performance summaries. User-supplied: staff IDs, availability, shift preferences, role definitions. Assistant-derived: schedule optimization within constraints, demand forecast from historical sales plus weather/events, labor projections. Config: workforce connectors (7shifts/Hot Schedules/Deputy) and forecasting services (Crunch-Time/Teneo) optional; fallback algorithmic forecasting from local data with caveats.
**E. Financial Analytics & Strategy** — Output: P&L snapshots, COGS breakdown, variance/trend reports, pricing recommendations with rationale. User-supplied: none ordinarily; optionally target margins or pricing rules. Assistant-derived: all metrics from stored sales/inventory/COGS — benchmarking from general knowledge with caveats if no market-data connector. Config: none external required; enhanced by Restaurant365/Compeat if available.
**F. Floor & Quality Operations** — Output: floor plans with status, quality inspection checklists/scores, corrective-action tracking. User-supplied: floor layout, inspection standards, checklist items. Assistant-derived: occupancy/turnover metrics from reservation data, quality scores from inspection records. Config: floor management MCP optional; fallback "local floor data only."

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---
## Appendix: Hotel Operations — Operations Assistant Assessment

### Domain
Owns the property operating loop end-to-end: reservations, room assignment/status, guest profiles, services, issues, communications, concierge guidance, housekeeping, maintenance, task dispatch, billing, revenue, external booking, staff performance, and inventory through shared property state.

### Advise
- Whether to accept a group booking given occupancy and F&B forecasts.
- Which rate plan best balances RevPAR, demand, and cannibalization risk.
- Whether complaints indicate a systemic housekeeping or maintenance problem.
- Whether a room upsell is likely to improve revenue without harming satisfaction.
The assistant presents evidence, assumptions, and trade-offs; the user approves rates, refunds, compensation, and commitments.

### Proxy
- Create, update, cancel, and reconcile reservations in the local store.
- Prepare room assignments, status transitions, housekeeping schedules, and task routing.
- Calculate billing, revenue KPIs, forecasts, staff metrics, and reorder priorities.
- Prepare guest messages and external PMS, payment, or channel-manager payloads as dry runs.

### Aide
- Draft personalized complaint responses, escalation memos, and guest communications.
- Prepare rate-adjustment, vendor-evaluation, incident, and revenue-meeting packs.
- Prepare check-in, turnover, maintenance, and inventory exception briefs for operator review.

### Higher-Order Skills

| # | Skill | Exact current IDs | Classification |
|---|---|---|---|
| A | Reservation Lifecycle & Room Assignment | `manage-reservation`, `hotel-room-assignment` | hybrid — local code/store plus real PMS wrapper |
| B | Guest Experience & Concierge | `hotel-guest-profile`, `hotel-concierge-knowledge`, `hotel-local-information`, `hotel-guest-service`, `hotel-issue-tracker`, `hotel-guest-communication` | hybrid — local stay context plus real external wrappers |
| C | Revenue Analysis | `hotel-revenue` | hybrid — external PMS data plus assistant analysis |
| D | Billing & Channel Distribution | `hotel-billing`, `hotel-external-booking` | real-external — payment gateway/channel manager required |
| E | Room, Housekeeping & Operational Analytics | `hotel-room-status`, `hotel-housekeeping-scheduler`, `hotel-maintenance`, `hotel-task-dispatch`, `hotel-operational-analytics` | hybrid — local reservation/room context plus external operations |
| F | Staff & Inventory Operations | `hotel-staff-performance`, `hotel-inventory-management` | real-external — live staff/inventory system required |

### Outputs & Config/Inputs

**A. Reservation Lifecycle & Room Assignment** — Output: local reservation record with ID, action, guest, dates, room type, rate, nights, total, status, source, plus room-assignment result or dry-run. User-supplied: `action`, `guestName`, `checkIn`, `checkOut`, optional `roomType`. Assistant-derived: ID, status, nights, room type/rate defaults, total, room number. Config/fallback: none external; `HOTEL_HOME` defaults to `/tmp/hotel` and persists `reservations.json`; current source does not implement the hinted PMS sync.
**B. Guest Experience & Concierge** — Output: profiles, service/issue records, personalized drafts or sends, and concierge/local recommendations. User-supplied: guest/reservation IDs, preferences, request/issue details, query, channel, and message. Assistant-derived: profile enrichment, routing, drafts, recommendations, and escalation. Config/fallback: `HOTEL_PMS_ENDPOINT` plus `HOTEL_PMS_ACCESS_TOKEN` (`baseUrl`/`token`/`provider`); absent connector returns dry-run/explicit “not connected,” while local drafting may continue.
**C. Revenue Analysis** — Output: occupancy, ADR, RevPAR, forecast, rate-plan, trend, and benchmark reports. User-supplied: operation, report/rate type, metrics, date range, and dimensions. Assistant-derived: KPI calculations, trends, assumptions, and caveated recommendations. Config/fallback: shared PMS endpoint/token; without it, use only supplied/stored data marked stale and never fabricate current metrics.
**D. Billing & Channel Distribution** — Output: folio/invoice/payment/refund result and OTA/GDS inventory/rate sync result or payload. User-supplied: billing operation, amount, currency, payment method, line items, tax, or channel/rate-plan/inventory/date data. Assistant-derived: tax, folio lines, channel payload, and validation. Config/fallback: payment gateway/channel-manager settings over the shared endpoint/token; absent connector returns dry-run and leaves submission to the user.
**E. Room, Housekeeping & Operational Analytics** — Output: room-status history, work orders, cleaning schedules, dispatched task records, and operational dashboards/KPIs. User-supplied: room/staff IDs, status, issue/category, priority, location, task type, due time, and routing strategy. Assistant-derived: transitions, priorities, assignments, schedules, and exception lists. Config/fallback: shared endpoint/token; absent connector returns dry-run or a local queue and never claims dispatch.
**F. Staff & Inventory Operations** — Output: staff KPI/review reports and stock, audit, transfer, order, and reorder records. User-supplied: staff/department/period/metrics or item/category/quantity/unit/location/min-stock/supplier data. Assistant-derived: KPI summaries, stock assessment, reorder priority, and gaps. Config/fallback: shared endpoint/token; absent connector permits only dry-run or calculation from supplied/stored data.

### Triggers

| Skill | User-initiated | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | "Review this contract"; "draft a clause" | Renewal, termination, payment-term, and confidentiality review reminders | New contract, counterparty redline, or signature request arrives | High-severity issue, unfavorable payment term, or renewal window opens |
| B | "Research this issue"; "verify this citation" | Weekly authority/citator refresh and research digest | New statute, regulation, decision, or matter jurisdiction change | Authority becomes stale, receives negative treatment, or a source gap is detected |
| C | "Check this document"; "assess our risk" | Monthly/quarterly compliance review and policy refresh | New regulation, incident, activity, document, or matter update | Risk crosses a threshold, remediation is overdue, or coverage is incomplete |
| D | Create/update/get/list/close a matter | Deadline reminders and weekly matter-status review | Case status, deadline, document, or team change | Deadline lead time is reached, required field is missing, or privilege conflict appears |
| E | Collect/search/review/export ESI | Preservation/review cadence and production-deadline reminders | New custodian/data source, search hit, or review completion | Privilege hit, review backlog/volume threshold, or production deadline approaches |

---

## Appendix: Healthcare Advisor — Specialist Assistant Assessment

**Domain.** End-to-end clinical and operational healthcare: symptom awareness, medical records, patient communication, care plans, appointment scheduling, schedule optimization, resource coordination and matching, record tagging/search, risk assessment, and analytics. The source exports one code skill, `symptom-checker`, plus 12 external-action skills. The catalog binds the same 12 external IDs; none has a current source implementation.

**Advise.** What are possible causes of these symptoms given the patient's history, and what is the likelihood ranking? Is this communication channel appropriate for the clinical urgency? Which risk-stratification cutoff is clinically appropriate for this population? Should this patient be escalated now, or monitored with a safety plan? The assistant reasons through options; the user or provider makes clinical decisions.

**Proxy.** Logging a symptom check with an empty guidance field and a professional disclaimer to the local store; preparing structured communication drafts for user review/send; preparing care-plan, scheduling, resource, tagging/search, risk, and analytics requests as dry runs until connectors exist; computing risk-stratification inputs only when a real risk connector is available — the current source does not calculate risk scores.

**Aide.** Preparing the intake form and triage questions for the user's next call with a provider; drafting the appointment request the user must send to the clinic; preparing a handoff summary for the care team to review.

**Higher-order skills.**

| # | Skill | Exact current IDs | Classification |
|---|---|---|---|
| A | Symptom Intake & Triage Awareness | `symptom-checker` | Reasoning-only/local code; current implementation records input but does not infer guidance |
| B | Medical Record Management | `healthcare-medical-record` | Real external — EHR MCP/API required; catalog/source stub |
| C | Patient Communication | `healthcare-patient-communication`, `healthcare-communication-scheduler` | Real external — communication and recurring-message connectors required; catalog/source stubs |
| D | Care Plan Management | `healthcare-care-plan` | Real external — care-plan API required; catalog/source stub |
| E | Scheduling & Capacity Optimization | `healthcare-appointment-scheduler`, `healthcare-schedule-optimizer` | Real external — scheduler and optimizer APIs required; catalog/source stubs |
| F | Resource Coordination & Matching | `healthcare-resource-coordinator`, `healthcare-resource-matcher` | Real external — resource management and matching APIs required; catalog/source stubs |
| G | Record Tagging & Search | `healthcare-record-tagging`, `healthcare-record-search` | Real external — tagging/search APIs required; catalog/source stubs |
| H | Risk Assessment & Stratification | `healthcare-medical-risk-assessment` | Real external — risk service required; intended Hybrid only if record fetch and a local risk model are wired |
| I | Clinical & Operational Analytics | `healthcare-analytics` | Real external — analytics/BI API required; catalog/source stub |

Healthcare uses nine rows because its catalog exposes more distinct outcomes than the 4–7 default; each row is the smallest coherent grouping preserving a separate user outcome.

**Outputs & Config/Inputs.**

- *A implemented:* `{ success: true, data: { check, storePath } }`, where `check` contains `id`, `symptoms`, `duration`, an empty `guidance` string, `createdAt`, `source: 'local'`, and the disclaimer `This is not medical advice. Consult a qualified healthcare professional.`
- *B–I:* domain-specific result envelopes (records, communications, care plans, appointments/resources, tags/search, risk assessment, analytics). The external skills currently expose the generic external-action response (`success`, `mode`, `system`, `action`, `request`, `response`, `error`); domain-specific clinical payloads are proposed, not implemented.

User-supplied varies per skill: *A* requires `symptoms` array and `duration`; *B–I* require `operation`, patient/record IDs, and clinical data specific to each domain. Connector configs per skill: `HEALTHCARE_EHR_ENDPOINT`/`HEALTHCARE_EHR_ACCESS_TOKEN`, `HEALTHCARE_COMMUNICATION_ENDPOINT`/`HEALTHCARE_COMMUNICATION_API_KEY`, `HEALTHCARE_SCHEDULER_ENDPOINT`/`HEALTHCARE_SCHEDULER_ACCESS_TOKEN`, `HEALTHCARE_OPTIMIZER_ENDPOINT`/`HEALTHCARE_OPTIMIZER_ACCESS_TOKEN`, `HEALTHCARE_RESOURCE_ENDPOINT`/`HEALTHCARE_RESOURCE_ACCESS_TOKEN`, `HEALTHCARE_MATCHER_ENDPOINT`/`HEALTHCARE_MATCHER_API_KEY`, `HEALTHCARE_TAGGING_ENDPOINT`/`HEALTHCARE_TAGGING_API_KEY`, `HEALTHCARE_SEARCH_ENDPOINT`/`HEALTHCARE_SEARCH_ACCESS_TOKEN`, `HEALTHCARE_RISK_ENDPOINT`/`HEALTHCARE_RISK_ACCESS_TOKEN`, `HEALTHCARE_ANALYTICS_ENDPOINT`/`HEALTHCARE_ANALYTICS_ACCESS_TOKEN`. Fallback: all external skills return `mode: 'dry-run'` or an explicit error when unconfigured; they must not fabricate clinical data, records, risk scores, communications, resource allocations, or analytics. `HEALTHCARE_HOME` defaults to `/tmp/healthcare`.

**Triggers.**

| Skill | User | Scheduled | Event-driven | Data-driven |
|---|---|---|---|---|
| A | Check these symptoms | — | New symptom log entry | Symptom severity or duration crosses a configured threshold |
| B | View, edit, or search records | Record review cycle | Lab result or encounter is recorded | Missing consent, audit, or required record field |
| C | Draft or schedule a patient message | Recurring care-plan check-ins | Care-plan or communication preference changes | Delivery failure, opt-out, or urgency mismatch |
| D | Create or update a care plan | Recurring care-plan review | New encounter, goal, or team assignment | Goal/outcome measure is overdue |
| E | Schedule an appointment or optimize coverage | Scheduling review cycle | No-show, cancellation, or provider availability change | Wait-time, conflict, or utilization threshold is breached |
| F | Allocate or match a resource | Capacity review cycle | Bed/equipment/staff status changes | Utilization or clinical-priority threshold is breached |
| G | Tag or search records | Index/tag audit cycle | New record or coding guideline arrives | Search/tag validation or reconciliation discrepancy |
| H | Assess or stratify risk | Weekly risk refresh | New lab, encounter, or risk-model version | Patient crosses risk threshold or cohort risk changes |
| I | Generate a clinical/operational report | Monthly analytics cycle | New data source or regulatory reporting period | KPI, no-show, wait-time, or quality threshold is breached |

**Safety/approval boundaries.** Skill A is informational only, always recommends consulting a qualified professional, and never diagnoses or prescribes. External skills touching PHI require HIPAA-compliant transport, consent management, and audit logging. Sending communications or mutating records, care plans, schedules, resources, tags, risk records, or analytics exports requires explicit user confirmation per action. No automated clinical decisions. Scheduled and event-driven triggers create drafts or alerts only.

**Shared state/data flow.** The only implemented persistence is `HEALTHCARE_HOME/checks.json` (default `/tmp/healthcare/checks.json`) for symptom checks. The 12 external skills share no state today and do not write that store. `patientId` is the proposed join key for a future flow `records -> risk -> care plan -> communication/resource coordination`; it is an input contract, not current shared state.

**Implemented vs. stub.** `symptom-checker` is implemented as local persistence with an empty guidance field and a professional disclaimer. The following 12 IDs are external-action stubs/catalog-only bindings with no current implementation: `healthcare-medical-record`, `healthcare-patient-communication`, `healthcare-care-plan`, `healthcare-appointment-scheduler`, `healthcare-schedule-optimizer`, `healthcare-record-tagging`, `healthcare-record-search`, `healthcare-resource-coordinator`, `healthcare-resource-matcher`, `healthcare-communication-scheduler`, `healthcare-medical-risk-assessment`, and `healthcare-analytics`.



---

## Appendix: Sports Wager Advisor — Operations Assistant Assessment

### Domain
End-to-end sports wagering analysis: matchup prediction, odds evaluation, bankroll management, risk assessment, responsible gambling safeguards, and performance tracking — as a comprehensive analytical companion, not 17 disconnected tools.

### Advise
- Given current lines and my model's edge, is this wager worth taking at this stake?
- How does my current bankroll distribution compare to optimal Kelly sizing, and what's the risk of ruin?
- Is this betting pattern concerning, and should I set cooldown limits?
- What's my actual edge vs. the market's implied probability on this matchup?

These are financial and behavioral judgment calls. The assistant never places bets, never transfers money, and never sets account-level limits without explicit user action.

### Proxy
- Running Monte Carlo simulations and computing win probabilities, projected scores/spread/total, and betting edges
- Tracking bankroll allocation, recording results, and computing ROI/CLV/hit-rate
- Scanning for arbitrage opportunities across bookmakers (analysis only, not execution)
- Generating standardized risk reports and responsible gambling assessments

These are computational, deterministic, and reversible — the textbook case for proxy action.

### Aide
- Preparing a betting strategy document with rationale, edge analysis, and stake sizing for user review
- Drafting a bankroll management plan with limits, stop-loss, and take-profit rules (user sets final values)
- Creating a self-assessment for betting behavior patterns (user interprets and acts)
- Summarizing performance trends for a quarterly review (user decides strategy adjustments)

### Higher-Order Skills

| # | Skill | Exact Current IDs | Nature |
|---|---|---|---|
| A | Matchup Analysis & Prediction | `analyze-matchup` (code), `sports-prediction-engine`, `sports-performance-modeling`, `sports-stats-collector` | Hybrid — deterministic algorithmic analysis (code skill) + real data feeds (stats/odds APIs, stubs) |
| B | Odds & Market Intelligence | `sports-odds-data-collector`, `sports-odds-comparison`, `sports-value-betting-analyzer`, `sports-live-data-collector`, `sports-in-game-analyzer`, `sports-live-betting-advisor` | Real external — requires live odds provider APIs (DraftKings, FanDuel, Bet365, etc.); all stub connectors |
| C | Bankroll & Risk Management | `sports-bankroll-manager`, `sports-betting-risk-assessment`, `sports-gambling-risk-analyzer` | Hybrid — local bankroll tracking + risk model APIs (stubs for risk assessment endpoint) |
| D | Performance Tracking | `sports-betting-performance-analyzer` | Reasoning-only — operates on locally stored bet records; external performance API optional |
| E | Responsible Gambling | `sports-responsible-gambling`, `sports-responsible-gambling-planner` | Reasoning-only — local limit-setting and behavior monitoring; external reporting optional |

### Outputs & Config/Inputs

**A. Matchup Analysis & Prediction** — Team strength ratings, win probabilities, projected scores/spread/total, Monte Carlo simulation results, key matchup analysis, injury impact, weather effects, and betting edge vs. current lines. User-supplied: teams, sport, date, stats where available, betting lines (optional for edge calc). Assistant-derived: all ratings, probabilities, predictions from algorithmic analysis (seeded deterministic computation). Config: stats/odds data APIs optional — without them, uses user-supplied stats and states "no live data feed connected."

**B. Odds & Market Intelligence** — Current odds from multiple bookmakers, comparison tables, value bet identification, line movement tracking, live in-game analysis, and real-time betting recommendations. User-supplied: sport, event, market type (optional: specific bookmakers to compare). Assistant-derived: best prices, arbitrage scans, value calculations, momentum analysis from live feeds. Config: odds provider APIs (DraftKings, FanDuel, Bet365, Pinnacle, etc.) required for live data. Without them: "no odds feed connected — cannot retrieve current lines." Must be explicit, not silent.

**C. Bankroll & Risk Management** — Current bankroll status, stake allocation recommendations, loss/limit tracking, risk assessment (VaR, expected loss, drawdown), and behavioral risk pattern analysis. User-supplied: bankroll amount, stake amounts, outcomes (win/loss), risk tolerance thresholds. Assistant-derived: allocation recommendations per strategy (flat/Kelly/Fibonacci), risk scores, performance statistics. Config: risk model API optional. Without it: algorithmic risk estimation from local data with caveats.

**D. Performance Tracking** — ROI, hit rate, CLV, closing line value, stake distribution analysis, and performance breakdowns by sport/market/bookmaker/timeframe. User-supplied: bet history (or auto-imported from bankroll records). Assistant-derived: all metrics from bet records. Config: none external required; entirely computed from local data.

**E. Responsible Gambling** — Session limits, cooldown enforcement, self-exclusion tracking, behavior pattern detection, intervention plans, and risk scores. User-supplied: limits (daily/weekly loss, session time), self-exclusion preferences. Assistant-derived: behavior scores, pattern flags, intervention plan drafts. Config: none external required; local enforcement with optional external reporting.
