# Assistant & Skill Design Specifications — v9 (ADK Architecture Standard)

This v9 specification updates all Assistant blueprints to align directly with the Assistant Development Kit (ADK) folder layout, JSON manifests, runtime context contracts, and the architecture defined in ADK_OVERVIEW.md (the source of truth).

---

## 1. ADK Architectural Standard & v8-to-v9 Upgrades

### 1.1 Key Upgrades in v9

1. **Directory Integrity:** Every Assistant is mapped to a isolated directory under `src/assistants/<assistant-id>/` containing its `assistant.json` manifest, system prompts, static knowledge files, higher-order skills (`isSkill: true`), and internal lower-order tools (`isSkill: false`).
2. **Unified Domain Knowledge:** Static domain knowledge lives in each Assistant's `knowledge/` folder and is listed in `domainKnowledgeFiles`. On deployment stage7 seeds it into the instance Vector Knowledge Store, which also holds dynamic learnings. There is no per-Assistant delivery mode.


3. **Enum Elimination:** Routing enums (`operation`, `mode`, `action`) are removed from input and config schemas. Distinct operations are implemented as single-purpose lower-order tools behind one higher-order Skill, which selects among them from the user's request. Skills are not split to avoid an enum.
4. **Risk-Driven Approval:** Every Skill declares exactly one tier (`advise`, `aid`, `represent`), and the tier alone drives approval. The runtime applies the mandatory `confirmBeforeSend` gate to every `represent` Skill regardless of trigger (user, schedule, or event). The gate is not declared per Skill or in the manifest and cannot be disabled. Lower-order tools carry no gate of their own: a `represent`-tier tool is reachable only through a gated `represent` higher-order Skill.


5. **Exact Skill vs. Tool Classification:** User-facing canonical entries (`isSkill: true`) are separated from internal deterministic execution steps (`isSkill: false`).



---
## 1. Career Assistant (`career`)

### 1.1 File System Structure

```text
src/assistants/career/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── resume-parsing-standards.md
│   ├── ats-optimization-rules.md
│   └── executive-comp-benchmarks.md
├── skills/
│   ├── market-positioning.ts      # career-job-market-positioning-evaluator (isSkill: true)
│   ├── job-discovery.ts           # career-job-discovery-fit-ranking (isSkill: true)
│   ├── template-manager.ts        # career-resume-template-manager (isSkill: true)
│   ├── battlecard-creator.ts      # career-interview-compensation-battlecard-creator (isSkill: true)
│   ├── mock-interviewer.ts        # career-interview-practice-mock-interviewer (isSkill: true)
│   ├── outreach-manager.ts        # career-governed-application-outreach-manager (isSkill: true)
│   ├── application-orchestrator.ts# career-application-execution-orchestrator (isSkill: true)
│   ├── recruiter-workflow.ts      # career-portal-recruiter-workflow (isSkill: true)
│   ├── outcome-tracker.ts         # career-pipeline-outcome-tracker (isSkill: true)
│   └── upskill-planner.ts         # career-upskill-role-targeted-learning-planner (isSkill: true)
├── tools/
│   ├── profile-intake.ts          # career_profile_intake (isSkill: false)
│   ├── job-ranker.ts              # career_rank (isSkill: false)
│   └── apply-executor.ts          # career_apply_execute (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 1.2 `assistant.json` Manifest

```json
{
  "id": "career",
  "name": "Career & Executive Search Assistant",
  "description": "Orchestrates job discovery, resume/cover letter template management, ATS optimization, automated portal outreach, interview coaching, and pipeline outcome tracking.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/resume-parsing-standards.md",
    "knowledge/ats-optimization-rules.md",
    "knowledge/executive-comp-benchmarks.md"
  ]
}

```

### 1.3 Capability Clusters & Skill/Tool Registry

* **Positioning & Discovery Cluster:** `career-job-market-positioning-evaluator`, `career-job-discovery-fit-ranking`

* **Template Library Cluster:** `career-resume-template-manager`

* **Interview Prep Cluster:** `career-interview-compensation-battlecard-creator`, `career-interview-practice-mock-interviewer`

* **Application & Outreach Cluster:** `career-governed-application-outreach-manager`, `career-application-execution-orchestrator`, `career-portal-recruiter-workflow`

* **Pipeline Tracking & Upskilling Cluster:** `career-pipeline-outcome-tracker`, `career-upskill-role-targeted-learning-planner`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `career-job-market-positioning-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly market audit

 | `resume`, `market` | empty | `career_job_discovery`, `career_rank`<br> | positioning recommendations & salary targets

 |
| `career-job-discovery-fit-ranking` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — daily sweep

 | `jobTitles` (array), `locations` (array), `minSalary` | `premiumJobBoards` (array), `freeJobBoards` (array)

 | `career_job_discovery`<br> | ranked job opportunities

 |
| `career-resume-template-manager` | Skill (`isSkill: true`) | `aid`<br> | **User** — template request

 | `templateId`, `content`, `tags` (array) | empty | local store | rendered template metadata

 |
| `career-interview-compensation-battlecard-creator` | Skill (`isSkill: true`) | `aid`<br> | **Event** — interview scheduled

 | `company`, `role`, `context` | empty | `career_interview_prep`<br> | interview briefing & negotiation script

 |
| `career-interview-practice-mock-interviewer` | Skill (`isSkill: true`) | `aid`<br> | **User** — practice requested

 | `role`, `company`, `battlecard` | empty | `career_interview_prep`<br> | interview transcript & coaching notes

 |
| `career-governed-application-outreach-manager` | Skill (`isSkill: true`) | `represent`<br> | **User** — outreach initiated

 | `applicationData`, `outreachData` | empty | `career_apply_execute`<br> | submission confirmations & audit log

 |
| `career-application-execution-orchestrator` | Skill (`isSkill: true`) | `represent`<br> | **User** — multi-apply submitted

 | `targetRoles` (array), `listings` (array) | empty | `career_apply_execute`<br> | portal application submissions

 |
| `career-portal-recruiter-workflow` | Skill (`isSkill: true`) | `represent`<br> | **Event** — recruiter message received

 | `targetCompany`, `targetPerson`, `relationshipStage` | empty | `career_networking_outreach`<br> | recruiter response dispatches

 |
| `career-pipeline-outcome-tracker` | Skill (`isSkill: true`) | `aid`<br> | **Event** — application status changed

 | `targetRole`, `company`, `status`, `offerDetails` | empty | `career_outcome`<br> | pipeline metrics & outcome logs

 |
| `career-upskill-role-targeted-learning-planner` | Skill (`isSkill: true`) | `advise`<br> | **Event** — skill gap identified

 | `gaps` (array), `targetRole` | empty | internal learning KB | targeted upskilling roadmap

 |
| `career_profile_intake` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `rawResumeText` | empty | internal parser | structured `resume.json` payload |
| `career_job_discovery` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `searchQuery` | `jobBoardApiKey` (secret) | job board APIs

 | raw job posting objects |
| `career_apply_execute` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `payload`, `credentials` | `portalEndpoint` (secret) | ATS APIs

 | raw HTTP submission response |

---

## 2. Executive Assistant (`executive`)

### 2.1 File System Structure

```text
src/assistants/executive/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── corporate-governance-standards.md
│   ├── executive-coaching-frameworks.md
│   └── board-communication-templates.md
├── skills/
│   ├── leadership-advisory.ts     # executive-leadership-advisory (isSkill: true)
│   ├── dev-career.ts              # executive-dev-career (isSkill: true)
│   ├── feedback-synthesizer.ts    # executive-feedback (isSkill: true)
│   ├── risk-scenario.ts          # executive-risk-scenario (isSkill: true)
│   ├── speech-copilot.ts          # executive-speech-communication-copilot (isSkill: true)
│   └── strategic-time-proxy.ts    # executive-strategic-time-proxy (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 2.2 `assistant.json` Manifest

```json
{
  "id": "executive",
  "name": "Executive & Leadership Advisory Assistant",
  "description": "Provides C-suite leadership coaching, synthesizes 360 feedback, models strategic risk scenarios, crafts executive communications, and optimizes strategic time allocation.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/corporate-governance-standards.md",
    "knowledge/executive-coaching-frameworks.md",
    "knowledge/board-communication-templates.md"
  ]
}

