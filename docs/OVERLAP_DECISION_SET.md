# Overlap Decision Set

## Purpose

This document is a working overlap decision set keyed by user outcome, object, and decision boundary. It is consumed by registry/refactoring decisions (e.g., `getOverlappingSkills()` reporting, ADK consolidation, selective deployment). Duplicate IDs alone are not sufficient to establish duplicate user value; semantic overlap must be reviewed by comparing the user outcome, the object being acted upon, and the decision boundary separating capabilities.

## Consumer

- `services/tool-executor/src/data/skills/registry.ts` — `detectOverlappingSkills()` and `getOverlappingSkills()` use ID overlap as a signal; this document provides the semantic disposition for each reported and unreported overlap.
- Sprint 8 ADK refactoring — determines which capabilities should share a base builder versus remain differentiated.
- Sprint 9 selective deployment — determines whether two assistants can share a module or must remain distinct.
- `services/tool-executor/src/__tests__/schema-validation.test.ts` and `workflow-governance.test.ts` — encode the decisions as passing tests.

## Decision Key

Each decision is keyed by three dimensions:

- **User outcome**: What the user is trying to accomplish (the job-to-be-done)
- **Object**: The product entity, data domain, or system being acted upon
- **Decision boundary**: The factor that distinguishes this capability from adjacent ones

## Decisions

### DEC-001: Analytics Reporting Across Assistants

| Dimension | Value |
|---|---|
| **User outcome** | Understand business performance and surface actionable insight from data |
| **Object** | Varies: business metrics (Analytics), patient/operational data (Healthcare), product metrics (Product), market/competitive data (Marketing), infrastructure metrics (CTO) |
| **Decision boundary** | The data domain/object being analyzed. A user asking "how are we doing?" gets a different answer depending on whether the object is business KPIs, patient volumes, product adoption, campaign ROI, or system health. |
| **Skills** | Analytics `analytics_business_insight_report`/`analytics-grounded-reporting`/`analytics-warehouse-query`, Healthcare `healthcare_operational_analytics`, Product `product-data-analysis`, Marketing `marketing-market-research`, CTO `cto-infrastructure-query` |
| **Decision** | **Retain as separate.** Same meta-outcome (data-driven insight) but objects differ. Consolidating would conflate business strategy questions with clinical operations, product decisions, market intelligence, and infrastructure monitoring. |
| **Registry implication** | `getOverlappingSkills()` reports no ID overlap here, but semantic overlap exists in the "report on data" pattern. ADK should provide a shared report-builder primitive parameterized by data domain, not a single merged skill. |

### DEC-002: "Plan" Stage Across Assistants

| Dimension | Value |
|---|---|
| **User outcome** | Create a structured plan for the assistant's primary domain |
| **Object** | Varies: infrastructure systems (CTO), campaigns (Marketing), products (Product), learners (Education), roadmaps (Product) |
| **Decision boundary** | The domain object being planned. CTO plans system modernization; Marketing plans campaigns; Product plans product roadmaps. These are not interchangeable. |
| **Skills** | CTO `cto-architecture-tech-debt-evaluator`, `cto-cloud-spend-infrastructure-optimizer`; Marketing `plan-campaign`; Product `create-roadmap`; Education `education_learner_insight` (plan stage) |
| **Decision** | **Retain as separate.** The "plan" label is a shared stage name (benign per `workflow-governance.test.ts`), but the objects and outputs differ entirely. Merging would create a generic "plan" skill that does none of these well. |
| **Registry implication** | No action needed. Stage names may overlap; objects and product contexts do not. Registry already captures `productObject` per assistant. |

### DEC-003: External Action/Integration Skills (Jira, Confluence, Slack, Calendar, GitHub, PagerDuty, etc.)

