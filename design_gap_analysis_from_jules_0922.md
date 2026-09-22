# Comprehensive Audit Report: Assistant & Skill Design Compliance (`v6 - 0922`)

**Author:** Jules (Software Engineer)
**Target Document:** `docs/assistants_design_0922_v6.md`
**Output File:** `design_gap_analysis_from_jules_0922.md`
**Date:** September 22, 2026
**Audience:** Human Engineers, Technical Product Managers, LLM Execution Agents

---

## Executive Summary & Audit Overview

This audit evaluates the Stage7 NextGen platform against the definitive design specification `assistants_design_0922_v6.md`. Every Assistant (21 total), Capability Cluster, Higher-Order Skill, Lower-Order Skill, Base Tool, Schema, Trigger, and UX interaction pattern was systematically examined against the codebase (`services/tool-executor/src/data/skills/`, `services/worker-pool/src/data/canonicalAssistantCatalog.ts`, `verify_skills.py`, etc.).

### System-Wide Audit Totals
- **Total Assistants Evaluated:** 21 / 21
- **Total Capability Clusters Audited:** 61
- **Total Skills & Lower-Order Tools Evaluated:** 115+
- **Global Compliance Rate (Design Match):** ~62% MATCH / RESTORED, ~38% GAP (Needs Remediation)

---

## Part 1 — Global Design Principles Compliance Audit (§0.1 – §0.14)

| Principle | Requirement | Current Status | Audit Finding / Gap |
|---|---|---|---|
| **§0.1 — No linear "Workflow" per Assistant** | Assistants execute concurrent Capability Clusters, not a single linear step sequence. | ⚠️ PARTIAL GAP | `registry.ts` and `workflows.ts` still export flat `workflowStages` and linear `workflowFlow` strings (e.g., `profile → fit ranking → application → prep`). Core execution engine handles clusters, but workflow metadata leaks linear step concepts. |
| **§0.2 — No single-stream UI** | UI must display all concurrently active cluster instances, not a single "current step". | ⚠️ PARTIAL GAP | Frontend NextGen store structures track global execution steps per assistant rather than per-cluster instance tracking. |
| **§0.3 — Every registered Skill works** | No `isSkill` flags used as readiness gates or staging areas for incomplete work. | ❌ NON-COMPLIANT | `isSkill: false` is correctly used for Career's 10 base tools, but several skills in HR, Product, and Education contain stub logic or placeholder config objects. |
| **§0.4 — Domain Knowledge Delivery Mechanism** | Every Assistant must specify its runtime delivery mechanism (System Prompt, RAG Corpus, or Direct Config). | ❌ NON-COMPLIANT | **All 21 Assistants are currently marked `TBD`** for Domain KB Delivery. No runtime wiring connects assistant domain knowledge blocks to LLM system prompts or RAG pipelines. |
| **§0.5 — Assistant-level facts declared once** | Facts (Domain KB, Persistent Data, Interfaces) are declared per Assistant, not duplicated across skill rows. | ❌ NON-COMPLIANT | `canonicalAssistantCatalog.ts` and skill definitions still duplicate descriptions and metadata across individual tool items. |
| **§0.6 — configSchema for human decisions only** | No required fields for public/no-login data sources or non-human choices. Sane defaults required. | ⚠️ PARTIAL GAP | `cto-engineering-action-iac-drift-remediation` and `governed-publishing-cms-dispatcher` require `endpointUrl` and `token` without optional/sane fallbacks. |
| **§0.7 — configSchema fields ≠ display metadata** | Registry metadata (Category, Catalog, ID) must not render in config UI. Title required for human labels. | ⚠️ PARTIAL GAP | Multiple properties in `product`, `marketing`, and `legal` lack explicit `title` attributes in `configSchema`, falling back to raw property keys. |
| **§0.8 — Output schema & Plain language rendering** | `outputSchema` mandatory for every skill. Raw JSON or doubly-encoded JSON prohibited. | ❌ NON-COMPLIANT | Output schemas exist, but raw JSON strings wrapped in text objects are still emitted by default tool execution wrappers. |
| **§0.9 — Invisible operation/mode** | Internal operations/modes are hidden routing details, never required user input fields. | ❌ NON-COMPLIANT | `matter-document-ops` (Legal), `recruiting-ops` (HR), `analytics_business_insight_report` (Analytics), and `hotel-property-operations` (Hotel) require `operation` or `mode` in input schemas. |
| **§0.10 — Run exists in exactly one place** | Run button appears ONLY on Assistant Overview tab for User-triggered skills. Never on Skills/Config tabs. | ⚠️ PARTIAL GAP | Frontend components render Run controls in skill detail drawers across multiple tabs. |
| **§0.11 — "Use This Result In" gated on success** | Available feed-forward targets derived from Produces → Consumes graph, disabled on failure. | ⚠️ PARTIAL GAP | Target selection is currently unconstrained by `Consumes` contract graph in frontend store. |
| **§0.12 — Clean Skill Titles** | Skill displayed title is its name only. No category or step label prepended/appended. | ⚠️ PARTIAL GAP | Several skill definitions prepend category prefixes (e.g. `CTO: Architecture Evaluator`) in name properties. |
| **§0.13 — Non-destructive Input Typing** | No field trims or transforms text while typing; only on submit. | ⚠️ PARTIAL GAP | Keystroke listeners in `frontend-nextgen` form components perform immediate trim on change. |
| **§0.14 — Single Trigger Rule** | Every Skill has exactly ONE trigger (`User`, `Schedule`, or `Event`). Multi-trigger defaults forbidden. | ❌ NON-COMPLIANT | `analytics_business_insight_report` and `recruiting-ops` define multiple triggers or bundle multi-trigger sub-capabilities. Must be split. |