```

### 2.3 Capability Clusters & Skill/Tool Registry

* **Leadership Advisory Cluster:** `executive-leadership-advisory`

* **Development Planning Cluster:** `executive-dev-career`

* **360 Feedback Cluster:** `executive-feedback`

* **Risk Scenario Modeling Cluster:** `executive-risk-scenario`

* **Speech & Communication Cluster:** `executive-speech-communication-copilot`
* **Strategic Focus Cluster:** `executive-strategic-time-proxy`

| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `executive-leadership-advisory` | Skill (`isSkill: true`) | `advise`<br> | **User** — leadership guidance requested

 | `strategicContext`, `stakeholderData` | empty | internal reasoning | C-suite guidance & resolution options

 |
| `executive-dev-career` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly review

 | `developmentGoals` (array), `careerStage` | empty | internal reasoning | skill-gap analysis & executive roadmap

 |
| `executive-feedback` | Skill (`isSkill: true`) | `advise`<br> | **Event** — 360 feedback ingested

 | `feedbackData` (array), `stakeholderList` (array) | empty | internal reasoning | 360 feedback synthesis & action themes

 |
| `executive-risk-scenario` | Skill (`isSkill: true`) | `advise`<br> | **User** — scenario modeling requested

 | `scenarioParams`, `riskTolerance` | empty | internal reasoning | multi-scenario decision risk matrix

 |
| `executive-speech-communication-copilot` | Skill (`isSkill: true`) | `aid`<br> | **User** — executive speech draft requested | `audience`, `coreMessage`, `keynoteTheme` | empty | internal reasoning | executive speech script & pitch framework |
| `executive-strategic-time-proxy` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly calendar audit | `calendarExport`, `priorityMatrix` | empty | internal reasoning | strategic focus score & time reallocation recs |

---

## 3. Sales Assistant (`sales`)

### 3.1 File System Structure

```text
src/assistants/sales/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── meddpicc-framework.md
│   ├── icp-definitions.md
│   └── objection-handling-playbook.md
├── skills/
│   ├── deal-advisory.ts           # lead-deal-advisory (isSkill: true)
│   ├── outreach-drafting.ts       # outreach-drafting (isSkill: true)
│   ├── account-brief.ts           # sales-account-brief-generator (isSkill: true)
│   └── pipeline-ops.ts            # pipeline-ops (isSkill: true)
├── tools/
│   └── crm-sync.ts                # sales_crm_sync (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 3.2 `assistant.json` Manifest

```json
{
  "id": "sales",
  "name": "B2B Sales & Pipeline Intelligence Assistant",
  "description": "Evaluates deal health using MEDDPICC, generates account dossiers, drafts outbound outreach, and updates pipeline records.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/meddpicc-framework.md",
    "knowledge/icp-definitions.md",
    "knowledge/objection-handling-playbook.md"
  ]
}

```

### 3.3 Capability Clusters & Skill/Tool Registry

* **Deal Advisory Cluster:** `lead-deal-advisory`

* **Outreach & Account Intelligence Cluster:** `outreach-drafting`, `sales-account-brief-generator`

* **Pipeline Ops Cluster:** `pipeline-ops`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lead-deal-advisory` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — daily deal audit

 | `prospectData`, `criteria` | empty | `sales_crm_sync` | deal health score & stuck deal warnings

 |
| `outreach-drafting` | Skill (`isSkill: true`) | `aid`<br> | **User** — outreach request

 | `prospectInfo`, `messageType` | empty | internal sales KB | personalized email/LinkedIn outreach draft

 |
| `sales-account-brief-generator` | Skill (`isSkill: true`) | `aid`<br> | **User** — dossier request | `companyDomain`, `targetPersonas` (array) | empty | internal sales KB | full account brief & MEDDPICC dossier |
| `pipeline-ops` | Skill (`isSkill: true`) | `represent`<br> | **Event** — stage update triggered

 | `dealId`, `targetStage`, `notes` | empty | `sales_crm_sync` | updated CRM deal record & forecast adjustment

 |
| `sales_crm_sync` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `dealData`, `action` | `crmApiKey` (secret) | Salesforce/HubSpot API

 | raw CRM state payload |

---

## 4. Event Assistant (`event`)

### 4.1 File System Structure

```text
src/assistants/event/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── beo-specifications.md
│   ├── crowd-safety-standards.md
│   └── vendor-contract-clauses.md
├── skills/
│   ├── planning-budgeting.ts      # event-planning-budgeting (isSkill: true)
│   ├── vendor-management.ts       # event-vendor-contract-management (isSkill: true)
│   ├── checkin-guest.ts           # event-checkin-guest (isSkill: true)
│   ├── update-seating.ts          # event-update-seating (isSkill: true)
│   └── log-incident.ts            # event-log-incident (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 4.2 `assistant.json` Manifest

```json
{
  "id": "event",
  "name": "Event Logistics & Operations Assistant",
  "description": "Manages event budgeting, spatial seating layouts, vendor contracts, guest check-ins, and day-of operational incident logging.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/beo-specifications.md",
    "knowledge/crowd-safety-standards.md",
    "knowledge/vendor-contract-clauses.md"
  ]
}

```

### 4.3 Capability Clusters & Skill/Tool Registry

* **Planning & Budgeting Cluster:** `event-planning-budgeting`

* **Vendor & Contract Management Cluster:** `event-vendor-contract-management`

* **Day-of Operations Cluster:** `event-checkin-guest`, `event-update-seating`, `event-log-incident`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `event-planning-budgeting` | Skill (`isSkill: true`) | `advise`<br> | **User** — plan initiated

 | `venueSpecs`, `budgetData`, `guestCount` | empty | internal event rules | event budget breakdown & venue evaluation

 |
| `event-vendor-contract-management` | Skill (`isSkill: true`) | `represent`<br> | **Event** — vendor milestone reached

 | `vendorData`, `contractTerms` | empty | vendor portal APIs | vendor quotes, contracts & dispatched comms

 |
| `event-checkin-guest` | Skill (`isSkill: true`) | `represent`<br> | **Event** — QR scan / guest arrival | `guestId`, `ticketType` | empty | ticketing API

 | guest check-in confirmation & badge print command |
| `event-update-seating` | Skill (`isSkill: true`) | `represent`<br> | **User** — seating change requested | `guestId`, `targetTable` | empty | floorplan API | updated seating chart & table assignment |
| `event-log-incident` | Skill (`isSkill: true`) | `represent`<br> | **User** — incident reported | `incidentDetails`, `severity`, `location` | empty | ops log API | recorded day-of ops incident entry |

---

## 5. Restaurant Assistant (`restaurant`)

### 5.1 File System Structure

```text
src/assistants/restaurant/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── prime-cost-formulas.md
│   ├── food-safety-guidelines.md
│   └── kitchen-prep-standards.md
├── skills/
│   ├── menu-engineering.ts       # restaurant-menu-engineering-cost-strategist (isSkill: true)
│   ├── shift-prep.ts              # restaurant-shift-prep-list-copilot (isSkill: true)
│   ├── manage-reservation.ts      # restaurant-manage-reservation (isSkill: true)
│   ├── update-guest-profile.ts    # restaurant-update-guest-profile (isSkill: true)
│   ├── supply-chain.ts            # restaurant-supply-chain-inventory-reorder-manager (isSkill: true)
│   └── financial-forecast.ts      # restaurant-financial-forecast-evaluator (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 5.2 `assistant.json` Manifest

```json
{
  "id": "restaurant",
  "name": "Restaurant Operations & Foodservice Assistant",
  "description": "Optimizes menu margin engineering, generates shift prep checklists, manages reservations and guest profiles, drafts inventory POs, and projects P&L financial forecasts.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/prime-cost-formulas.md",
    "knowledge/food-safety-guidelines.md",
    "knowledge/kitchen-prep-standards.md"
  ]
}