| Dimension | Value |
|---|---|
| **User outcome** | Execute an external action through a connected system |
| **Object** | Varies: product backlog items (Product-Jira), product docs (Product-Confluence), team communication (Product-Slack), scheduling (Product-Calendar), engineering issues (CTO-GitHub), engineering incidents (CTO-PagerDuty), marketing content (Marketing-CMS), marketing social (Marketing-Social), healthcare records (Healthcare-Records), healthcare communication (Healthcare-Communication) |
| **Decision boundary** | The external system being operated and the product context of that operation. Jira for product backlog management is a different user value than Jira for engineering issue tracking, even if the same API is called. |
| **Skills** | Product Jira/Confluence/Slack/Calendar, CTO GitHub/PagerDuty, Marketing CMS/Social/SEO/Email/Document, Healthcare Records/Communication, HR Recruiting |
| **Decision** | **Retain as separate.** Each external action skill targets a distinct system within a distinct assistant's product context. Even when the same underlying API is used (e.g., HTTP POST to an external system), the user expects different outcomes, different confirmation flows, and different audit trails. |
| **Registry implication** | The `createExternalActionSkill` factory already parameterizes system, action, endpoint, auth, and configSchema. No merge needed; the factory is the correct abstraction level. |

### DEC-004: Communication/Send Capabilities Across Assistants

| Dimension | Value |
|---|---|
| **User outcome** | Deliver a message or notification to a recipient |
| **Object** | Varies: patients (Healthcare-Communication), campaign audiences (Marketing-Email), social audiences (Marketing-Social), candidates (HR-Recruiting) |
| **Decision boundary** | Recipient type and communication purpose. A patient appointment reminder is governed by healthcare rules (HIPAA), a marketing email by CAN-SPAM, a recruiting outreach by EEO. User expects different compliance behavior, templates, and audit. |
| **Skills** | Healthcare `healthcare_patient_communication`, Marketing `marketing-email`, `marketing-social-media`, HR `recruiting-ops` (includes email/scheduling) |
| **Decision** | **Retain as separate.** Same user action (send message) but different regulatory context, recipient type, and content purpose. Merging would risk compliance violations or user confusion about message origin. |
| **Registry implication** | Each skill carries its own `confirmBeforeSend` and configSchema per domain. No merge. |

### DEC-005: Query/Read-Only Data Access Capabilities

| Dimension | Value |
|---|---|
| **User outcome** | Retrieve and inspect data without modifying it |
| **Object** | Varies: infrastructure status (CTO-InfrastructureQuery), business metrics (Analytics-WarehouseQuery), product data (Product-DataAnalysis), market data (Marketing-MarketResearch), clinical data (Healthcare-ClinicalDecisionSupport) |
| **Decision boundary** | The data source and the type of insight expected. Querying infrastructure health returns system status; querying a warehouse returns business metrics; querying a CRM returns market intelligence. |
| **Skills** | CTO `cto-infrastructure-query`, Analytics `analytics-warehouse-query`, Product `product-data-analysis`, Marketing `marketing-market-research`, Healthcare `healthcare_clinical_decision_support` (read mode) |
| **Decision** | **Retain as separate.** Different data sources, different query languages, different output formats, different user expertise expectations. |
| **Registry implication** | Already separate. The ADK can share a query-execution primitive but should parameterize data source, query format, and result presentation. |

### DEC-006: "Review" or "Evaluate" Advisory Capabilities

| Dimension | Value |
|---|---|
| **User outcome** | Get an expert assessment or evaluation of a domain situation |
| **Object** | Varies: architecture/tech debt (CTO), clinical decisions (Healthcare), candidate fit (HR), market positioning (Career), financial performance (Finance), product roadmaps (Product), customer health (Support), hotel performance (Hotel) |
| **Decision boundary** | The domain expertise and evaluation criteria. Evaluating architecture debt uses reliability/security/scalability weights; evaluating candidates uses skill matching; evaluating clinical decisions uses medical guidelines. |
| **Skills** | CTO `cto-architecture-advisory`, `cto-architecture-tech-debt-evaluator`; Healthcare `healthcare-clinical-decision-support-evaluator`, `healthcare-clinical-practice-workflow-evaluator`; HR `hiring-analytics-compliance`; Career `career-job-market-positioning-evaluator`; Finance (advise skills); Product (advise skills); Support `customer-churn-health-evaluator`; Hotel `revenue-performance-advisory` |
| **Decision** | **Retain as separate.** "Evaluate" is a universal meta-action, but evaluation criteria, domain knowledge, and output format are domain-specific. No two evaluation skills can be meaningfully merged without losing accuracy. |
| **Registry implication** | ADK should provide a shared evaluation wrapper parameterized by scoring function, criteria schema, and output format — not a single merged skill. |

### DEC-007: Scheduling/Booking Capabilities Across Assistants