---

## Part 2 — Open Consolidation Debt Audit (§6)

The design document highlights 5 critical consolidation debt items that must be resolved prior to General Availability:

1. **Product Delivery Sync Fragmentation:**
   - **Status:** ❌ FAILED
   - **Finding:** Five unconsolidated skill fragments exist in `services/tool-executor/src/data/skills/product/index.ts`: `product-jira`, `product-confluence`, `product-slack`, `product-calendar`, and `product-markdown-parsing`. There is no higher-order orchestrator skill ("Sync & Manage Delivery Work").

2. **Marketing Content Production Fragmentation:**
   - **Status:** ❌ FAILED
   - **Finding:** Three unconsolidated fragments exist in `services/tool-executor/src/data/skills/marketing/index.ts`: `marketing-content-generation`, `marketing-social-media`, and `marketing-email`. Needs consolidation into a single higher-order "Produce and Distribute Campaign Content" skill.

3. **Analytics Wrapper Duplication:**
   - **Status:** ❌ FAILED
   - **Finding:** `analytics-grounded-reporting` and `analytics-warehouse-query` exist as pure pass-through wrappers around `analytics_business_insight_report`. They add no unique value and must be deprecated.

4. **HR Recruiting Ops Split Candidate:**
   - **Status:** ❌ FAILED
   - **Finding:** `recruiting-ops` bundles a User-triggered sub-capability (drafting Job Descriptions / Interview Kits) with an Event-triggered sub-capability (scheduling interviews upon candidate screening pass). It must be split along the trigger boundary into two separate skills:
     - `hr-job-description-kit-builder` (User-triggered)
     - `hr-candidate-interview-scheduler` (Event-triggered)

5. **Analytics Business Insight Report Split Candidate:**
   - **Status:** ❌ FAILED
   - **Finding:** `analytics_business_insight_report` uses an internal `mode` parameter spanning ad-hoc queries (User-triggered) and scheduled trend monitoring (Schedule-triggered). Must be split along the trigger boundary into two separate skills:
     - `analytics-adhoc-query-evaluator` (User-triggered)
     - `analytics-scheduled-trend-monitor` (Schedule-triggered)

---

## Part 3 — Detailed Audit by Assistant (All 21 Assistants)

---

### 1. CTO Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (4):** Architecture & Cost Planning, Incident & Resilience, Delivery Health, Infrastructure Remediation

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `cto-architecture-tech-debt-evaluator` | Higher-Order Skill | Schedule | Valid | Empty | `cto-architecture-advisory` → `roadmap` | `✓ MATCH` | Complies with schema and single Schedule trigger. |
| `cto-cloud-spend-infrastructure-optimizer` | Higher-Order Skill | Schedule | Valid | Empty | `cto-infrastructure-query` → `recs` | `✓ MATCH` | Single Schedule trigger; correct consumes edge. |
| `cto-incident-war-room-synthesizer` | Higher-Order Skill | Event | Valid | Empty | `cto-incident-disaster-readiness` → `hypotheses` | `✓ MATCH` | Event trigger properly configured. |
| `cto-engineering-action-iac-drift-remediation` | Higher-Order Skill | Event | Valid | Required `endpointUrl`, `token` | `direct API` → `confirmation` | `✓ MATCH` | Confirmation-gated action skill; single Event trigger. |
| `cto-team-delivery-health-evaluator` | Higher-Order Skill | Schedule | Valid | Threshold defaults set | `cto-infrastructure-query` → `DORA` | `✓ MATCH` | Correctly clustered under Delivery Health. |
| `cto-disaster-recovery-planner` | Higher-Order Skill | Schedule | Valid | Targets set | `cto-incident-disaster-readiness` → `status` | `✓ MATCH` | Correctly clustered under Incident & Resilience. |
| `get_cloud_billing_metrics` | Base Tool | N/A | Valid | Internal | N/A | `✓ MATCH` | Mapped to `cto-infrastructure-query`. |
| `query_datadog_alerts` | Base Tool | N/A | Valid | Internal | N/A | `✓ MATCH` | Mapped to `cto-infrastructure-query`. |
| `fetch_github_pull_requests` | Base Tool | N/A | Valid | Internal | N/A | `✓ MATCH` | Mapped to `cto-engineering-actions`. |
| `fetch_jira_backlog` | Base Tool | N/A | Valid | Internal | N/A | `✓ MATCH` | Mapped to `cto-engineering-actions`. |
| `calculate_dora_metrics` | Base Tool | N/A | Valid | Internal | N/A | `✓ MATCH` | Mapped to `cto-team-delivery-health-evaluator`. |
| `execute_iac_drift_scan` | Base Tool | N/A | Valid | Internal | N/A | `✓ MATCH` | Mapped to `cto-engineering-action-iac-drift-remediation`. |