```

### 5.3 Capability Clusters & Skill/Tool Registry

* **Menu & Cost Cluster:** `restaurant-menu-engineering-cost-strategist`

* **Shift & Prep Cluster:** `restaurant-shift-prep-list-copilot`

* **Reservations & Guest Cluster:** `restaurant-manage-reservation`, `restaurant-update-guest-profile`

* **Supply Chain Cluster:** `restaurant-supply-chain-inventory-reorder-manager`

* **Financial Forecast Cluster:** `restaurant-financial-forecast-evaluator`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `restaurant-menu-engineering-cost-strategist` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly menu review

 | `menuId`, `items` (array) | empty | internal cost engine | menu profitability matrix & pricing recs

 |
| `restaurant-shift-prep-list-copilot` | Skill (`isSkill: true`) | `aid`<br> | **Schedule** — daily prep run

 | `dateRange`, `station`, `forecastData` | empty | POS sales data | station prep checklists & shift assignments

 |
| `restaurant-manage-reservation` | Skill (`isSkill: true`) | `represent`<br> | **Event** — booking request received

 | `partySize`, `guestName`, `time` | empty | reservation API

 | confirmed reservation record

 |
| `restaurant-update-guest-profile` | Skill (`isSkill: true`) | `aid`<br> | **User** — profile edit requested | `guestId`, `dietaryPreferences`, `vipStatus` | empty | guest CRM | updated guest profile card |
| `restaurant-supply-chain-inventory-reorder-manager` | Skill (`isSkill: true`) | `represent`<br> | **Event** — low inventory threshold

 | `item`, `quantity`, `supplier` | empty | inventory API | purchase order draft & vendor dispatch

 |
| `restaurant-financial-forecast-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly financial run

 | `dateRange`, `department` | empty | financial models | P&L performance analysis & forecasts

 |

---

## 6. Content Assistant (`content`)

### 6.1 File System Structure

```text
src/assistants/content/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── seo-content-frameworks.md
│   └── editorial-style-guide.md
├── skills/
│   ├── strategy-evaluator.ts     # content-strategy-seo-evaluator (isSkill: true)
│   ├── article-copilot.ts        # editorial-calendar-article-copilot (isSkill: true)
│   └── cms-dispatcher.ts         # governed-publishing-cms-dispatcher (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 6.2 `assistant.json` Manifest

```json
{
  "id": "content",
  "name": "Content Strategy & Publishing Assistant",
  "description": "Evaluates content SEO performance, drafts targeted articles, manages editorial calendars, and dispatches approved content to configured CMS channels.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/seo-content-frameworks.md",
    "knowledge/editorial-style-guide.md"
  ]
}

```

### 6.3 Capability Clusters & Skill/Tool Registry

* **Content Production Cluster:** `content-strategy-seo-evaluator` → `editorial-calendar-article-copilot` → `governed-publishing-cms-dispatcher`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `content-strategy-seo-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly SEO audit

 | `contentItems` (array), `metrics` | empty | SEO telemetry | content strategy recommendations & keyword gap list

 |
| `editorial-calendar-article-copilot` | Skill (`isSkill: true`) | `aid`<br> | **Event** — keyword gap identified

 | `topics` (array) | empty | internal style guide | article draft & editorial calendar entry

 |
| `governed-publishing-cms-dispatcher` | Skill (`isSkill: true`) | `represent`<br> | **Event** — draft approved

 | `channel`, `contentId`, `title` | `endpointUrl` (secret), `token` (secret)

 | CMS API (WordPress/Ghost)

 | published post payload & live URL dispatch

 |

---

## 7. Songwriter Assistant (`songwriter`)

### 7.1 File System Structure

```text
src/assistants/songwriter/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── music-theory-rules.md
│   ├── prosody-stress-metrics.md
│   └── song-structure-guides.md
├── skills/
│   ├── trend-evaluator.ts        # songwriter_genre_trend_evaluator (isSkill: true)
│   ├── lead-sheet-dispatcher.ts  # songwriting_lead_sheet_demo_dispatcher (isSkill: true)
│   ├── lyric-cocreation.ts       # songwriting_musical_lyric_cocreation (isSkill: true)
│   └── prosody-evaluator.ts      # songwriting_lyric_prosody_evaluator (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 7.2 `assistant.json` Manifest

```json
{
  "id": "songwriter",
  "name": "Songwriting & Musical Composition Assistant",
  "description": "Monitors music genre trends, co-creates lyrics and chord progressions, evaluates lyric prosody meter, and exports lead sheets.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/music-theory-rules.md",
    "knowledge/prosody-stress-metrics.md",
    "knowledge/song-structure-guides.md"
  ]
}

```

### 7.3 Capability Clusters & Skill/Tool Registry

* **Trend Research Cluster:** `songwriter_genre_trend_evaluator`

* **Creative Production Cluster:** `songwriting_lead_sheet_demo_dispatcher`, `songwriting_musical_lyric_cocreation`

* **Prosody Evaluation Cluster:** `songwriting_lyric_prosody_evaluator`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `songwriter_genre_trend_evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly trend scan

 | `genre`, `market` | `endpointUrl` (secret), `apiKey` (secret)

 | external music intel | genre trend report & production Insights

 |
| `songwriting_lead_sheet_demo_dispatcher` | Skill (`isSkill: true`) | `aid`<br> | **User** — chart request

 | `format`, `genre`, `mood` | empty | rendering engine | formatted PDF lead sheet & chord chart

 |
| `songwriting_musical_lyric_cocreation` | Skill (`isSkill: true`) | `aid`<br> | **User** — co-creation request

 | `theme`, `structure`, `topic` | empty | music theory KB | lyric stanzas, chord progressions & beat sheet

 |
| `songwriting_lyric_prosody_evaluator` | Skill (`isSkill: true`) | `advise`<br> | **User** — prosody review

 | `lyrics`, `meter`, `rhyme` | empty | prosody rules | stress/meter analysis & structural edits

 |

---

## 8. Scriptwriter Assistant (`scriptwriter`)

### 8.1 File System Structure

```text
src/assistants/scriptwriter/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── fountain-format-spec.md
│   ├── narrative-arc-frameworks.md
│   └── dialogue-subtext-rules.md
├── skills/
│   ├── market-evaluator-user.ts  # scriptwriting-genre-market-evaluator-user (isSkill: true)
│   ├── market-report-scheduled.ts# scriptwriting-market-report-scheduled (isSkill: true)
│   ├── scene-dialogue-copilot.ts # scriptwriting-scene-beat-dialogue-copilot (isSkill: true)
│   ├── pacing-evaluator.ts       # scriptwriting-narrative-arc-pacing-evaluator (isSkill: true)
│   └── submission-manager.ts     # scriptwriting-script-formatting-submission-manager (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 8.2 `assistant.json` Manifest

```json
{
  "id": "scriptwriter",
  "name": "Screenwriting & Narrative Development Assistant",
  "description": "Evaluates screenplay genre fit, drafts scene beats and subtext dialogue, analyzes narrative pacing, and formats Fountain/Final Draft scripts.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/fountain-format-spec.md",
    "knowledge/narrative-arc-frameworks.md",
    "knowledge/dialogue-subtext-rules.md"
  ]
}

```

### 8.3 Capability Clusters & Skill/Tool Registry

* **Script Production Cluster:** `scriptwriting-genre-market-evaluator-user` / `scriptwriting-market-report-scheduled` → `scriptwriting-scene-beat-dialogue-copilot` → `scriptwriting-narrative-arc-pacing-evaluator` → `scriptwriting-script-formatting-submission-manager`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `scriptwriting-genre-market-evaluator-user` | Skill (`isSkill: true`) | `advise`<br> | **User** — market fit review

 | `genre`, `scriptText`, `targetFormat` | `endpointUrl` (secret), `apiKey` (secret)

 | film intel APIs | genre fit & market readiness score

 |
| `scriptwriting-market-report-scheduled` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly report

 | `runReason` | `genres` (req, array)

 | local project store | per-genre market demand tally report

 |
| `scriptwriting-scene-beat-dialogue-copilot` | Skill (`isSkill: true`) | `aid`<br> | **User** — scene drafting

 | `sceneData`, `characters` (array) | empty | screenwriting KB | scene beat outline & dialogue draft

 |
| `scriptwriting-narrative-arc-pacing-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **User** — pacing review

 | `scriptText`, `structure` | empty | narrative rules | act pacing scorecard & rewrite advice

 |
