# Cross-Assistant Skill Redesign
### Applying the framework to all 19 remaining audited categories

Source: `SKILLS_AUDIT_REPORT_CORRECTED_PART1.md`, 249 skills across 20 categories.
Career (22 skills) was already redesigned into 7 skills — see `skill-design-framework.md`
and `career-coach-v2/index.ts`. This document does steps 1–5 for the other 19, states
which higher-order skill absorbs which original skill id (your "existing skills as
executive features" instruction), and flags the category-specific fix the audit
surfaced. Two categories — **CTO** and **Restaurant** — are fully implemented in code
alongside this doc as worked examples of the two dominant failure patterns found:

- **Pattern 1 — real integration + dead advisory stub, side by side** (CTO, Product, Investment):
  a handful of skills talk to genuinely different real systems (Jira, GitHub, Datadog),
  and one or two "advisory" skills that should be reasoning are instead empty-output code
  stubs. Fix: keep the real integrations distinct, replace the stubs with grounded
  reasoning, and let the reasoning skill consume the real integrations' data.
- **Pattern 2 — the same wrapper, copy-pasted N times** (Restaurant ×31, Executive ×17,
  Hotel ×20, Healthcare ×12, Sports ×10, HR/Legal/Marketing/Finance/Support ×6–8 each):
  near-identical `baseUrl`/`apiKey`/`provider` skills that differ only in name. Fix:
  collapse into one router skill per real domain, with the original skill ids becoming
  named `operation` values inside it — i.e. **executive features of the higher-order
  skill**, not separately-surfaced buttons.

Every category below also inherits the systemic fixes the audit flagged directly:
add real `configSchema` where absent (all of Education, Event, Creative's external
skills), fix the `CAREER_HOME` env var bug present in at least 9 other categories'
local code skills, and add real `description` strings to every input (99.2% currently
lack them).

---

## 1. Analytics (2 skills → 1)
**Domain:** ad hoc business-intelligence — what's happening in the numbers, and why.
**Advise:** interpret trends, flag anomalies, recommend where to look next.
**Proxy:** pull real numbers from a connected warehouse/BI tool.
**Aide:** n/a — this category is advisory end to end.

- **Business Insight Report** (hybrid) — absorbs `generate-report`, `identify-trends`
  as two modes of one skill. Currently both return `{}`/empty arrays regardless of
  input; the fix isn't just "add data," it's that the skill must say "no data source
  is connected" when true, rather than return a well-formed empty object that looks
  like a real answer.

---

## 2. Content (10 → 3)
**Domain:** content production and distribution across blog/social/video/email channels.
**Advise:** SEO and content strategy, audience-insight interpretation.
**Proxy:** publish/schedule to a real blog, social, or video platform; pull real analytics.
**Aide:** draft copy for the user's review before anything publishes.

- **Content Drafting & Adaptation** (reasoning-only) — absorbs `draft-blog-post`
  (currently returns empty `body`), `content-adaptation`, the drafting half of
  `social-media-post`.
- **Multi-Channel Publishing** (proxy) — absorbs `content-blog-platform`,
  `content-video-platform`, the publish half of `social-media-post`, `content-planner`
  — one skill, `channel` parameter, instead of 4 near-duplicate publish wrappers.
- **Content Performance & SEO Insight** (hybrid) — absorbs `content-analytics`,
  `content-trend-analysis`, `content-audience-insights`, `content-seo`.

---

## 3. Creative (4 → 2)
**Domain:** creative writing support for musicians/video creators.
**Advise:** trend-informed creative direction.
**Aide:** actually producing the lyrics/script draft — currently the starkest stub in
the whole audit: `write-lyrics` returns empty verses, `write-script` returns an empty
scene array. This is the clearest case of a "skill" that does no work at all.

- **Creative Drafting** (reasoning-only) — absorbs `write-lyrics`, `write-script`;
  must generate real draft content, not a scaffold with empty fields.
- **Trend & Planning Advisory** (hybrid) — absorbs `scriptwriter-content-planner`,
  `songwriter-trend-analysis`.

---

## 4. CTO (16 → 4) — *fully implemented, see `cto-v2/index.ts`*
**Domain:** engineering operations, delivery, and infrastructure stewardship.
**Advise:** architecture and tech-stack decisions, disaster-recovery posture.
**Proxy:** ticketing, alerting, and infra/cost queries against real systems (Jira,
GitHub, Datadog, AWS/GCP/Azure, PagerDuty, Kubernetes, service mesh).
**Aide:** incident postmortems, migration runbooks.

- **Infrastructure Query** (proxy, read-only) — absorbs `cto-datadog`, `cto-aws`,
  `cto-gcp`, `cto-azure`, `cto-kubernetes`, `cto-service-mesh`,
  `cto-cost-optimization`, `cto-iac-monitoring`, `cto-database-operations`,
  `cto-team-metrics`, and the read side of `cto-github` — one dispatcher, `provider`
  parameter, each original skill becomes an internal capability rather than its own button.
- **Engineering Actions** (proxy, mutating — confirm before send) — absorbs
  `cto-jira`, `cto-pagerduty`, the write side of `cto-github`.
- **Incident & Disaster Readiness** (hybrid) — absorbs `cto-disaster-recovery` plus
  incident history pulled via Engineering Actions.
- **Architecture & Tech Stack Advisory** (reasoning-only) — absorbs
  `architecture-review`, `tech-stack-recommendation`; both currently return empty
  `concerns`/`recommendations` — the redesign grounds this in real signals pulled from
  Infrastructure Query instead of static placeholders.

---

## 5. Education (16 → 4)
**Domain:** lesson planning, assessment, and per-learner adaptation.
**Advise:** how to adapt instruction to a learner's style/gaps; engagement strategy.
**Proxy:** pull real performance/progress data if an LMS is connected; manage a real
resource repository.
**Aide:** draft lesson plans, quizzes, and activities for teacher review.

- **Lesson & Assessment Drafting** (reasoning-only) — absorbs `create-lesson-plan`,
  `generate-quiz`, `education-activity-designer`, `education-content-creator`,
  `education-multimedia-integrator`.
- **Learner Insight** (hybrid) — absorbs `education-learning-analytics`,
  `education-learning-style-analyzer`, `education-performance-analyzer`,
  `education-progress-tracker`, `education-motivation-analyzer`.
- **Adaptive Personalization Advisory** (reasoning-only, consumes Learner Insight) —
  absorbs `education-adaptation-engine`, `education-engagement-planner`.
- **Resource Library Ops** (proxy) — absorbs `education-resource-organizer`,
  `education-resource-tagger`, `education-resource-analyzer`,
  `education-accessibility-checker`.

*Category-specific fix:* none of these 14 external skills have a `configSchema` at
all — they're the thinnest wrappers in the audit. Give the 4 consolidated skills real
config before anything else.

---

## 6. Event (8 → 3)
**Domain:** end-to-end event planning and day-of execution.
**Advise:** budget allocation, vendor tradeoffs.
**Proxy:** booking vendors/venues, payments, contracts, check-in — all real
transactional actions.
**Aide:** draft the event plan/timeline for approval.

- **Event Planning & Budgeting** (reasoning-only, replaces stub) — absorbs
  `plan-event`, `event-budget-tracker`.
- **Vendor & Contract Management** (proxy) — absorbs `event-vendor-database`,
  `event-contract`, `event-payment`.
- **Day-of Operations** (proxy) — absorbs `event-seating`, `event-check-in`,
  `event-monitor`.

*Category-specific fix:* the audit flags this as the one category where **all 7**
external skills omit `configSchema` entirely — add it before consolidating.

---

## 7. Executive (19 → 5)
**Domain:** leadership coaching plus operational support for a senior leader.
**Advise:** coaching, decision frameworks, EQ/presence/communication feedback,
career roadmap — personal, judgment-based territory, always options not verdicts.
**Proxy:** calendar and email.
**Aide:** draft development plans, prep for feedback conversations.

- **Leadership Advisory** (reasoning-only) — absorbs `leadership-coaching`,
  `decision-framework`, `executive-leadership-assessment`,
  `executive-eq-assessment`, `executive-presence-analyzer`,
  `executive-communication-analyzer`, `executive-communication-coach` — one skill,
  `focusArea` parameter, replacing 7 near-duplicate assessment wrappers.
- **Development & Career Planning** (reasoning-only) — absorbs
  `executive-skill-gap`, `executive-development-plan`, `executive-improvement-plan`,
  `executive-career-planner`, `executive-career-roadmap`,
  `executive-resource-recommender`.
- **Feedback Collection & Analysis** (hybrid) — absorbs
  `executive-feedback-collector`, `executive-feedback-analysis`,
  `executive-performance-analyzer`.
- **Executive Ops** (proxy) — absorbs `executive-calendar`, `executive-email`.
- **Risk & Scenario Advisory** (reasoning-only) — absorbs
  `executive-risk-assessment`, `executive-scenario-modeler`.

*Category-specific fix:* this is the single clearest case of one wrapper shape
copy-pasted with 17 different names. Collapsing to 5 real skills is most of the fix by itself.

---

## 8. Finance (10 → 4)
**Domain:** business financial planning & analysis.
**Advise:** risk assessment, regulatory read, model interpretation.
**Proxy:** pull real ledger/ERP data, generate reports, track budget vs. actual.
**Aide:** build the financial model draft, clean data for review.

- **Financial Modeling & Analysis** (reasoning-only, replaces stub) — absorbs
  `financial-model`, `finance-financial-analysis`, `analyze-investment`.
- **Reporting & Data Ops** (hybrid) — absorbs `finance-reporting`,
  `finance-financial-data`, `finance-data-cleaning`, `finance-document-management`.
- **Risk & Regulatory Advisory** (hybrid) — absorbs
  `finance-financial-risk-assessment`, `finance-regulatory`.
- **Budget Tracking** (proxy) — absorbs `finance-budget-tracker`.

---

## 9. Healthcare (13 → 5)
**Domain:** clinical and administrative support for a care team — **not** diagnosis.
**Advise:** care-plan reasoning and risk-assessment interpretation, always framed as
decision support for a clinician, never a verdict to a patient.
**Proxy:** scheduling, records search/tagging, resource coordination via a real EHR.
**Aide:** draft care plans and patient communications for clinician sign-off.

- **Clinical Decision Support** (reasoning-only, heavily caveated) — absorbs
  `symptom-checker`, `healthcare-care-plan`, `healthcare-medical-risk-assessment`.
- **Records & Scheduling Ops** (proxy) — absorbs `healthcare-medical-record`,
  `healthcare-record-tagging`, `healthcare-record-search`,
  `healthcare-appointment-scheduler`, `healthcare-schedule-optimizer`.
- **Patient Communication** (aide/proxy) — absorbs
  `healthcare-patient-communication`, `healthcare-communication-scheduler`.
- **Resource Coordination** (proxy) — absorbs `healthcare-resource-coordinator`,
  `healthcare-resource-matcher`.
- **Operational Analytics** (hybrid) — absorbs `healthcare-analytics`.

*Category-specific fix:* `symptom-checker` returning empty `conditions`/
`recommendations` is actually safer than a confident-looking wrapper that returns
nothing meaningful — but the redesign must keep the replacement explicitly
clinician-facing decision support, sourced, and never presented as a diagnosis.

---

## 10. Hotel (21 → 4) — *same collapse pattern as Restaurant, see that section's code*
**Domain:** front- and back-of-house property operations.
**Advise:** revenue/pricing strategy, staffing recommendations from analytics.
**Proxy:** reservations, room assignment, billing, housekeeping/maintenance dispatch,
guest communication — via a real PMS.
**Aide:** draft guest-service responses and concierge recommendations.

- **Reservations & Guest Profile** (proxy) — absorbs `manage-reservation`,
  `hotel-room-assignment`, `hotel-guest-profile`, `hotel-external-booking`,
  `hotel-billing`.
- **Property Operations** (proxy) — absorbs `hotel-housekeeping-scheduler`,
  `hotel-maintenance`, `hotel-room-status`, `hotel-task-dispatch`,
  `hotel-issue-tracker`, `hotel-inventory-management` — one dispatcher.
- **Guest Experience** (aide/proxy) — absorbs `hotel-concierge-knowledge`,
  `hotel-local-information`, `hotel-guest-service`, `hotel-guest-communication`.
- **Revenue & Performance Advisory** (hybrid) — absorbs `hotel-revenue`,
  `hotel-operational-analytics`, `hotel-staff-performance`.

---

## 11. HR (11 → 3)
**Domain:** recruiting and talent operations (employer-side mirror of Career).
**Advise:** candidate assessment interpretation, compliance risk.
**Proxy:** job-board posting, ATS actions, scheduling, outreach email.
**Aide:** draft screening summaries, interview scorecards.

- **Candidate Screening & Assessment** (reasoning-only) — absorbs `screen-resume`,
  `hr-assessment`. `screen-resume` returning `score: 0` for every candidate is a
  correctness bug, not just a design gap — fix it first.
- **Recruiting Ops** (proxy) — absorbs `hr-ats`, `hr-job-board`, `hr-linkedin`,
  `schedule-interview`, `hr-calendar`, `hr-email`.
- **Hiring Analytics & Compliance Advisory** (hybrid) — absorbs
  `hr-hiring-analytics`, `hr-compliance`.

---

## 12. Investment (8 → 3) — closest to production-ready already
**Domain:** portfolio and market analysis (distinct from Finance's corporate FP&A).
**Advise:** portfolio construction, risk/return tradeoffs — informational, never a
directive to trade.
**Proxy:** real market-data pull.

- **Market Data Access** (proxy) — absorbs `investment-market-data`, which the audit
  notes already has an unusually complete `configSchema`.
- **Portfolio & Risk Advisory** (reasoning-only, grounded by Market Data Access) —
  absorbs `portfolio-analysis`, `investment-analysis`,
  `investment-financial-risk-assessment`, `investment-portfolio-optimizer`,
  `investment-evaluator`.
- **Research & Planning** (hybrid) — absorbs `investment-market-research`,
  `investment-financial-planner`.

---

## 13. Legal (10 → 4)
**Domain:** legal research and matter support — informational, review-required, not a
substitute for counsel.
**Advise:** contract issue-spotting, risk assessment.
**Proxy:** case-management updates, document tagging, e-discovery search.
**Aide:** draft clauses/summaries for attorney review.

- **Contract & Document Advisory** (reasoning-only) — absorbs `review-contract`,
  `draft-clause`, `legal-risk-assessment`.
- **Legal Research** (hybrid) — absorbs `legal-research`, `legal-statute-database`,
  `legal-case-search`.
- **Matter & Document Ops** (proxy) — absorbs `legal-case-management`,
  `legal-document-tagging`, `legal-ediscovery`.
- **Compliance Tracking** (hybrid) — absorbs `legal-compliance`.

*Category-specific fix:* `review-contract` returning `issues: []` regardless of the
contract text is the same false-confidence failure as Healthcare's symptom-checker —
it must never silently report "no issues found" when no analysis actually happened.

---

## 14. Marketing (8 → 3)
**Domain:** campaign planning and execution across channels.
**Advise:** campaign strategy, performance interpretation.
**Proxy:** publish to social/email, run SEO checks.
**Aide:** draft campaign plan and creative for review.

- **Campaign Planning & Drafting** (reasoning-only) — absorbs `plan-campaign`,
  `marketing-content-generation`.
- **Multi-Channel Publishing** (proxy) — absorbs `marketing-social-media`,
  `marketing-email`, `marketing-document-management` — one skill, `channel` parameter.
- **Performance & Audience Insight** (hybrid) — absorbs `analyze-performance`,
  `marketing-audience-insights`, `marketing-seo`, `marketing-market-research`.

---

## 15. Product (8 → 5) — mostly *not* the sprawl pattern
**Domain:** product planning, documentation, and cross-tool coordination.
**Advise:** roadmap prioritization, PRD scoping.
**Proxy:** Jira, Confluence, Slack, Calendar — genuinely distinct real systems, so
unlike the sprawl categories these mostly stay separate rather than collapsing into
one router.
**Aide:** draft the roadmap/PRD content itself.

- **Roadmap & PRD Drafting** (reasoning-only) — absorbs `create-roadmap`, `write-prd`.
- **Delivery Tracking** (proxy) — absorbs `product-jira`, `product-confluence` —
  publishes drafted content directly into these tools instead of the user retyping it.
- **Product Analytics Insight** (hybrid) — absorbs `product-data-analysis`.
- **Team Coordination** (proxy) — absorbs `product-slack`, `product-calendar`.
- **Document Ingestion** (internal utility, not user-facing) — absorbs
  `product-markdown-parsing`, used by Roadmap & PRD Drafting and Delivery Tracking
  rather than exposed as its own button.

---

## 16. Restaurant (32 → 6) — *fully implemented, see `restaurant-v2/index.ts`*
**Domain:** full-service restaurant operations, front and back of house.
**Advise:** menu/pricing strategy, demand forecasting, labor planning.
**Proxy:** reservations, kitchen ops, supply chain, staffing — via a real POS/PMS.
**Aide:** n/a — mostly mechanical or advisory, little pure drafting.

- **Reservations & Guest Experience** (proxy) — absorbs
  `restaurant-reservation-system`, `restaurant-table-management`,
  `restaurant-guest-profile`, `restaurant-floor-management`,
  `restaurant-guest-feedback`, `restaurant-reservation-analytics`,
  `restaurant-table-turnover`.
- **Kitchen & Service Operations** (proxy) — absorbs `restaurant-service-flow`,
  `restaurant-kitchen-display`, `restaurant-station-coordinator`,
  `restaurant-prep-scheduler`, `restaurant-server-communication`,
  `restaurant-quality-control`.
- **Menu & Recipe Management** (hybrid) — absorbs `restaurant-recipe-management`,
  `restaurant-recipe-costing`, `restaurant-menu-engineering`,
  `restaurant-menu-optimizer`, `restaurant-pricing-strategy`.
- **Supply Chain & Inventory** (proxy) — absorbs `manage-inventory`,
  `restaurant-purchase-order`, `restaurant-supplier-management`,
  `restaurant-order-optimizer`, `restaurant-waste-management`,
  `restaurant-price-tracking`.
- **Staffing & Labor** (hybrid) — absorbs `restaurant-staff-scheduler`,
  `restaurant-labor-analytics`.
- **Financial Performance Advisory** (hybrid) — absorbs
  `restaurant-financial-analytics`, `restaurant-variance-analysis`,
  `restaurant-trend-analysis`, `restaurant-sales-analytics`,
  `restaurant-demand-forecast`.

*Category-specific fix:* this is the worst offender in the whole audit — 31 of 32
skills share one 3-field schema (`operation`, `endpointUrl`, `dryRun`) with zero
provider-specific fields. Six real skills, each with a real field-level schema and a
`provider` enum matching the actual POS/reservation systems named in the audit
(OpenTable, Resy, SevenRooms, Toast, Square, etc.), replace them.

---

## 17. Sales (6 → 3)
**Domain:** sales pipeline execution.
**Advise:** lead-scoring rationale, deal risk.
**Proxy:** CRM updates, meeting scheduling, document/e-sign.
**Aide:** draft outreach messages.

- **Lead & Deal Advisory** (reasoning-only) — absorbs `score-lead` and the
  interpretive half of `sales-analytics`. `score-lead` currently returns a bare
  0–100 number with no rationale — the same "raw function, not assistance" problem
  named in the original conversation, now showing up outside Career.
- **Outreach Drafting** (reasoning-only) — absorbs `draft-outreach`.
- **Pipeline Ops** (proxy) — absorbs `sales-crm`, `sales-calendar`,
  `sales-document-management`.

---

## 18. Sports (25 → 5) — split into two genuinely different sub-domains
**Domain:** this category conflates two things that need different treatment:
performance/competition analytics, and sports **betting** support. The betting
cluster carries real financial-harm considerations and should never share a design
pattern with plain performance stats.
**Advise:** matchup/performance analysis; for betting, responsible-play framing is
mandatory and non-negotiable — advice must foreground risk, never optimize purely
for stake sizing.
**Proxy:** real stats/odds data pulls, if connected.

- **Performance Analytics** (hybrid) — absorbs `analyze-matchup`,
  `sports-stats-collector`, `sports-team-analytics`, `sports-player-analytics`,
  `sports-game-analytics`, `sports-season-analytics`, `sports-league-analytics` —
  one query skill, `entity` parameter, replacing 6 near-identical wrappers.
- **Business & Fan Analytics** (hybrid) — absorbs `sports-venue-analytics`,
  `sports-fan-analytics`, `sports-broadcast-analytics`,
  `sports-sponsorship-analytics`, `sports-merchandise-analytics` — one skill,
  `metric` parameter, replacing 5 near-identical wrappers.
- **Odds & Market Data** (proxy) — absorbs `sports-odds-data-collector`,
  `sports-live-data-collector`, `sports-odds-comparison`.
- **Betting Risk & Responsible Play** (advise, heavily guarded, kept separate from
  the analytics skills above) — absorbs `sports-betting-risk-assessment`,
  `sports-value-betting-analyzer`, `sports-bankroll-manager`,
  `sports-responsible-gambling`, `sports-gambling-risk-analyzer`,
  `sports-responsible-gambling-planner`, `sports-live-betting-advisor`,
  `sports-betting-performance-analyzer`.
- **In-Game & Predictive Modeling** (hybrid) — absorbs `sports-in-game-analyzer`,
  `sports-prediction-engine`, `sports-performance-modeling`,
  `sports-performance-optimizer`.

---

## 19. Support (10 → 4)
**Domain:** customer support operations.
**Advise:** sentiment/issue analysis, escalation judgment, staffing/planning.
**Proxy:** CRM/ticket updates, escalation routing, follow-up scheduling.
**Aide:** draft ticket responses for agent review/send.

- **Ticket Understanding** (reasoning-only, grounded by the KB) — absorbs the
  analysis half of `resolve-ticket`, `support-sentiment-analysis`,
  `support-issue-analysis`, and `search-kb` as a grounding lookup.
- **Response Drafting** (reasoning-only) — absorbs `support-response`.
- **Ticket Ops** (proxy) — absorbs `support-crm`, `support-escalation`,
  `support-follow-up`.
- **Support Analytics & Planning** (hybrid) — absorbs `support-analytics`,
  `support-planning`.

*Category-specific fix:* `resolve-ticket` returns `resolution: ''` regardless of the
issue text, and `search-kb` returns `results: []` even when the local store has
matching entries — the second one is a straightforward bug, not just a design gap,
worth flagging back to whoever generates future audits.

---

## Summary: what changes mechanically, everywhere

1. **Collapse near-duplicate wrappers** into one router skill per real domain,
   parameterized by `provider`/`operation`/`entity` — this alone eliminates roughly
   150 of the 249 audited skills without losing any real capability, because the
   duplication was in the wrapper shape, not the underlying integrations.
2. **Replace every stub** (`C` tag — 28 skills, one or two per category) with a real
   reasoning skill grounded in whatever data the category's proxy skills can now
   actually pull, instead of hardcoded empty output.
3. **Add real `configSchema` and field-level `description`** to every surviving
   skill — Education, Event, and Creative's external skills currently have none at
   all, and 99.2% of all skills lack descriptions.
4. **Fix the `CAREER_HOME` copy-paste bug** — present in at least 9 other categories'
   local code skills (`cto`, `hotel`, `restaurant`, `investment`, `sports`, `sales`,
   `marketing`, `healthcare`, `executive`, `legal`, `finance`, `support` all show this
   in the audit) — each category's storage should use its own env var.
5. **Separate advisory from mutating action everywhere**, the same review-gate
   principle used in Career's Application Execution skill: real writes (submitting,
   publishing, emailing, triggering an incident) default to a confirm-before-send
   posture; read/query skills don't need one.