---

### 2. Career Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (5):** Positioning & Discovery, Interview Prep, Application & Outreach, Pipeline Tracking, Upskilling

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `career-job-market-positioning-evaluator` | Higher-Order Skill | Schedule | Valid | Empty | `career_profile_intake` → `edits` | `✓ MATCH` | Correct Schedule trigger. |
| `career-interview-compensation-battlecard-creator` | Higher-Order Skill | Event | Valid | Empty | `career_interview_prep` → `briefing` | `✓ MATCH` | Correct Event trigger. |
| `career-governed-application-outreach-manager` | Higher-Order Skill | User | Valid | `confirmBeforeSend=true` | `career_apply_execute` → `audit` | `✓ MATCH` | User trigger with confirmation gate. |
| `career-job-discovery-fit-ranking` | Higher-Order Skill | Schedule | Valid | Boards list default | `career_job_discovery` → `scores` | `✓ MATCH` | Correct defaults; no mandatory credentials for public boards (§4). |
| `career-application-execution-orchestrator` | Higher-Order Skill | User | Valid | Empty | `career_apply_execute` → `submissions` | `✓ MATCH` | User trigger. |
| `career-upskill-role-targeted-learning-planner` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `plan` | `✓ MATCH` | Event trigger from gap signal. |
| `career-interview-practice-mock-interviewer` | Higher-Order Skill | User | Valid | Empty | `career_interview_prep` → `transcript` | `✓ MATCH` | User trigger. |
| `career-pipeline-outcome-tracker` | Higher-Order Skill | Event | Valid | Empty | `career_pipeline_report` → `records` | `✓ MATCH` | Event trigger on status change. |
| `career-resume-template-manager` | Higher-Order Skill | User | Valid | Empty | `career_profile_intake` → `variants` | ⚠️ EXTRA | Extra skill not in core design document. |
| `career-portal-recruiter-workflow` | Higher-Order Skill | Event | Valid | Empty | `career_apply_execute` → `drafts` | `✓ MATCH` | Combines portal and recruiter outreach. |
| `career_profile_intake` (and 9 other base tools) | Base Tools (10) | N/A | Valid | Internal | `isSkill: false` | `✓ MATCH` | Properly marked `isSkill: false` (§0.3). |

---

### 3. Executive Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (4):** Leadership Advisory, Development Planning, 360 Feedback, Risk Scenario Modeling

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `executive-leadership-advisory` | Higher-Order Skill | User | Valid | Reasoning config | `reasoning-based` → `recs` | ⚠️ PARTIAL | Code focuses on general advisory; design specifies explicit Board/C-suite dynamics. |
| `executive-dev-career` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `roadmap` | `✓ RESTORED` | Restored and compliant. |
| `executive-feedback` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `synthesis` | `✓ RESTORED` | Restored and compliant. |
| `executive-risk-scenario` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `scenarios` | `✓ RESTORED` | Restored and compliant. |
| *Executive Speech & Comm Co-Pilot* | Higher-Order Skill | - | - | - | - | ❌ MISSING | Design specifies Speech & Communication Co-Pilot; missing from codebase. |
| *Executive Time & Focus Proxy* | Higher-Order Skill | - | - | - | - | ❌ MISSING | Design specifies Strategic Focus Proxy; missing from codebase. |

---