| `scriptwriting-script-formatting-submission-manager` | Skill (`isSkill: true`) | `represent`<br> | **Event** — script finalized

 | `content`, `submissionTarget` | empty | formatting tools | formatted Fountain script & submission dispatch

 |

---

## 9. Sports Assistant (`sports`) — Dual-Group Isolation

### 9.1 File System Structure

```text
src/assistants/sports/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── xgboost-sports-metrics.md
│   └── bankroll-mathematics.md
├── performance/                   # ISOLATED GROUP A
│   ├── tactical-evaluator.ts     # sports-tactical-roster-evaluator (isSkill: true)
│   ├── battlecard-creator.ts     # sports-battlecard-creator (isSkill: true)
│   └── scouting-dispatcher.ts    # sports-scouting-alert-dispatcher (isSkill: true)
├── wagering/                      # ISOLATED GROUP B
│   ├── odds-explainer.ts         # sports-matchup-odds-explainer (isSkill: true)
│   ├── bankroll-copilot.ts       # sports-bankroll-co-pilot (isSkill: true)
│   ├── line-dispatcher.ts        # sports-line-alert-dispatcher (isSkill: true)
│   ├── predictor-adhoc.ts        # sports-predictor-ad-hoc (isSkill: true)
│   └── predictor-scheduled.ts    # sports-ingame-predictive-modeling-scheduled (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 9.2 `assistant.json` Manifest

```json
{
  "id": "sports",
  "name": "Sports Analytics & Tactical Intelligence Assistant",
  "description": "Provides team tactical evaluation and opponent scouting (Performance Group) alongside wagering odds analysis and bankroll sizing (Wagering Group) under strict data isolation.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/xgboost-sports-metrics.md",
    "knowledge/bankroll-mathematics.md"
  ],
  "policies": {
    "enforceGroupIsolation": true
  }
}

```

### 9.3 Capability Clusters & Skill/Tool Registry

#### Performance Group (Group A - Isolated)

* **Performance Cluster:** `sports-tactical-roster-evaluator`, `sports-battlecard-creator`, `sports-scouting-alert-dispatcher`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sports-tactical-roster-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Event** — pre-match window

 | `playerMetrics`, `opponentData` | empty | sports telemetry

 | tactical lineup adjustments

 |
| `sports-battlecard-creator` | Skill (`isSkill: true`) | `aid`<br> | **Event** — pre-match window

 | `opponentData`, `matchupInfo` | empty | scouting database | opponent scout report battlecard

 |
| `sports-scouting-alert-dispatcher` | Skill (`isSkill: true`) | `represent`<br> | **Event** — player health change

 | `playerData`, `alertSpecs` | empty | internal messaging | tactical scouting alert dispatches

 |

#### Wagering Group (Group B - Isolated)

* **Wagering Cluster:** `sports-matchup-odds-explainer`, `sports-bankroll-co-pilot`, `sports-line-alert-dispatcher`, `sports-predictor-ad-hoc`, `sports-ingame-predictive-modeling-scheduled`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sports-matchup-odds-explainer` | Skill (`isSkill: true`) | `advise`<br> | **Event** — line movement detected

 | `oddsData`, `marketData` | empty | odds feed APIs

 | market odds movement explanation

 |
| `sports-bankroll-co-pilot` | Skill (`isSkill: true`) | `aid`<br> | **Schedule** — daily check

 | `bankrollRules`, `unitLimits` | empty | bankroll rules | Kelly criterion sizing analysis

 |
| `sports-line-alert-dispatcher` | Skill (`isSkill: true`) | `represent`<br> | **Event** — threshold line shift

 | `lineData`, `bankrollState` | empty | push notifications | contextualized line shift alerts

 |
| `sports-predictor-ad-hoc` | Skill (`isSkill: true`) | `advise`<br> | **User** — match modeling requested

 | `event`, `sport`, `gameStatus` | empty | simulation engine | live win probability estimate

 |
| `sports-ingame-predictive-modeling-scheduled` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — 5 min interval

 | `runReason` | `matchIds` (req, array)

 | live games store | win probability movement delta report

 |

---

## 10. Finance Assistant (`finance`)

### 10.1 File System Structure

```text
src/assistants/finance/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── gaap-ifrs-accounting-standards.md
│   └── financial-modeling-rules.md
├── skills/
│   ├── modeling-analysis.ts      # finance-modeling-analysis (isSkill: true)
│   ├── risk-regulatory.ts        # risk-regulatory-advisory (isSkill: true)
│   ├── budget-tracking.ts        # budget-tracking (isSkill: true)
│   └── reporting-data-ops.ts     # reporting-data-ops (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 10.2 `assistant.json` Manifest

```json
{
  "id": "finance",
  "name": "Corporate Finance & FP&A Assistant",
  "description": "Constructs three-statement financial models, evaluates regulatory accounting risks, monitors budget vs. actuals, and dispatches GL financial reports.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/gaap-ifrs-accounting-standards.md",
    "knowledge/financial-modeling-rules.md"
  ]
}

```

### 10.3 Capability Clusters & Skill/Tool Registry

* **Modeling & Analysis Cluster:** `finance-modeling-analysis`

* **Risk & Regulatory Cluster:** `risk-regulatory-advisory`

* **Budget Tracking Cluster:** `budget-tracking`

* **Reporting & Data Ops Cluster:** `reporting-data-ops`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `finance-modeling-analysis` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly refresh

 | `modelType`, `scenarioParams` | empty | financial models | dynamic financial forecast model

 |
| `risk-regulatory-advisory` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly audit

 | `riskParams`, `regulatoryUpdates` | empty | regulatory rules | financial risk & compliance summary

 |
| `budget-tracking` | Skill (`isSkill: true`) | `represent`<br> | **Schedule** — weekly BVA check

 | `budgetData`, `actuals` | empty | ERP ledger | variance alerts & BVA summary payload

 |
| `reporting-data-ops` | Skill (`isSkill: true`) | `represent`<br> | **Schedule** — period close

 | `reportType`, `dataRange` | empty | accounting ERP | generated financial statements & report dispatches

 |

---

## 11. Wealth Assistant (`wealth`)

### 11.1 File System Structure

```text
src/assistants/wealth/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── modern-portfolio-theory.md
│   └── tax-efficient-withdrawal-rules.md
├── skills/
│   ├── market-data.ts             # investment-market-data (isSkill: true)
│   ├── portfolio-risk.ts          # portfolio-risk-advisory (isSkill: true)
│   ├── bill-pay-rebalance.ts      # bill-pay-rebalancing (isSkill: true)
│   └── research-planning.ts       # research-planning (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 11.2 `assistant.json` Manifest

```json
{
  "id": "wealth",
  "name": "Wealth Management & Personal Portfolio Assistant",
  "description": "Refreshes live market data, evaluates portfolio asset allocation drift, automates bill payments/rebalancing, and produces investment research.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/modern-portfolio-theory.md",
    "knowledge/tax-efficient-withdrawal-rules.md"
  ]
}

```

### 11.3 Capability Clusters & Skill/Tool Registry

* **Data & Research Cluster:** `investment-market-data`, `research-planning`

* **Portfolio Management Cluster:** `portfolio-risk-advisory`, `bill-pay-rebalancing`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `investment-market-data` | Skill (`isSkill: true`) | `represent`<br> | **Schedule** — 15 min refresh

 | `securities` (array) | `endpointUrl` (secret)

 | brokerage feed | updated portfolio market pricing payload

 |