| Dimension | Value |
|---|---|
| **User outcome** | Reserve time, resources, or capacity for a specific entity |
| **Object** | Varies: medical appointments (Healthcare), interviews (HR), events (Event), reservations (Restaurant), rooms (Hotel), meetings (Product-Calendar) |
| **Decision boundary** | The entity being scheduled and the scheduling domain rules. Scheduling a patient appointment requires availability matching and reminders; scheduling an interview requires candidate/calendar coordination; scheduling a hotel room requires occupancy management. |
| **Skills** | Healthcare `healthcare_records_scheduling_ops`, HR `candidate-screening` (schedule-interview), Event `event-day-of-operations`, Restaurant (reservation skills), Hotel (reservations), Product `product-calendar` |
| **Decision** | **Retain as separate.** Each scheduling skill operates on a different object with different constraint sets and different downstream effects. |
| **Registry implication** | No merge. Each skill's configSchema and inputSchema are domain-specific. |

### DEC-008: Marketing Content and Channel Execution Skills

| Dimension | Value |
|---|---|
| **User outcome** | Create, distribute, and manage marketing content across channels |
| **Object** | Varies: CMS content (Marketing-CMS), social posts (Marketing-Social), email campaigns (Marketing-Email), SEO (Marketing-SEO), documents (Marketing-Document) |
| **Decision boundary** | The channel and content type. A social post, an email campaign, a CMS article, and an SEO audit are different user actions with different confirmation flows and success metrics. |
| **Skills** | Marketing `marketing-content-generation`, `marketing-social-media`, `marketing-email`, `marketing-seo`, `marketing-document-management` |
| **Decision** | **Retain as separate but review for hierarchy.** These are all marketing execution skills but serve different channels with different UX flows. Consider: the marketing assistant should present channel selection as a sub-step rather than equal-weight tools, per usability recommendation "Frontend presents hierarchy rather than every tool with equal weight." |
| **Registry implication** | No merge at the skill level. Frontend hierarchy change: channel selection should be a selector, not a flat list. |

### DEC-009: Creative Content Generation (Songwriting vs Scriptwriting)

| Dimension | Value |
|---|---|
| **User outcome** | Create creative content in a specific medium |
| **Object** | Varies: songs/lyrics (Songwriting), scripts/scenes (Scriptwriting) |
| **Decision boundary** | The creative medium and its structural rules. Songwriting follows musical meter, rhyme, and chord structures; scriptwriting follows scene formatting, dialogue, and narrative arc. |
| **Skills** | Songwriting (`lyric-evaluator`, `musical-co-creation`, `genre-positioning`); Scriptwriting (`narrative-evaluator`, `scene-beat-co-pilot`, `genre-positioning`) |
| **Decision** | **Retain as separate but document shared creative-brief pattern.** Per `docs/assistants design 0915-3.md` line 22 and the usability doc section 3 (Creative Assistant), these should share a creative brief pattern (goal, audience, tone, format, references) while diverging in medium-specific execution. |
| **Registry implication** | Both have "Genre & Market Positioning Evaluator" — this is a genuine semantic overlap in name and likely capability. **Decision: differentiate.** Songwriter's version evaluates market fit for music; Scriptwriter's evaluates market fit for screen/media. Rename to avoid confusion. |

### DEC-010: Sports Performance vs Wagering Capabilities

| Dimension | Value |
|---|---|
| **User outcome** | Sports: understand performance and strategy. Wagering: understand risk and betting opportunity. |
| **Object** | Performance: player/team stats, game film (Group A). Wagering: odds, bankroll, line movement (Group B). |
| **Decision boundary** | User intent and risk profile. Performance analysis is for coaching/staff decision-making. Wagering is for individual entertainment with financial risk. The `docs/ASSISTANT_USABILITY_RECOMMENDATIONS.md` explicitly requires hard visual separation. |
| **Skills** | Sports tactical/roster/s scouting/scouting/alert (Group A); odds/bankroll/line-alert (Group B) |
| **Decision** | **Retain as separate with enforced isolation.** No shared state, no shared data stores, no cross-group handoffs. |
| **Registry implication** | Ensure `ASSISTANT_OBJECT_MAP` and `ASSISTANT_FLOW_MAP` maintain the dual-group structure. Registry should flag any cross-group skill reference as a violation. |

## Overlaps Found but Evaluated as Benign

These overlaps appear in `getOverlappingSkills()` (duplicate IDs across assistants) but represent intentional shared infrastructure patterns rather than duplicate user value:

| Skill ID pattern | Appears in | Resolution |
|---|---|---|
| Internal tool IDs referenced in `lowerOrderTools` | Multiple assistants | These are implementation references, not user-facing duplicates. The registry's `getOverlappingSkills()` may flag these; they are expected and should be filtered from semantic overlap reporting. |
| `plan` as a workflow stage name | CTO, Marketing, Product, Education, etc. | Benign stage name overlap per `workflow-governance.test.ts` benign list. |
| `analyze` as a workflow stage name | Marketing, Product, Finance, Analytics, etc. | Benign stage name overlap. |
| `review` as a workflow stage name | CTO, Healthcare, Legal, Executive, etc. | Benign stage name overlap. |
| `create` as a workflow stage name | Marketing, Content, Product, etc. | Benign stage name overlap. |
| `publish` as a workflow stage name | Marketing, Content, Restaurant, etc. | Benign stage name overlap. |
| `draft` as a workflow stage name | Content, Scriptwriting, etc. | Benign stage name overlap. |
| `report` as a workflow stage name | Analytics, HR, etc. | Benign stage name overlap. |
| `decision` as a workflow stage name | HR, Executive, etc. | Benign stage name overlap. |
| `research` as a workflow stage name | Multiple assistants | Benign stage name overlap. |
| `intake` as a workflow stage name | Legal, Support | Benign stage name overlap. |
| `trade` as a workflow stage name | Investment, Finance | Benign stage name overlap. |

## Semantically Overlapping Capabilities Requiring No Action (Already Differentiated)

These capabilities have no duplicate IDs but share similar naming or purpose. They are already differentiated by object, context, or output:

| Capability A (Assistant) | Capability B (Assistant) | Differentiating Factor | Decision |
|---|---|---|---|
| `cto-architecture-advisory` (CTO) | `cto-architecture-tech-debt-evaluator` (CTO) | One is raw advisory reasoning; the other scores and prioritizes systems. Both in CTO, different user outcomes. | Retain both. |
| `healthcare_clinical_decision_support` (Healthcare) | `healthcare-clinical-decision-support-evaluator` (Healthcare) | One is the operational tool; the other is the higher-order evaluator wrapper. Different classification levels. | Retain both. |
| `marketing-content-generation` (Marketing) | `contentSkills` (Content assistant) | Marketing creates/distributes; Content assistant plans/edits/publishes. Different assistant context. | Retain both. |
| `product-jira` (Product) | `cto-engineering-actions` (CTO) | Different system (Jira for backlog vs GitHub/PagerDuty for engineering ops). Different user outcome. | Retain both. |
| `product-confluence` (Product) | `marketing-document-management` (Marketing) | Different document type (product docs vs marketing assets). Different user context. | Retain both. |
| `analytics-warehouse-query` (Analytics) | `healthcare_operational_analytics` (Healthcare) | Different data domain (business metrics vs patient ops). Different user expertise. | Retain both. |

## Decision Encoding Path

This document's decisions are encoded into:

1. **Registry**: `services/tool-executor/src/data/skills/registry.ts` — `getOverlappingSkills()` continues to report ID overlaps; semantic disposition is documented here and informs whether reported overlaps should trigger refactoring actions.
2. **Tests**: `services/tool-executor/src/__tests__/schema-validation.test.ts` — validates that duplicate IDs are reported (structural). Semantic decisions here inform whether tests should be added for cross-assistant differentiation.
3. **ADK refactoring (Sprint 8)** — DEC-001 and DEC-006 inform that shared primitives (report-builder, evaluator-wrapper) should be parameterized by domain, not merged.
4. **Frontend hierarchy (Sprint 5-6)** — DEC-008 informs that marketing channels should be presented as hierarchical selection, not flat tools.
5. **Sports isolation (DEC-010)** — Registry should enforce no cross-group state sharing; verify via governance tests.

## Maintenance Decision

This document is maintained as a product decision record. It will be updated when:

- New assistants are added to the registry
- New semantic overlaps are discovered through user research or behavioral testing
- A decision in this document is encoded into the registry or tests (at which point the specific decision row transitions from "decision needed" to "encoded")
- The ADK refactoring changes the abstraction level of shared primitives

When all decisions are encoded into the registry and tests, this document transitions from active decision record to historical reference and may be archived under `docs/archive/`.