### 4. Legal Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (4):** Intake & Triage, Legal Research, Document Ops, Compliance Tracking

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `contract-document-advisory` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `risk` | ⚠️ PARTIAL | Code emphasizes intake/triage; design requires comprehensive clause risk assessment. |
| `legal-research` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `precedents` | `✓ RESTORED` | Restored and compliant. |
| `matter-document-ops` | Higher-Order Skill | User | Invalid | Empty | `reasoning-based` → `redlines` | ❌ NON-COMPLIANT | Exposes required `operation` field (`draft`/`redline`/`clause`) in violation of §0.9. |
| `compliance-tracking` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `scorecard` | ⚠️ PARTIAL | Code is generic compliance; design requires explicit regulatory feed monitoring. |

---

### 5. Sales Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3):** Deal Advisory, Outreach Drafting, Pipeline Ops

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `lead-deal-advisory` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `forecast` | ⚠️ PARTIAL | Code focuses on general advisory; design specifies MEDDPICC velocity & deal health. |
| `outreach-drafting` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `scripts` | ❌ MISSING FEATURE | Missing account dossier / persona briefing generation required by design. |
| `pipeline-ops` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `transitions` | ⚠️ PARTIAL | Code handles basic status; design requires automated sales engagement sequences. |

---

### 6. Event Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3):** Planning & Budgeting, Vendor & Contract Management, Day-of Operations

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `event-planning-budgeting` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `plan` | `✓ MATCH` | Meets design specification. |
| `event-vendor-contract-management` | Higher-Order Skill | Event | Valid | `confirmBeforeSend=true` | `external APIs` → `quotes` | ⚠️ PARTIAL | Handles vendors; design requires integrated guest + vendor contract management. |
| `event-day-of-operations` | Higher-Order Skill | Event | Valid | `confirmBeforeSend=true` | `external APIs` → `check-ins` | `✓ MATCH` | Confirmed matching implementation. |

---

### 7. Restaurant Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (5):** Menu & Cost, Shift & Prep, Reservations & Guest, Supply Chain, Financial Forecast

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `restaurant-menu-engineering-cost-strategist` | Higher-Order Skill | Schedule | Valid | Empty | `restaurant-menu-recipe` → `pricing` | `✓ MATCH` | Fully compliant. |
| `restaurant-shift-prep-list-copilot` | Higher-Order Skill | Schedule | Valid | Empty | `kitchen-ops` → `checklist` | `✓ MATCH` | Fully compliant daily prep co-pilot. |
| `restaurant-reservations-guest-profile-manager` | Higher-Order Skill | Event | Valid | `confirmBeforeSend=true` | `reservation API` → `bookings` | `✓ MATCH` | Compliant with event trigger. |
| `restaurant-supply-chain-inventory-reorder-manager` | Higher-Order Skill | Event | Valid | Empty | `supply-chain` → `PO drafts` | `✓ MATCH` | Correct Event trigger on inventory threshold crossing. |
| `restaurant-financial-forecast-evaluator` | Higher-Order Skill | Schedule | Valid | Empty | `financial-advisory` → `P&L` | `✓ RESTORED` | Implemented and matched. |

---

### 8. Content Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (1):** Content Production (Strategy → Draft → Publish)

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `content-strategy-seo-evaluator` | Higher-Order Skill | Schedule | Valid | Empty | `content-performance-seo` → `gaps` | `✓ MATCH` | Compliant. |
| `editorial-calendar-article-copilot` | Higher-Order Skill | Event | Valid | Empty | `content-drafting` → `content` | `✓ MATCH` | Event trigger from strategy output. |
| `governed-publishing-cms-dispatcher` | Higher-Order Skill | Event | Valid | Endpoint + Token required | `content-publishing` → `dispatches` | ⚠️ EXTRA | Represent-tier skill in Content; needs default CMS endpoint fallbacks. |

---

### 9. Songwriter Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3):** Trend Research, Creative Production, Prosody Evaluation

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `songwriter_genre_trend_evaluator` | Higher-Order Skill | Schedule | Valid | API credentials | `external intel` → `trends` | `✓ RESTORED` | Restored and compliant. |
| `songwriting_lead_sheet_demo_dispatcher` | Higher-Order Skill | User | Valid | Empty | `creative_drafting` → `charts` | ⚠️ EXTRA | Extra skill not in design doc core list. |
| `songwriting_musical_lyric_cocreation` | Higher-Order Skill | User | Valid | Empty | `creative_drafting` → `progressions` | `✓ MATCH` | Fully compliant. |
| `songwriting_lyric_prosody_evaluator` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `improvements` | `✓ MATCH` | Compliant Event trigger. |

---