| `portfolio-risk-advisory` | Skill (`isSkill: true`) | `advise`<br> | **Event** — market data updated

 | `portfolioData`, `riskTolerance` | empty | portfolio rules | asset allocation drift & rebalance advice

 |
| `bill-pay-rebalancing` | Skill (`isSkill: true`) | `represent`<br> | **Schedule** — monthly cycle

 | `obligations` (array), `amounts` | empty | banking/brokerage API | executed payment & trade rebalance log

 |
| `research-planning` | Skill (`isSkill: true`) | `aid`<br> | **User** — research requested

 | `portfolioData`, `targetAsset` | empty | market research feeds | investment thesis & asset research report

 |

---

## 12. Healthcare Assistant (`healthcare`)

### 12.1 File System Structure

```text
src/assistants/healthcare/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── hipaa-compliance-standards.md
│   ├── clinical-guidelines-base.md
│   └── EHR-integration-specs.md
├── skills/
│   ├── practice-workflow.ts       # healthcare-clinical-practice-workflow-evaluator (isSkill: true)
│   ├── decision-support.ts        # healthcare-clinical-decision-support-evaluator (isSkill: true)
│   ├── care-plan-copilot.ts       # healthcare-patient-care-plan-educational-briefing-copilot (isSkill: true)
│   ├── intake-dispatcher.ts       # healthcare-appointment-patient-intake-dispatcher (isSkill: true)
│   └── referral-coordinator.ts    # care-resource-referral-coordinator (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 12.2 `assistant.json` Manifest

```json
{
  "id": "healthcare",
  "name": "Clinical Practice & Care Operations Assistant",
  "description": "Evaluates practice workflow efficiency, provides evidence-based differential decision support, generates patient care plans, and coordinates EHR intake/referrals.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/hipaa-compliance-standards.md",
    "knowledge/clinical-guidelines-base.md",
    "knowledge/EHR-integration-specs.md"
  ],
  "policies": {
    "hipaaComplianceEnforced": true
  }
}

```

### 12.3 Capability Clusters & Skill/Tool Registry

* **Practice Operations Cluster:** `healthcare-clinical-practice-workflow-evaluator`, `healthcare-appointment-patient-intake-dispatcher`

* **Clinical Support Cluster:** `healthcare-clinical-decision-support-evaluator`, `healthcare-patient-care-plan-educational-briefing-copilot`

* **Referral Coordination Cluster:** `care-resource-referral-coordinator`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `healthcare-clinical-practice-workflow-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly workflow scan

 | `practiceData`, `metrics` | empty | practice telemetry | clinic efficiency & throughput evaluation

 |
| `healthcare-clinical-decision-support-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **User** — case analysis requested

 | `patientData`, `symptoms` (array) | empty | clinical KB | differential diagnosis briefing & guidelines

 |
| `healthcare-patient-care-plan-educational-briefing-copilot` | Skill (`isSkill: true`) | `aid`<br> | **User** — care plan requested

 | `patientProfile`, `objectives` | empty | medical literature | patient education briefing & care plan draft

 |
| `healthcare-appointment-patient-intake-dispatcher` | Skill (`isSkill: true`) | `represent`<br> | **Event** — intake submitted

 | `appointmentData`, `intakeForm` | empty | EHR API (Epic/Athena) | processed intake record & patient SMS reminder

 |
| `care-resource-referral-coordinator` | Skill (`isSkill: true`) | `represent`<br> | **User** — referral requested

 | `resourceType`, `patientNeed` | empty | referral gateway | specialist referral booking & documentation

 |

---

## 13. Hotel Assistant (`hotel`)

### 13.1 File System Structure

```text
src/assistants/hotel/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── revpar-adr-formulas.md
│   ├── pms-operations-guide.md
│   └── housekeeping-sla-rules.md
├── skills/
│   ├── revenue-advisory.ts        # hotel-revenue-performance-advisory (isSkill: true)
│   ├── guest-experience.ts        # hotel-guest-experience (isSkill: true)
│   ├── reservations-manager.ts    # hotel-reservations-manager (isSkill: true)
│   ├── profile-manager.ts         # hotel-guest-profile-manager (isSkill: true)
│   ├── maintenance-dispatcher.ts  # hotel-maintenance-dispatcher (isSkill: true)
│   ├── room-status-manager.ts     # hotel-room-status-manager (isSkill: true)
│   ├── housekeeping-manager.ts    # hotel-housekeeping-manager (isSkill: true)
│   └── inventory-manager.ts       # hotel-inventory-manager (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 13.2 `assistant.json` Manifest

```json
{
  "id": "hotel",
  "name": "Hotel Property & Guest Operations Assistant",
  "description": "Analyzes RevPAR/ADR yield performance, handles guest requests, manages PMS room bookings/housekeeping, and dispatches property maintenance.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/revpar-adr-formulas.md",
    "knowledge/pms-operations-guide.md",
    "knowledge/housekeeping-sla-rules.md"
  ]
}

```

### 13.3 Capability Clusters & Skill/Tool Registry

* **Revenue Advisory Cluster:** `hotel-revenue-performance-advisory`

* **Guest Management Cluster:** `hotel-guest-experience`, `hotel-guest-profile-manager`

* **Property Operations Cluster:** `hotel-reservations-manager`, `hotel-maintenance-dispatcher`, `hotel-room-status-manager`, `hotel-housekeeping-manager`, `hotel-inventory-manager`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hotel-revenue-performance-advisory` | Skill (`isSkill: true`) | `advise`<br> | **User** — revenue review requested

 | `propertyId`, `adr`, `revpar`, `occupancy` | empty | yield engine | ADR rightsizing & pricing strategy recs

 |
| `hotel-guest-experience` | Skill (`isSkill: true`) | `aid`<br> | **Event** — guest service message

 | `guestProfile`, `serviceRequests` | empty | concierge KB | personalized guest response & recommendation

 |
| `hotel-reservations-manager` | Skill (`isSkill: true`) | `represent`<br> | **Event** — room booking request

 | `partySize`, `guestName`, `dates` | empty | PMS API (Opera) | confirmed PMS room reservation

 |
| `hotel-guest-profile-manager` | Skill (`isSkill: true`) | `aid`<br> | **User** — loyalty update | `guestId`, `loyaltyTier`, `preferences` | empty | guest CRM | updated guest profile card |
| `hotel-maintenance-dispatcher` | Skill (`isSkill: true`) | `represent`<br> | **User** — fault reported

 | `roomId`, `issue`, `priority` | empty | maintenance API | dispatched work order payload

 |
| `hotel-room-status-manager` | Skill (`isSkill: true`) | `represent`<br> | **User** — status update

 | `roomId`, `status` | empty | PMS API | updated PMS occupancy status

 |
| `hotel-housekeeping-manager` | Skill (`isSkill: true`) | `represent`<br> | **User** — housekeeping dispatch

 | `roomId`, `assignee` | empty | PMS API | housekeeping assignment payload

 |
| `hotel-inventory-manager` | Skill (`isSkill: true`) | `represent`<br> | **User** — stock adjustment

 | `item`, `quantity` | empty | inventory API | amenity stock ledger update

 |

---

## 14. Education Assistant (`education`)

### 14.1 File System Structure

```text
src/assistants/education/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── blooms-taxonomy-framework.md
│   └── spaced-repetition-algorithms.md
├── skills/
│   ├── learner-insight.ts        # education-learner-insight (isSkill: true)
│   ├── adaptive-personalization.ts# education-adaptive-personalization (isSkill: true)
│   ├── assessment-user.ts        # education-lesson-assessment-drafting-user (isSkill: true)
│   ├── assessment-scheduled.ts   # education-lesson-assessment-drafting-scheduled (isSkill: true)
│   └── resource-library.ts       # education-resource-library (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 14.2 `assistant.json` Manifest

```json
{
  "id": "education",
  "name": "Education & Curriculum Design Assistant",
  "description": "Monitors learner telemetry, personalizes learning paths using spaced repetition, drafts lesson assessments, and curates educational resource libraries.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/blooms-taxonomy-framework.md",
    "knowledge/spaced-repetition-algorithms.md"
  ]
}

```