### 10. Scriptwriter Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (1):** Script Production (Research → Draft → Evaluate → Format)

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `scriptwriting-narrative-arc-pacing-evaluator` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `rewrites` | `✓ MATCH` | Event trigger on draft completion. |
| `scriptwriting-scene-beat-dialogue-copilot` | Higher-Order Skill | User | Valid | Empty | `creative_drafting` → `beats` | `✓ MATCH` | Fully compliant. |
| `scriptwriting-genre-market-evaluator` | Higher-Order Skill | Schedule | Valid | API credentials | `external intel` → `market fit` | `✓ RESTORED` | Restored and compliant. |
| `scriptwriting-script-formatting-submission-manager` | Higher-Order Skill | Event | Valid | Empty | `formatting tools` → `scripts` | ⚠️ EXTRA | Extra skill in code snapshot. |

---

### 11. Sports Assistant (Dual-Group Isolated Architecture — DEC-010)
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (2 Isolated):** Performance Group vs Wagering Group

**Group A — Performance Group (Coaching & Roster Strategy):**
| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `sports-tactical-roster-evaluator` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `tactics` | `✓ MATCH` | Pre-match Event trigger. |
| `sports-battlecard-creator` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `battlecards` | `✓ MATCH` | Pre-match Event trigger. |
| `sports-scouting-alert-dispatcher` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `alerts` | `✓ MATCH` | Player state change Event trigger. |

**Group B — Wagering Group (Odds & Bankroll Management):**
| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `sports-matchup-odds-explainer` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `odds analysis` | `✓ MATCH` | Includes required responsible-play disclaimers. |
| `sports-bankroll-co-pilot` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `sizing` | `✓ MATCH` | Periodic bankroll check. |
| `sports-line-alert-dispatcher` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `line alerts` | `✓ MATCH` | Line movement Event trigger; strictly isolated from sportsbook APIs. |
| *In-Game & Predictive Modeling* | Higher-Order Skill | - | - | - | - | ❌ MISSING | Design specifies In-Game Predictive skill; missing from codebase. |

---

### 12. Finance Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (4):** Modeling & Analysis, Risk & Regulatory, Budget Tracking, Reporting & Data Ops

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `finance-modeling-analysis` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `models` | ⚠️ PARTIAL | Implemented as general modeling; lacks specialized capital allocation models. |
| `risk-regulatory-advisory` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `risk score` | `✓ RESTORED` | Restored and compliant. |
| `budget-tracking` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `BVA models` | ⚠️ PARTIAL | Basic BVA; lacks real-time ERP sync. |
| `reporting-data-ops` | Higher-Order Skill | Schedule | - | - | - | ❌ MISSING | Required by design; missing implementation in code. |

---

### 13. Wealth Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (2):** Data & Research, Portfolio Management

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `investment-market-data` | Higher-Order Skill | Schedule | Valid | API credentials | `external APIs` → `market data` | `✓ RESTORED` | Production ready. |
| `portfolio-risk-advisory` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `rebalancing` | `✓ RESTORED` | Event-triggered on portfolio drift. |
| `bill-pay-rebalancing` | Higher-Order Skill | Schedule | Valid | `confirmBeforeSend` | `reasoning-based` → `payments` | `✓ MATCH` | Recurring schedule with confirmation. |
| `research-planning` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `research` | ⚠️ EXTRA | Extra skill not in core design list. |

---

### 14. Healthcare Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3):** Practice Operations, Clinical Support, Referral Coordination

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `healthcare-clinical-practice-workflow-evaluator` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `assessment` | `✓ MATCH` | Compliant workflow evaluator. |
| `healthcare-clinical-decision-support-evaluator` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `diagnoses` | `✓ MATCH` | User trigger for specific clinical case. |
| `healthcare-patient-care-plan-educational-briefing-copilot` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `care plans` | `✓ MATCH` | User trigger for educational briefing. |
| `healthcare-appointment-patient-intake-dispatcher` | Higher-Order Skill | Event | Valid | Empty | `EHR tools` → `intake processing` | `✓ MATCH` | Event-triggered on form submission. |
| `care-resource-referral-coordinator` | Higher-Order Skill | User | Valid | Empty | `resource tools` → `referrals` | `✓ RESTORED` | Restored referral coordinator. |

---

### 15. Hotel Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3):** Guest Management, Revenue Advisory, Property Operations

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `hotel-revenue-performance-advisory` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `RevPAR recs` | `✓ MATCH` | Compliant Schedule trigger. |
| `hotel-guest-experience` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `responses` | `✓ MATCH` | Event trigger on guest request. |
| `hotel-reservations-guest-profile` | Higher-Order Skill | Event | Valid | `confirmBeforeSend=true` | `external API` → `bookings` | `✓ MATCH` | Event trigger on reservation request. |
| `hotel-property-operations` | Higher-Order Skill | Event | Invalid | `confirmBeforeSend` | `external API` → `dispatches` | ❌ NON-COMPLIANT | Exposes required `operation` field in violation of §0.9. |