### 14.3 Capability Clusters & Skill/Tool Registry

* **Learner Insight Cluster:** `education-learner-insight` → `education-adaptive-personalization`

* **Assessment Cluster:** `education-lesson-assessment-drafting-user`, `education-lesson-assessment-drafting-scheduled`

* **Resource Library Cluster:** `education-resource-library`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `education-learner-insight` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly scan

 | `learnerData` | `endpointUrl` (secret), `apiKey` (secret)

 | LMS API (Canvas/Moodle)

 | student competency profile & gap analysis

 |
| `education-adaptive-personalization` | Skill (`isSkill: true`) | `advise`<br> | **User** — path request

 | `learnerId`, `courseContext` | empty | `education-learner-insight`<br> | personalized lesson study sequence

 |
| `education-lesson-assessment-drafting-user` | Skill (`isSkill: true`) | `represent`<br> | **User** — assessment request

 | `subject`, `topic`, `gradeLevel` | empty | spaced repetition store | drafted quiz/assessment unit payload

 |
| `education-lesson-assessment-drafting-scheduled` | Skill (`isSkill: true`) | `represent`<br> | **Schedule** — weekly audit

 | `runReason` | `courseId` (req)

 | local course store | automated assessment gap sweep payload

 |
| `education-resource-library` | Skill (`isSkill: true`) | `aid`<br> | **User** — library search

 | `subject`, `level`, `accessibility` | empty | resource KB | curated educational materials list

 |

---

## 15. HR Assistant (`hr`)

### 15.1 File System Structure

```text
src/assistants/hr/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── eeoc-compliance-guidelines.md
│   └── structured-interview-rubrics.md
├── skills/
│   ├── screen-resume.ts           # hr-screen-resume (isSkill: true)
│   ├── assess-candidate.ts        # hr-assess-candidate (isSkill: true)
│   ├── draft-jd-kit.ts            # hr-draft-jd-interview-kit (isSkill: true)
│   ├── schedule-user.ts           # hr-interview-scheduling-user (isSkill: true)
│   ├── schedule-automated.ts      # hr-interview-scheduling-automated (isSkill: true)
│   ├── compliance-check.ts        # hr-compliance-check (isSkill: true)
│   └── hiring-analytics.ts        # hr-hiring-analytics (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 15.2 `assistant.json` Manifest

```json
{
  "id": "hr",
  "name": "Human Resources & Talent Acquisition Assistant",
  "description": "Screens candidate resumes, scores applicant evaluations, drafts JDs/interview kits, manages candidate interview booking, and audits EEOC compliance.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/eeoc-compliance-guidelines.md",
    "knowledge/structured-interview-rubrics.md"
  ]
}

```

### 15.3 Capability Clusters & Skill/Tool Registry

* **Recruiting Pipeline Cluster:** `hr-screen-resume`, `hr-assess-candidate`, `hr-draft-jd-interview-kit`, `hr-interview-scheduling-user`, `hr-interview-scheduling-automated`

* **Analytics & Compliance Cluster:** `hr-compliance-check`, `hr-hiring-analytics`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hr-screen-resume` | Skill (`isSkill: true`) | `advise`<br> | **User** — resume submitted

 | `resumeText`, `jobRequirements` | empty | screening endpoint

 | candidate role fit score

 |
| `hr-assess-candidate` | Skill (`isSkill: true`) | `represent`<br> | **User** — score candidate

 | `candidateName`, `assessmentData` | empty | ATS API | applicant evaluation scorecard payload

 |
| `hr-draft-jd-interview-kit` | Skill (`isSkill: true`) | `aid`<br> | **User** — JD requested

 | `role`, `level`, `competencies` | empty | HR rubrics | draft JD & structured interview scorecard

 |
| `hr-interview-scheduling-user` | Skill (`isSkill: true`) | `aid`<br> | **User** — manual booking

 | `candidateName`, `timeSlot` | empty | calendar API | interview calendar booking draft

 |
| `hr-interview-scheduling-automated` | Skill (`isSkill: true`) | `aid`<br> | **Event** — screening passed

 | `candidatePayload` | `calendarId` (req)

 | calendar API | automated interview dispatch record

 |
| `hr-compliance-check` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly audit

 | `dateRange`, `filters` | empty | internal compliance rules | hiring diversity & EEOC audit report

 |
| `hr-hiring-analytics` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly report

 | `dateRange` | empty | ATS telemetry | pipeline conversion & velocity report

 |

---

## 16. Product Assistant (`product`)

### 16.1 File System Structure

```text
src/assistants/product/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── rice-wsjf-prioritization.md
│   └── prd-writing-standards.md
├── skills/
│   ├── create-roadmap.ts          # create-roadmap (isSkill: true)
│   ├── write-prd.ts               # write-prd (isSkill: true)
│   ├── data-analysis-user.ts      # product-data-analysis-user (isSkill: true)
│   ├── insights-scheduled.ts      # product-insights-scheduled (isSkill: true)
│   └── delivery-orchestrator.ts   # product-delivery-sync-orchestrator (isSkill: true)
├── tools/
│   ├── jira-tool.ts               # product-jira (isSkill: false)
│   ├── confluence-tool.ts         # product-confluence (isSkill: false)
│   ├── slack-tool.ts              # product-slack (isSkill: false)
│   ├── calendar-tool.ts           # product-calendar (isSkill: false)
│   └── markdown-tool.ts           # product-markdown-parsing (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 16.2 `assistant.json` Manifest

```json
{
  "id": "product",
  "name": "Product Management & Delivery Assistant",
  "description": "Generates strategic product roadmaps, drafts comprehensive PRDs, analyzes user product telemetry, and orchestrates cross-tool delivery synchronization.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/rice-wsjf-prioritization.md",
    "knowledge/prd-writing-standards.md"
  ]
}

```

### 16.3 Capability Clusters & Skill/Tool Registry

* **Planning Cluster:** `create-roadmap`, `write-prd`

* **Analytics Cluster:** `product-data-analysis-user`, `product-insights-scheduled`

* **Delivery Sync Cluster:** `product-delivery-sync-orchestrator` → `product-jira` / `product-confluence` / `product-slack` / `product-calendar` / `product-markdown-parsing`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `create-roadmap` | Skill (`isSkill: true`) | `advise`<br> | **User** — roadmap request

 | `initiatives` (array), `strategyDocs` | empty | prioritization KB | RICE-prioritized product roadmap

 |
| `write-prd` | Skill (`isSkill: true`) | `aid`<br> | **User** — PRD request

 | `requirements`, `userStories` (array) | empty | PRD template | complete PRD & user story specs

 |
| `product-data-analysis-user` | Skill (`isSkill: true`) | `advise`<br> | **User** — metric query

 | `metric`, `dimensions` (array) | `baseUrl` (secret), `apiToken` (secret)

 | Mixpanel/Amplitude API

 | product telemetry analysis

 |
| `product-insights-scheduled` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — hourly sweep

 | `runReason` | `metrics` (req, array)

 | Mixpanel/Amplitude API

 | product metric anomaly report

 |
| `product-delivery-sync-orchestrator` | Skill (`isSkill: true`) | `represent`<br> | **Event** — feature status updated | `featureId`, `targetState` | empty | internal delivery tools | sync payload across Jira/Confluence/Slack

 |
| `product-jira` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `issueKey`, `status` | `jiraToken` (secret) | Jira API

 | Jira status payload |
| `product-confluence` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `pageId`, `body` | `confluenceToken` (secret) | Confluence API

 | Confluence page payload |
| `product-slack` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `channel`, `message` | `slackBotToken` (secret) | Slack API

 | Slack message payload |

---

## 17. Marketing Assistant (`marketing`)

### 17.1 File System Structure

```text
src/assistants/marketing/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── brand-positioning-rules.md
│   └── ad-attribution-models.md
├── skills/
│   ├── plan-campaign.ts          # plan-campaign (isSkill: true)
│   ├── analyze-performance.ts    # analyze-performance (isSkill: true)
│   ├── execution-orchestrator.ts # marketing-campaign-execution-orchestrator (isSkill: true)
│   ├── reports-scheduled.ts      # marketing-reports-scheduled (isSkill: true)
│   ├── marketing-seo.ts          # marketing-seo (isSkill: true)
│   ├── market-research.ts        # marketing-market-research (isSkill: true)
│   └── audience-insights.ts      # marketing-audience-insights (isSkill: true)
├── tools/
│   ├── content-generator.ts      # marketing-content-generation (isSkill: false)
│   ├── social-media-tool.ts      # marketing-social-media (isSkill: false)
│   └── email-campaign-tool.ts    # marketing-email (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 17.2 `assistant.json` Manifest