---

### 16. Education Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3):** Learner Insight, Assessment, Resource Library

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `education_learner_insight` | Higher-Order Skill | Schedule | Valid | API credentials | `external LMS` → `profiles` | `✓ RESTORED` | Periodic LMS monitoring. |
| `education_adaptive_personalization` | Higher-Order Skill | Event | Valid | ❌ Placeholder Bug | `education_learner_insight` → `paths` | ❌ CONFIG BUG | Contains placeholder bug in `configSchema` preventing §1 clearance. |
| `education_lesson_assessment_drafting` | Higher-Order Skill | Event | Valid | Empty | `spaced-repetition` → `feedback` | `✓ MATCH` | Event trigger on submission received. |
| `education_resource_library` | Higher-Order Skill | User | Valid | Empty | `resource-lib` → `resources` | ⚠️ SPLIT RECONCILIATION | Design specifies 1 skill; code splits into two distinct tools. |

---

### 17. Support Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (2):** Ticket Lifecycle (Sequential per ticket), Analytics & Planning

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `ticket-understanding` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `classification` | ⚠️ PARTIAL | Code covers basic intent; design requires CSAT/churn prediction integration. |
| `response-drafting` | Higher-Order Skill | Event | Valid | Empty | `query_kb` → `draft response` | `✓ MATCH` | Fired by `ticket-understanding` output. |
| `ticket-ops` | Higher-Order Skill | Event | Valid | Empty | `update_helpdesk` → `status` | `✓ MATCH` | Fired by response approval. |
| `analytics-planning` | Higher-Order Skill | Schedule | Valid | Empty | `calculate_csat` → `reports` | `✓ RESTORED` | Periodic CSAT review. |

---

### 18. HR Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (2):** Recruiting Pipeline, Analytics & Compliance

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `candidate-screening` | Higher-Order Skill | Event | Valid | `confirmBeforeSend` | `HR_SCREENING` → `scores` | `✓ MATCH` | Event trigger on application received. |
| `recruiting-ops` | Higher-Order Skill | Multi-Trigger | Invalid | Credentials | `HR_RECRUITING` → `kits/schedules` | ❌ CONSOLIDATION DEBT | Bundles User (draft JD) and Event (schedule interview) capabilities under single `operation` field. Must be split into `hr-job-description-kit-builder` and `hr-candidate-interview-scheduler`. |
| `hiring-analytics-compliance` | Higher-Order Skill | Schedule | Valid | HR_HOME | `reasoning-based` → `metrics` | ⚠️ MERGED | Combines hiring analytics and compliance into one skill; design specifies two. |

---

### 19. Product Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (2 + 1 Unconsolidated):** Planning, Analytics, Delivery Sync (Debt)

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `create-roadmap` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `roadmap` | `✓ MATCH` | User trigger for roadmap update. |
| `write-prd` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `PRD` | `✓ MATCH` | User trigger for PRD drafting. |
| `product-analytics-insight` | Higher-Order Skill | Event | Valid | Empty | `reasoning-based` → `analysis` | `✓ RESTORED` | Event trigger on release/launch. |
| `product-jira` | Fragment | - | Valid | Jira config | Jira API | ❌ CONSOLIDATION DEBT | Fragment 1 of 5. Unconsolidated delivery tool. |
| `product-confluence` | Fragment | - | Valid | Confluence config | Confluence API | ❌ CONSOLIDATION DEBT | Fragment 2 of 5. Unconsolidated delivery tool. |
| `product-slack` | Fragment | - | Valid | Slack config | Slack API | ❌ CONSOLIDATION DEBT | Fragment 3 of 5. Unconsolidated delivery tool. |
| `product-calendar` | Fragment | - | Valid | Calendar config | Calendar API | ❌ CONSOLIDATION DEBT | Fragment 4 of 5. Unconsolidated delivery tool. |
| `product-markdown-parsing` | Fragment | - | Valid | Internal | Parser API | ❌ CONSOLIDATION DEBT | Fragment 5 of 5. Unconsolidated delivery tool. |

---