```json
{
  "id": "marketing",
  "name": "Growth Marketing & Multi-Channel Campaign Assistant",
  "description": "Plans multi-channel growth campaigns, performs SEO audits and market research, segments audience personas, and orchestrates social/email executions.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/brand-positioning-rules.md",
    "knowledge/ad-attribution-models.md"
  ]
}

```

### 17.3 Capability Clusters & Skill/Tool Registry

* **Campaign Planning Cluster:** `plan-campaign`, `analyze-performance`

* **Research & SEO Cluster:** `marketing-market-research`, `marketing-audience-insights`, `marketing-seo`

* **Execution Cluster:** `marketing-campaign-execution-orchestrator` → `marketing-content-generation` / `marketing-social-media` / `marketing-email`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plan-campaign` | Skill (`isSkill: true`) | `advise`<br> | **User** — campaign plan request

 | `campaignName`, `budget`, `channels` (array) | empty | growth framework | campaign allocation plan & channel strategy

 |
| `analyze-performance` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly performance scan

 | `metrics`, `channel` | empty | marketing telemetry | campaign attribution & ROAS performance report

 |
| `marketing-campaign-execution-orchestrator` | Skill (`isSkill: true`) | `represent`<br> | **User** — execute campaign

 | `targetChannel`, `campaignData` | empty | internal marketing tools | dispatched campaign payloads

 |
| `marketing-reports-scheduled` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly report

 | `runReason` | `campaignIds` (req, array)

 | campaign data | per-campaign metric summary report

 |
| `marketing-seo` | Skill (`isSkill: true`) | `aid`<br> | **Schedule** — monthly audit

 | `url`, `keywords` (array) | empty | SEO API | technical SEO audit report

 |
| `marketing-market-research` | Skill (`isSkill: true`) | `aid`<br> | **User** — research query

 | `researchQuery`, `scope` | empty | market research APIs | competitive intelligence summary

 |
| `marketing-audience-insights` | Skill (`isSkill: true`) | `aid`<br> | **Schedule** — ongoing monitoring

 | `audienceParams` | empty | analytics API | segmented audience personas

 |
| `marketing-content-generation` | Tool (`isSkill: false`) | `aid`<br> | **Internal Call** | `contentType`, `brief` | empty | copy engine | generated ad copy & email sequence |
| `marketing-social-media` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `platform`, `message` | `socialToken` (secret) | Social APIs

 | social post schedule payload |
| `marketing-email` | Tool (`isSkill: false`) | `represent`<br> | **Internal Call** | `campaignData`, `recipients` | `sendgridApiKey` (secret) | Email API

 | email broadcast dispatch payload |

---

## 18. Analytics Assistant (`analytics`)

### 18.1 File System Structure

```text
src/assistants/analytics/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── warehouse-schema-mappings.md
│   └── kpi-dictionary.md
├── skills/
│   ├── adhoc-query.ts             # analytics-adhoc-query-evaluator (isSkill: true)
│   └── trend-monitor.ts           # analytics-scheduled-trend-monitor (isSkill: true)
└── prompts/
    └── system-prompt.md

```

### 18.2 `assistant.json` Manifest

```json
{
  "id": "analytics",
  "name": "Data Analytics & Business Intelligence Assistant",
  "description": "Executes grounded SQL data warehouse queries to answer ad-hoc business questions and monitors automated metric trends over time.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/warehouse-schema-mappings.md",
    "knowledge/kpi-dictionary.md"
  ]
}

```

### 18.3 Capability Clusters & Skill/Tool Registry

* **Business Insight Reporting Cluster:** `analytics-adhoc-query-evaluator`, `analytics-scheduled-trend-monitor`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `analytics-adhoc-query-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **User** — ad-hoc question asked

 | `question`, `metric`, `filters` | `endpointUrl` (secret), `apiKey` (secret), `provider`<br> | SQL Data Warehouse

 | grounded data response & visual charts

 |
| `analytics-scheduled-trend-monitor` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — periodic trend check

 | `metric`, `dataset`, `period` | `endpointUrl` (secret), `apiKey` (secret), `provider`<br> | SQL Data Warehouse

 | automated metric trend analysis report

 |
## 19. Customer Support Assistant (`support`)

### 19.1 File System Structure

```text
src/assistants/support/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── csat-benchmarks.md
│   └── escalation-protocols.md
├── skills/
│   ├── manage-ticket.ts         # support-resolve-ticket (isSkill: true)
│   ├── draft-response.ts        # response-drafting-user (isSkill: true)
│   ├── notify-queue.ts          # response-drafting-notifier (isSkill: true)
│   ├── ticket-ops.ts            # ticket-ops (isSkill: true)
│   └── support-analytics.ts     # analytics-planning (isSkill: true)
├── tools/
│   ├── sentiment-analysis.ts    # support-sentiment-analysis (isSkill: false)
│   ├── issue-analysis.ts        # support-issue-analysis (isSkill: false)
│   └── search-kb.ts             # support-search-kb (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 19.2 `assistant.json` Manifest

```json
{
  "id": "support",
  "name": "Customer Support Assistant",
  "description": "Orchestrates ticket triage, sentiment scoring, knowledge base retrieval, automated draft responses, and customer success analytics.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/csat-benchmarks.md",
    "knowledge/escalation-protocols.md"
  ]
}

```

### 19.3 Capability Clusters & Skill/Tool Registry

* **Ticket Lifecycle Cluster:** `support-resolve-ticket` → `support-sentiment-analysis` / `support-issue-analysis` / `support-search-kb` → `response-drafting-user` / `response-drafting-notifier` → `ticket-ops`

* **Analytics & Planning Cluster:** `analytics-planning`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `support-resolve-ticket` | Skill (`isSkill: true`) | `advise`<br> | **User** — ticket submitted for resolution

 | `ticketId`, `issue` | empty | lower-order tools | resolution summary & cards |
| `response-drafting-user` | Skill (`isSkill: true`) | `aid`<br> | **User** — request reply draft

 | `customerMessage`, `ticketId`, `tone` | empty | `support-search-kb` | response draft |
| `response-drafting-notifier` | Skill (`isSkill: true`) | `aid`<br> | **Schedule** — every 15 min

 | `runReason` | `eventTypes` (req), `targetChannels` | local queue | drafted replies & notifications |
| `ticket-ops` | Skill (`isSkill: true`) | `represent`<br> | **Event** — ticket state changed

 | `ticketId`, `status`, `routingTarget` | empty | external helpdesk | updated helpdesk status

 |
| `analytics-planning` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly review

 | `timeRange` | `csatTarget` | local metrics | CSAT & performance report

 |
| `support-sentiment-analysis` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `text` | empty | internal logic | sentiment score & confidence |
| `support-issue-analysis` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `issueText` | empty | internal logic | category & urgency classification |
| `support-search-kb` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `query` | `kbEndpoint` | knowledge store | matched KB articles |

---

## 20. Chief Technology Officer Assistant (`cto`)

### 20.1 File System Structure

```text
src/assistants/cto/
├── assistant.json
├── index.ts
├── knowledge/
│   ├── distributed-architecture.md
│   ├── dora-metrics.md
│   └── Cloud-cost-baselines.md
├── skills/
│   ├── tech-debt-evaluator.ts   # cto-architecture-tech-debt-evaluator (isSkill: true)
│   ├── cloud-optimizer.ts       # cto-cloud-spend-infrastructure-optimizer (isSkill: true)
│   ├── war-room-synthesizer.ts  # cto-incident-war-room-synthesizer (isSkill: true)
│   ├── delivery-evaluator.ts    # cto-team-delivery-health-evaluator (isSkill: true)
│   ├── dr-planner.ts            # cto-disaster-recovery-planner (isSkill: true)
│   └── iac-remediation.ts       # cto-engineering-action-iac-drift-remediation (isSkill: true)
├── tools/
│   ├── infrastructure-query.ts # cto-infrastructure-query (isSkill: false)
│   └── metrics-calculator.ts   # calculate-dora-metrics (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 20.2 `assistant.json` Manifest

```json
{
  "id": "cto",
  "name": "Chief Technology Officer Assistant",
  "description": "Advises on system architecture, optimizes cloud infrastructure spending, synthesizes war-room incidents, tracks DORA delivery metrics, and executes IaC drift remediation.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/distributed-architecture.md",
    "knowledge/dora-metrics.md",
    "knowledge/cloud-cost-baselines.md"
  ]
}

```

### 20.3 Capability Clusters & Skill/Tool Registry

* **Architecture & Cost Planning Cluster:** `cto-architecture-tech-debt-evaluator`, `cto-cloud-spend-infrastructure-optimizer`

* **Incident & Resilience Cluster:** `cto-incident-war-room-synthesizer`, `cto-disaster-recovery-planner`

* **Delivery Health Cluster:** `cto-team-delivery-health-evaluator`

* **Infrastructure Remediation Cluster (Action Layer):** `cto-engineering-action-iac-drift-remediation`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cto-architecture-tech-debt-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **User** — modernization requested

 | `systems` (array), `requirements` | empty | `cto-infrastructure-query`<br> | prioritized tech debt roadmap

 |
| `cto-cloud-spend-infrastructure-optimizer` | Skill (`isSkill: true`) | `advise`<br> | **User** — spend review requested

 | `billingRows` (array) | empty | `cto-infrastructure-query`<br> | rightsizing recommendations

 |
| `cto-incident-war-room-synthesizer` | Skill (`isSkill: true`) | `advise`<br> | **User** — correlation requested

 | `signals` (array) | empty | `cto-infrastructure-query`<br> | root-cause hypotheses & mitigations

 |
| `cto-team-delivery-health-evaluator` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly

 | `systems`, `period` | `leadTimeDays`, `mttrHours`<br> | `calculate-dora-metrics`<br> | DORA assessment & velocity report

 |
| `cto-disaster-recovery-planner` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly

 | `systems` | `rtoTargetMinutes`, `rpoTargetMinutes`<br> | internal DR rules | RTO/RPO readiness report

 |
| `cto-engineering-action-iac-drift-remediation` | Skill (`isSkill: true`) | `represent`<br> | **Event** — drift detected

 | `payload`, `dryRun` | `endpointUrl` (secret), `token` (secret)

 | IaC API

 | remediation status log

 |
| `cto-infrastructure-query` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `target`, `filter` | `cloudCredentials` (secret) | AWS/GCP/Datadog APIs

 | telemetry & billing records |
| `calculate-dora-metrics` | Tool (`isSkill: false`) | `advise`<br> | **Internal Call** | `repoId`, `timeframe` | `gitHubToken` (secret) | GitHub/Jira APIs

 | raw DORA calculation metrics |

---

## 21. Legal Assistant (`legal`) — Document Ops Consolidation

### 21.1 Structural Refactoring

In v8, `matter-document-ops` required an `operation(draft/redline/clause/finalize)` enum field. In v9 it stays **one higher-order Skill** with one Overview panel (`legal-document-ops`). The enum is removed from the input schema: the user states the goal in `instruction`, and the Skill's LLM workflow selects among four single-purpose lower-order tools (`legal_draft`, `legal_redline`, `legal_analyze_clauses`, `legal_finalize`). The split happens at the tool level only.

The Skill is `aid` because its highest-risk outcome is a work product for the user to review and send. None of the tools delivers externally.

```text
src/assistants/legal/
├── assistant.json
├── index.ts
├── knowledge/
│   └── contract-playbooks.md
├── skills/
│   ├── contract-review-user.ts       # contract-document-advisory-user
│   ├── contract-review-sweep.ts      # contract-document-advisory-scheduled
│   ├── document-ops.ts               # legal-document-ops (isSkill: true)
│   ├── legal-research.ts             # legal-research
│   ├── compliance-check-user.ts      # compliance-tracking-user
│   └── compliance-check-sweep.ts     # compliance-tracking-scheduled
├── tools/
│   ├── draft.ts                      # legal_draft (isSkill: false)
│   ├── redline.ts                    # legal_redline (isSkill: false)
│   ├── analyze-clauses.ts            # legal_analyze_clauses (isSkill: false)
│   └── finalize.ts                   # legal_finalize (isSkill: false)
└── prompts/
    └── system-prompt.md

```

### 21.2 `assistant.json` Manifest

```json
{
  "id": "legal",
  "name": "Legal & Compliance Assistant",
  "description": "Reviews commercial contracts, executes legal research, performs clause risk evaluations, and monitors regulatory compliance.",
  "version": "9.0.0",
  "domainKnowledgeFiles": [
    "knowledge/contract-playbooks.md"
  ]
}

```

### 21.3 Refactored Skill Registry

* **Intake & Triage Cluster:** `contract-document-advisory-user`, `contract-document-advisory-scheduled`

* **Legal Research Cluster:** `legal-research`

* **Document Ops Cluster:** `legal-document-ops` (orchestrates `legal_draft`, `legal_redline`, `legal_analyze_clauses`, `legal_finalize`)
* **Compliance Tracking Cluster:** `compliance-tracking-user`, `compliance-tracking-scheduled`


| ID | Type | Tier | Trigger | Inputs | Config | Consumes | Produces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `contract-document-advisory-user` | Skill (`isSkill: true`) | `advise`<br> | **User** — contract review requested

 | `contractText`, `contractType`<br> | empty | clause rules | clause risk assessment & issue list

 |
| `contract-document-advisory-scheduled` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — weekly sweep

 | `runReason` | `contractSources` (req)

 | contract store | sweep risk report

 |
| `legal-document-ops` | Skill (`isSkill: true`) | `aid` | **User** — document work requested | `instruction`, `documentType`, `partyDetails`, `terms`, `originalText`, `proposedText`, `clauseText`, `targetStandard` | empty | clause library, playbook rules, `legal_draft`, `legal_redline`, `legal_analyze_clauses`, `legal_finalize` | draft document, redline markup & risk variance, clause comparison & risk score, or finalized document, per the request |
| `legal-research` | Skill (`isSkill: true`) | `advise`<br> | **User** — research question asked

 | `statuteQuery`, `jurisdiction`<br> | empty | research APIs | precedent analysis & synthesis

 |
| `compliance-tracking-user` | Skill (`isSkill: true`) | `advise`<br> | **User** — compliance check requested

 | `regulation`, `jurisdiction`<br> | empty | compliance rules | regulation risk scorecard

 |
| `compliance-tracking-scheduled` | Skill (`isSkill: true`) | `advise`<br> | **Schedule** — monthly audit

 | `runReason` | `sources` (req)

 | compliance store | control audit report

 |
| `legal_draft` | Tool (`isSkill: false`) | `aid` | **Internal Call** | `documentType`, `partyDetails`, `terms` | empty | clause library | draft legal document |
| `legal_redline` | Tool (`isSkill: false`) | `aid` | **Internal Call** | `originalText`, `proposedText` | empty | playbook rules | redline markup & risk variance |
| `legal_analyze_clauses` | Tool (`isSkill: false`) | `advise` | **Internal Call** | `clauseText`, `targetStandard` | empty | playbook rules | clause comparison & risk score |
| `legal_finalize` | Tool (`isSkill: false`) | `aid` | **Internal Call** | `documentText` | empty | playbook rules | clean final version for user review and delivery |

---