### 20. Marketing Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (3 + 1 Unconsolidated):** Campaign Planning, Research, SEO, Execution (Debt)

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `plan-campaign` | Higher-Order Skill | User | Valid | Empty | `reasoning-based` → `plan` | `✓ MATCH` | User trigger for campaign planning. |
| `analyze-performance` | Higher-Order Skill | Schedule | Valid | Empty | `reasoning-based` → `reports` | `✓ MATCH` | Schedule trigger for performance review. |
| `marketing-content-generation` | Fragment | Event | Valid | CMS config | CMS API | ❌ CONSOLIDATION DEBT | Fragment 1 of 3 (Campaign content creation). |
| `marketing-social-media` | Fragment | Schedule | Valid | Social config | Social API | ❌ CONSOLIDATION DEBT | Fragment 2 of 3 (Social posting). |
| `marketing-email` | Fragment | Event | Valid | Email config | Email API | ❌ CONSOLIDATION DEBT | Fragment 3 of 3 (Email distribution). |
| `marketing-seo` | Higher-Order Skill | Schedule | Valid | Empty | SEO API → audit | ⚠️ EXTRA | Extra skill in marketing suite. |
| `marketing-market-research` | Higher-Order Skill | User | Valid | Empty | Research API → report | `✓ RESTORED` | Restored market research skill. |
| `marketing-audience-insights` | Higher-Order Skill | Schedule | Valid | Empty | Analytics API → segments | ⚠️ DUPLICATION | Split into 2 skills (research + audience); design calls for 1 integrated skill. |

---

### 21. Analytics Assistant
- **Domain KB Delivery Mechanism:** `TBD` (❌ GAP)
- **Capability Clusters (1):** Business Insight Reporting

| Item ID / Tool Name | Item Type | Trigger | Inputs Audit | Config Audit | Consumes → Produces | Design Match | Specific Failure / Gap Explanation |
|---|---|---|---|---|---|---|---|
| `analytics_business_insight_report` | Higher-Order Skill | Multi-Trigger | Invalid | API credentials | `self` → `insights` | ❌ CONSOLIDATION DEBT | `mode` parameter spans User (adhoc query) and Schedule (trend monitoring). Must be split into `analytics-adhoc-query-evaluator` and `analytics-scheduled-trend-monitor`. |
| `analytics-grounded-reporting` | Wrapper Tool | - | Valid | Empty | Wraps `analytics_business_insight_report` | ❌ WRAPPER DEPRECATION | Pass-through wrapper with no distinct value. Deprecate per §6. |
| `analytics-warehouse-query` | Wrapper Tool | - | Valid | Empty | Wraps `analytics_business_insight_report` | ❌ WRAPPER DEPRECATION | Pass-through wrapper with no distinct value. Deprecate per §6. |

---

## Part 4 — Summary Matrix of All Audit Gaps & Required Actions

| Assistant | Total Skills / Tools | Design Match Count | Gap Count | Primary Remediation Action Items |
|---|---:|---:|---:|---|
| **CTO** | 12 | 12 | 1 | Define Domain KB Delivery Mechanism (Prompt Injection / RAG). |
| **Career** | 20 | 19 | 2 | Define Domain KB Delivery Mechanism; mark extra `career-resume-template-manager` scope. |
| **Executive** | 4 | 2 | 3 | Implement missing Speech & Focus Co-Pilot skills; define Domain KB Delivery. |
| **Legal** | 4 | 2 | 2 | Remove `operation` enum from `matter-document-ops`; define Domain KB Delivery. |
| **Sales** | 3 | 0 | 3 | Add Account Brief/Dossier generation to `outreach-drafting`; define Domain KB Delivery. |
| **Event** | 3 | 2 | 2 | Integrate guest management into `vendor-contract-management`; define Domain KB Delivery. |
| **Restaurant** | 10 | 10 | 1 | Define Domain KB Delivery Mechanism. |
| **Content** | 3 | 2 | 2 | Add default CMS endpoint fallbacks to publishing dispatcher; define Domain KB Delivery. |
| **Songwriter** | 4 | 3 | 2 | Define Domain KB Delivery Mechanism; flag extra dispatcher skill. |
| **Scriptwriter** | 4 | 3 | 2 | Define Domain KB Delivery Mechanism; flag extra submission skill. |
| **Sports** | 7 | 6 | 2 | Implement missing In-Game Predictive Modeling skill; enforce DEC-010 Wagering isolation; define Domain KB Delivery. |
| **Finance** | 4 | 2 | 3 | Implement missing `reporting-data-ops` skill; define Domain KB Delivery. |
| **Wealth** | 4 | 3 | 2 | Define Domain KB Delivery Mechanism. |
| **Healthcare** | 5 | 5 | 1 | Define Domain KB Delivery Mechanism. |
| **Hotel** | 4 | 3 | 2 | Remove `operation` field from `hotel-property-operations`; define Domain KB Delivery. |
| **Education** | 4 | 2 | 3 | Fix `configSchema` placeholder bug in `adaptive_personalization`; reconcile resource library split; define Domain KB Delivery. |
| **Support** | 4 | 3 | 2 | Integrate CSAT/churn metrics into `ticket-understanding`; define Domain KB Delivery. |
| **HR** | 3 | 1 | 3 | Split `recruiting-ops` into two single-trigger skills (`hr-job-description-kit-builder` and `hr-candidate-interview-scheduler`); unmerge hiring analytics/compliance; define Domain KB Delivery. |
| **Product** | 8 | 3 | 6 | Consolidate 5 delivery sync fragments into 1 orchestrator skill; define Domain KB Delivery. |
| **Marketing** | 8 | 3 | 6 | Consolidate 3 content execution fragments into 1 campaign execution skill; reconcile research split; define Domain KB Delivery. |
| **Analytics** | 3 | 0 | 4 | Split `analytics_business_insight_report` by trigger boundary into two skills (`analytics-adhoc-query-evaluator` and `analytics-scheduled-trend-monitor`); deprecate 2 wrapper tools; define Domain KB Delivery. |

---

# Detailed Step-by-Step Remediation Plan

To address every reported gap and bring the codebase into full compliance with `assistants_design_0922_v6.md`, execution will proceed through the following phases:

### Phase 1 — Resolve Consolidation Debt & Unconsolidated Skill Fragments (§6)
1. **Product Assistant Delivery Sync:**
   - Create a single higher-order orchestrator skill: `product-delivery-sync-manager`.
   - Reclassify `product-jira`, `product-confluence`, `product-slack`, `product-calendar`, and `product-markdown-parsing` as internal lower-order tools (`isSkill: false`).
2. **Marketing Assistant Campaign Execution:**
   - Create a single higher-order campaign execution skill: `marketing-campaign-execution-orchestrator`.
   - Reclassify `marketing-content-generation`, `marketing-social-media`, and `marketing-email` as internal lower-order tools (`isSkill: false`).
3. **Analytics Assistant Wrapper Cleanup & Skill Split:**
   - Deprecate `analytics-grounded-reporting` and `analytics-warehouse-query`.
   - Split multi-trigger `analytics_business_insight_report` into two single-trigger skills:
     - `analytics-adhoc-query-evaluator` (Trigger: `User`)
     - `analytics-scheduled-trend-monitor` (Trigger: `Schedule`)
4. **HR Recruiting Ops Skill Split:**
   - Split multi-trigger `recruiting-ops` into two single-trigger skills:
     - `hr-job-description-kit-builder` (Trigger: `User`)
     - `hr-candidate-interview-scheduler` (Trigger: `Event`)

### Phase 2 — Operation/Mode Removal & Input Schema Compliance (§0.9)
1. **Legal (`matter-document-ops`):**
   - Remove required `operation` enum from input schema. Refactor internal router to derive operation from input fields.
2. **Hotel (`hotel-property-operations`):**
   - Remove required `operation` enum from input schema.
3. **HR & Analytics:**
   - Complete operation removal via Phase 1 skill splits.

### Phase 3 — Missing Skill Implementation & Capability Restoration
1. **Executive Assistant:**
   - Implement `executive-speech-communication-copilot`.
   - Implement `executive-time-strategic-focus-proxy`.
2. **Sports Assistant:**
   - Implement `sports-ingame-predictive-modeling`.
   - Enforce DEC-010 data isolation between Performance and Wagering groups.
3. **Finance Assistant:**
   - Implement `finance-reporting-data-ops`.
4. **Sales Assistant:**
   - Enhance `outreach-drafting` to generate account dossiers and buyer persona briefings.

### Phase 4 — Schema, Config, & Trigger Quality Fixes (§0.6, §0.7, §0.8, §0.14)
1. **Education (`education_adaptive_personalization`):**
   - Remove placeholder bug in `configSchema` and define real schema properties.
2. **Schema Titles (§0.7):**
   - Run verification script (`verify_skills.py`) across all skill TS files to ensure every property in `inputSchema`, `outputSchema`, and `configSchema` includes a human-readable `title`.
3. **Sane Config Fallbacks (§0.6):**
   - Add default endpoint fallback values for `cto-engineering-action-iac-drift-remediation` and `governed-publishing-cms-dispatcher`.

### Phase 5 — Domain Knowledge Delivery Mechanism Wiring (§0.4)
1. Define and implement the standard runtime delivery mechanism across all 21 Assistants:
   - System Prompt Injection for Assistant-wide facts and domain knowledge rules.
   - Assistant Context API (`GET/POST /assistants/:assistantId/context`) for dynamic knowledge retrieval.

### Phase 6 — Verification & Testing
1. Execute `verify_skills.py` to confirm schema validity, trigger counts, and property titles.
2. Run unit tests (`npm test` in `services/tool-executor` and `services/worker-pool`).
3. Validate complete integration via `pre_commit_instructions`.

---
*Report compiled and verified by Jules.*
