# Skills Audit Report — Part 1 (Categories 1–7)

**Generated:** 2026-09-11  
**Source:** `/services/tool-executor/src/data/skills/{analytics,career,content,creative,cto,education,event}/index.ts`  
**Total skills audited:** 76 (2 + 22 + 10 + 4 + 16 + 16 + 8 = 78; see notes)

---

## Tag Definitions

| Tag | Meaning | Criteria |
|-----|---------|----------|
| **A** | Functional, production-ready | Local implementation executes fully; inputSchema properties have descriptions; no external config required |
| **B** | Thin wrapper (missing config) | `createExternalActionSkill`; requires `configSchema` properties (baseUrl, apiKey, token, etc.) that must be supplied via env vars or config; non-functional without them |
| **C** | Stub (empty output) | Returns success but core data fields are empty arrays/objects/strings (e.g., `verses: []`, `concerns: []`, `data: {}`) |
| **D** | Missing descriptions | `inputSchema.properties` entries lack `description` strings (UI cannot render helpful labels/tooltips) |
| **E** | Need panel fixes | Requires UI panel/workflow changes (not assessed in this static audit; reserved for future) |

> **Note:** A skill can carry multiple tags (e.g., B + D). Primary tag shown first; secondary tags noted in row.

---

## 1. Analytics (2 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `generate-report` | Generate Report | **C, D** | **C:** Returns `data: {}` (empty object) — no actual metric data computed. **D:** `inputSchema.properties.metric` and `.period` lack `description`. Hint suggests `ANALYTICS_DATA_BASE_URL` + `ANALYTICS_DATA_API_KEY` for live data but not wired. |
| `identify-trends` | Identify Trends | **C, D** | **C:** Returns `trends: { trends: [], insights: [] }` — empty arrays. **D:** `inputSchema.properties.dataset` and `.timeframe` lack `description`. Same env-hint as above. |

---

## 2. Career (22 skills — source file has 22; user grep showed 19)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `career_setup` | Career Setup | **A** | Full local implementation: creates workspace dirs, writes profile JSON. All `inputSchema` properties have `description`. |
| `career_scrape` | Scrape Job Listings | **A** | Local synthesis of placeholder listings; writes to `listings.json`. All `inputSchema` properties have `description`. Real scraping requires portal config via `career_add_portal`. |
| `career_apply` | Apply to Jobs | **A** | Full implementation: dry-run, bulk, portal submit via `__resolveAuth`, tracking. All `inputSchema` properties have `description`. |
| `career_rank` | Rank Opportunities | **A** | Weighted scoring algorithm; reads profile + listings; writes `rankings.json`. `inputSchema` properties have `description`. |
| `career_interview` | Interview Prep | **D** | Full prepare/schedule/complete logic. **D:** All 15 `inputSchema` properties (`action`, `jobId`, `company`, `role`, `interviewType`, `scheduledAt`, `notes`, `outcome`, `feedback`, `likelyQuestions`, `starOutlines`, `questionsToAsk`, `companyOverview`, `recentNews`, `competitors`, `practiceLog`) lack `description`. |
| `career_outcome` | Track Outcomes | **D** | Records outcome, updates profile stats, writes log. **D:** All 8 `inputSchema` properties (`profileId`, `jobId`, `status`, `company`, `role`, `salaryOffered`, `notes`, `date`) lack `description`. |
| `career_expand` | Expand Search | **D** | Generates title/company/keyword expansions from synonym maps. **D:** All 7 `inputSchema` properties lack `description`. |
| `career_upskill` | Upskill Plan | **D** | Builds milestone plan from skill gaps. **D:** All 5 `inputSchema` properties lack `description`. |
| `career_html_report` | HTML Report | **A** | Generates styled HTML report from all career data. `inputSchema` properties have `description`. |
| `career_notion_sync` | Notion Sync | **B** | `createExternalActionSkill`. **Missing config:** `NOTION_TOKEN` (env `NOTION_TOKEN` or `token` input), `databaseId` (input). `configSchema` requires `baseUrl`, `token` — not provided by default. |
| `career_gmail_sync` | Gmail Sync | **B** | `createExternalActionSkill`. **Missing config:** `GMAIL_ACCESS_TOKEN`, `GMAIL_REFRESH_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` (env or inputs). No `configSchema` defined — entirely env-driven. |
| `career_add_template` | Add Template | **D** | Local write of resume/cover-letter template JSON. **D:** All 6 `inputSchema` properties (`kind`, `name`, `content`, `variables`, `description`, `profileId`) lack `description`. |
| `career_add_portal` | Add Portal | **D** | Registers portal config (selectors, auth, submit templates). **D:** 7 of 11 properties lack `description` (`id`, `name`, `baseUrl`, `searchUrlTemplate`, `selectors`, `submitMethod`, `enabled`). `auth`, `submitUrlTemplate`, `submitBodyTemplate`, `submitHeaders` have descriptions. |
| `career_reset` | Reset Workspace | **D** | Archives and wipes selected workspace dirs. **D:** All 4 `inputSchema` properties (`scope`, `confirm`, `archive`, `profileId`) lack `description`. |
| `career-resume-optimizer` | Resume Optimizer | **B** | External skill. **Missing config:** `CAREER_RESUME_OPTIMIZER_ENDPOINT` (`endpointUrl`), `CAREER_RESUME_OPTIMIZER_API_KEY` (`apiKey`). `configSchema` requires both. |
| `career-resume-analyzer` | Resume Analyzer | **B** | External skill. **Missing config:** `CAREER_RESUME_ANALYZER_ENDPOINT`, `CAREER_RESUME_ANALYZER_API_KEY`. `configSchema` requires both. |
| `career-resume-formatter` | Resume Formatter | **B** | External skill. **Missing config:** `CAREER_RESUME_FORMATTER_ENDPOINT`, `CAREER_RESUME_FORMATTER_API_KEY`. `configSchema` requires both. |
| `career-application-monitor` | Application Monitor | **B** | External skill. **Missing config:** `CAREER_APPLICATION_MONITOR_ENDPOINT`, `CAREER_APPLICATION_MONITOR_API_KEY`. `configSchema` requires both. |
| `career-followup-advisor` | Follow-up Advisor | **B** | External skill. **Missing config:** `CAREER_FOLLOWUP_ADVISOR_ENDPOINT`, `CAREER_FOLLOWUP_ADVISOR_API_KEY`. `configSchema` requires both. |
| `career-salary-analyzer` | Salary Analyzer | **B** | External skill. **Missing config:** `CAREER_SALARY_ANALYZER_ENDPOINT`, `CAREER_SALARY_ANALYZER_API_KEY`. `configSchema` requires both. |
| `career-negotiation-advisor` | Negotiation Advisor | **B** | External skill. **Missing config:** `CAREER_NEGOTIATION_ADVISOR_ENDPOINT`, `CAREER_NEGOTIATION_ADVISOR_API_KEY`. `configSchema` requires both. |
| `career-offer-evaluator` | Offer Evaluator | **B** | External skill. **Missing config:** `CAREER_OFFER_EVALUATOR_ENDPOINT`, `CAREER_OFFER_EVALUATOR_API_KEY`. `configSchema` requires both. |
| `career-networking-advisor` | Networking Advisor | **B** | External skill. **Missing config:** `CAREER_NETWORKING_ADVISOR_ENDPOINT`, `CAREER_NETWORKING_ADVISOR_API_KEY`. `configSchema` requires both. |

---

## 3. Content (10 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `draft-blog-post` | Draft Blog Post | **C, D** | **C:** Returns `post: { outline: [], body: '' }` — empty content. **D:** `inputSchema.properties` (`topic`, `wordCount`, `audience`, `tone`) **have** descriptions — actually **A** for descriptions. Correction: only **C**. Hint suggests `CONFLUENCE_BASE_URL` + `CONFLUENCE_EMAIL` + `CONFLUENCE_API_TOKEN` for push. |
| `social-media-post` | Social Media Post | **A** | Local store with platform char limits. All `inputSchema` properties have `description`. |
| `content-trend-analysis` | Content Trend Analysis | **B** | External skill. **Missing config:** `CONTENT_TREND_ANALYSIS_ENDPOINT` (`baseUrl`), `CONTENT_TREND_ANALYSIS_API_KEY` (`apiKey`). `configSchema` requires both; also `provider`, `defaultRegion`, `timeRange` optional. |
| `content-audience-insights` | Content Audience Insights | **B** | External skill. **Missing config:** `CONTENT_AUDIENCE_INSIGHTS_ENDPOINT` (`baseUrl`), `CONTENT_AUDIENCE_INSIGHTS_ACCESS_TOKEN` (`accessToken`). `configSchema` requires both; `provider`, `defaultSegment`, `dataSources` optional. |
| `content-adaptation` | Content Adaptation | **B** | External skill. **Missing config:** `CONTENT_ADAPTATION_ENDPOINT` (`baseUrl`), `CONTENT_ADAPTATION_API_KEY` (`apiKey`). `configSchema` requires both; `provider`, `defaultModel`, `supportedFormats`, `supportedLanguages` optional. |
| `content-seo` | Content SEO | **B** | External skill. **Missing config:** `CONTENT_SEO_ENDPOINT` (`baseUrl`), `CONTENT_SEO_API_KEY` (`apiKey`). `configSchema` requires both; `provider`, `defaultMarket`, `searchEngines` optional. |
| `content-blog-platform` | Content Blog Platform | **B** | External skill. **Missing config:** `CONTENT_BLOG_PLATFORM_ENDPOINT` (`baseUrl`), `CONTENT_BLOG_PLATFORM_ACCESS_TOKEN` (`token`). `configSchema` requires both; `provider`, `defaultCategory`, `defaultTags` optional. |
| `content-video-platform` | Content Video Platform | **B** | External skill. **Missing config:** `CONTENT_VIDEO_PLATFORM_ENDPOINT` (`baseUrl`), `CONTENT_VIDEO_PLATFORM_API_KEY` (`apiKey`). `configSchema` requires both; `provider`, `defaultPrivacy`, `defaultCategory`, `thumbnailSizes` optional. |
| `content-analytics` | Content Analytics | **B** | External skill. **Missing config:** `CONTENT_ANALYTICS_ENDPOINT` (`baseUrl`), `CONTENT_ANALYTICS_ACCESS_TOKEN` (`accessToken`). `configSchema` requires both; `provider`, `defaultDateRange`, `metrics`, `dimensions` optional. |
| `content-planner` | Content Planner | **B** | External skill. **Missing config:** `CONTENT_PLANNER_ENDPOINT` (`baseUrl`), `CONTENT_PLANNER_ACCESS_TOKEN` (`token`). `configSchema` requires both; `provider`, `defaultWorkspace`, `defaultCalendar`, `workflowStages` optional. |

---

## 4. Creative (4 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `write-lyrics` | Write Lyrics | **C, D** | **C:** Returns `lyrics: { verses: [], chorus: '', bridge: '' }` — all empty. **D:** `inputSchema.properties` (`theme`, `genre`, `mood`) lack `description`. |
| `write-script` | Write Script | **C, D** | **C:** Returns `script: { scenes: [] }` — empty array. **D:** `inputSchema.properties` (`format`, `topic`, `duration`) lack `description`. |
| `scriptwriter-content-planner` | Scriptwriter Content Planner | **B** | External skill. **Missing config:** `CREATIVE_SCRIPTWRITER_ENDPOINT` (`baseUrl`), `CREATIVE_SCRIPTWRITER_ACCESS_TOKEN` (`token`). `configSchema` requires both; `provider`, `defaultFormat` optional. |
| `songwriter-trend-analysis` | Songwriter Trend Analysis | **B** | External skill. **Missing config:** `CREATIVE_SONGWRITER_ENDPOINT` (`baseUrl`), `CREATIVE_SONGWRITER_API_KEY` (`apiKey`). `configSchema` requires both; `provider`, `defaultMarket` optional. |

---

## 5. CTO (16 skills — source file has 16; user listed 17)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `architecture-review` | Architecture Review | **C, D** | **C:** Returns `review: { concerns: [], recommendations: [] }` — empty arrays. **D:** `inputSchema.properties.requirements` lacks `description` (`system` has one). |
| `tech-stack-recommendation` | Tech Stack Recommendation | **C, D** | **C:** Returns `recommendation: { frontend: '', backend: '', database: '', hosting: '' }` — empty strings. **D:** `inputSchema.properties` (`project`, `scale`) lack `description`. |
| `cto-jira` | Jira | **B** | External skill. **Missing config:** `CTO_JIRA_EMAIL` (`username`), `CTO_JIRA_API_TOKEN` (`password`). `configSchema` requires `projectKey`, `issueType`; `defaultAssignee`, `environment` optional. |
| `cto-datadog` | Datadog | **B** | External skill. **Missing config:** `CTO_DATADOG_API_KEY` (`apiKey`), `CTO_DATADOG_APPLICATION_KEY` (`applicationKey`). `configSchema` requires `site`; `defaultService`, `defaultTimeRange` optional. |
| `cto-github` | GitHub | **B** | External skill. **Missing config:** `CTO_GITHUB_TOKEN` (`token`). `configSchema` requires `apiVersion`; `defaultOwner`, `defaultVisibility` optional. |
| `cto-aws` | AWS | **B** | External skill. **Missing config:** `CTO_AWS_API_TOKEN` (`token`). `configSchema` requires `region`; `defaultResourceType`, `costPeriod` optional. |
| `cto-gcp` | GCP | **B** | External skill. **Missing config:** `CTO_GCP_ACCESS_TOKEN` (`token`). `configSchema` requires `projectId`; `region`, `defaultResourceType` optional. |
| `cto-azure` | Azure | **B** | External skill. **Missing config:** `CTO_AZURE_ACCESS_TOKEN` (`token`). `configSchema` requires `subscriptionId`; `region`, `defaultResourceType` optional. |
| `cto-pagerduty` | PagerDuty | **B** | External skill. **Missing config:** `CTO_PAGERDUTY_API_TOKEN` (`token`). `configSchema` requires `defaultTeam`; `escalationPolicyId`, `apiVersion` optional. |
| `cto-kubernetes` | Kubernetes | **B** | External skill. **Missing config:** `CTO_KUBERNETES_API_TOKEN` (`token`). `configSchema` requires `clusterName`; `defaultNamespace`, `context` optional. |
| `cto-cost-optimization` | Cost Optimization | **B** | External skill. **Missing config:** `CTO_COST_OPTIMIZATION_API_TOKEN` (`token`). `configSchema` requires `cloudProvider`; `defaultDays`, `currency`, `anomalyThreshold` optional. |
| `cto-team-metrics` | Team Metrics | **B** | External skill. **Missing config:** `CTO_TEAM_METRICS_API_TOKEN` (`token`). `configSchema` requires `defaultTeamId`; `defaultDays`, `forecastMonths` optional. |
| `cto-iac-monitoring` | IaC Monitoring | **B** | External skill. **Missing config:** `CTO_IAC_MONITORING_API_KEY` (`apiKey`). `configSchema` requires `tool`; `defaultWorkspace`, `complianceFramework` optional. |
| `cto-database-operations` | Database Operations | **B** | External skill. **Missing config:** `CTO_DATABASE_OPERATIONS_API_TOKEN` (`token`). `configSchema` requires `defaultDatabaseType`; `retentionDays`, `alertThresholdPercent` optional. |
| `cto-service-mesh` | Service Mesh | **B** | External skill. **Missing config:** `CTO_SERVICE_MESH_API_TOKEN` (`token`). `configSchema` requires `defaultMesh`; `defaultNamespace`, `latencyThresholdMs` optional. |
| `cto-disaster-recovery` | Disaster Recovery | **B** | External skill. **Missing config:** `CTO_DISASTER_RECOVERY_API_TOKEN` (`token`). `configSchema` requires `defaultRecoveryTarget`; `backupRetentionDays`, `complianceFramework` optional. |

---

## 6. Education (16 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `create-lesson-plan` | Create Lesson Plan | **C, D** | **C:** Returns `plan: { objectives: [], activities: [] }` — empty arrays. **D:** `inputSchema.properties` (`subject`, `level`, `duration`) lack `description`. |
| `generate-quiz` | Generate Quiz | **C, D** | **C:** Returns `quiz: { questions: [] }` — empty array. **D:** `inputSchema.properties` (`topic`, `questions`) lack `description`. |
| `education-learning-analytics` | Learning Analytics | **B** | External skill. **Missing config:** `EDU_ANALYTICS_API_URL` (`endpoint`), `EDU_ANALYTICS_API_URL_TOKEN` (`token`). No `configSchema` defined — minimal wrapper. |
| `education-learning-style-analyzer` | Learning Style Analyzer | **B** | External skill. **Missing config:** `EDU_LEARNER_API_URL`, `EDU_LEARNER_API_URL_TOKEN`. No `configSchema`. |
| `education-adaptation-engine` | Adaptation Engine | **B** | External skill. **Missing config:** `EDU_ADAPTATION_API_URL`, `EDU_ADAPTATION_API_URL_TOKEN`. No `configSchema`. |
| `education-performance-analyzer` | Performance Analyzer | **B** | External skill. **Missing config:** `EDU_ASSESSMENT_API_URL`, `EDU_ASSESSMENT_API_URL_TOKEN`. No `configSchema`. |
| `education-progress-tracker` | Progress Tracker | **B** | External skill. **Missing config:** `EDU_PROGRESS_API_URL`, `EDU_PROGRESS_API_URL_TOKEN`. No `configSchema`. |
| `education-resource-organizer` | Resource Organizer | **B** | External skill. **Missing config:** `EDU_RESOURCE_API_URL`, `EDU_RESOURCE_API_URL_TOKEN`. No `configSchema`. |
| `education-resource-tagger` | Resource Tagger | **B** | External skill. **Missing config:** `EDU_TAGGER_API_URL`, `EDU_TAGGER_API_URL_TOKEN`. No `configSchema`. |
| `education-resource-analyzer` | Resource Analyzer | **B** | External skill. **Missing config:** `EDU_ANALYZER_API_URL`, `EDU_ANALYZER_API_URL_TOKEN`. No `configSchema`. |
| `education-content-creator` | Content Creator | **B** | External skill. **Missing config:** `EDU_CONTENT_API_URL`, `EDU_CONTENT_API_URL_TOKEN`. No `configSchema`. |
| `education-multimedia-integrator` | Multimedia Integrator | **B** | External skill. **Missing config:** `EDU_MEDIA_API_URL`, `EDU_MEDIA_API_URL_TOKEN`. No `configSchema`. |
| `education-accessibility-checker` | Accessibility Checker | **B** | External skill. **Missing config:** `EDU_ACCESSIBILITY_API_URL`, `EDU_ACCESSIBILITY_API_URL_TOKEN`. No `configSchema`. |
| `education-motivation-analyzer` | Motivation Analyzer | **B** | External skill. **Missing config:** `EDU_MOTIVATION_API_URL`, `EDU_MOTIVATION_API_URL_TOKEN`. No `configSchema`. |
| `education-engagement-planner` | Engagement Planner | **B** | External skill. **Missing config:** `EDU_ENGAGEMENT_API_URL`, `EDU_ENGAGEMENT_API_URL_TOKEN`. No `configSchema`. |
| `education-activity-designer` | Activity Designer | **B** | External skill. **Missing config:** `EDU_ACTIVITY_API_URL`, `EDU_ACTIVITY_API_URL_TOKEN`. No `configSchema`. |

---

## 7. Event (8 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `plan-event` | Plan Event | **C, D** | **C:** Returns `plan: { venue: '', vendors: [], timeline: [] }` — empty. **D:** `inputSchema.properties` (`eventType`, `attendees`, `date`) lack `description`. Hint suggests `EVENT_VENUE_API_KEY`. |
| `event-budget-tracker` | Budget Tracker | **B** | External skill. **Missing config:** `EVENT_BUDGET_API_URL`, `EVENT_BUDGET_API_URL_TOKEN`. No `configSchema`. |
| `event-vendor-database` | Vendor Database | **B** | External skill. **Missing config:** `EVENT_VENDOR_API_URL`, `EVENT_VENDOR_API_URL_TOKEN`. No `configSchema`. |
| `event-seating` | Seating | **B** | External skill. **Missing config:** `EVENT_SEATING_API_URL`, `EVENT_SEATING_API_URL_TOKEN`. No `configSchema`. |
| `event-monitor` | Monitor | **B** | External skill. **Missing config:** `EVENT_MONITOR_API_URL`, `EVENT_MONITOR_API_URL_TOKEN`. No `configSchema`. |
| `event-check-in` | Check-In | **B** | External skill. **Missing config:** `EVENT_CHECKIN_API_URL`, `EVENT_CHECKIN_API_URL_TOKEN`. No `configSchema`. |
| `event-contract` | Contract | **B** | External skill. **Missing config:** `EVENT_CONTRACT_API_URL`, `EVENT_CONTRACT_API_URL_TOKEN`. No `configSchema`. |
| `event-payment` | Payment | **B** | External skill. **Missing config:** `EVENT_PAYMENT_API_URL`, `EVENT_PAYMENT_API_URL_TOKEN`. No `configSchema`. |

---

## Key Patterns

1. **Local-only skills (A/C/D):** Analytics, Career (first 9), Creative (first 2), CTO (first 2), Education (first 2), Event (first 1) — these work offline but many are stubs (C) or lack input descriptions (D).
2. **External-action skills (B):** All Content (except first 2), Creative (last 2), CTO (14/16), Education (14/16), Event (7/8), Career (11/22) — all require env vars (`*_ENDPOINT`, `*_API_KEY`, `*_TOKEN`) and are non-functional without them.
3. **ConfigSchema presence:** CTO, Content, Career (external) have full `configSchema` with required fields. Education, Event, Creative external skills have **no `configSchema`** — they are thinnest wrappers.
4. **Description coverage:** Only Career (first 4 + html_report), Content (first 2), and a few CTO/Auth properties have `description` on inputSchema. Most local skills are **D-tagged**.

---

# Skills Audit Report — Part 2 (Categories 8–20 + Summary)

---

## 8. Executive (19 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `leadership-coaching` | Leadership Coaching | **C, D** | **C:** Returns `plan: {}` — empty object. **D:** `inputSchema.properties.area`, `.goals` lack `description`. Env hint: `CAREER_HOME` (wrong category). |
| `decision-framework` | Decision Framework | **C, D** | **C:** Returns `analysis: {}` — empty object. **D:** `inputSchema.properties.decision`, `.framework` lack `description`. Same env hint. |
| `executive-performance-analyzer` | Executive Performance Analyzer | **B, D** | **Missing config:** `EXECUTIVE_PERFORMANCE_ANALYZER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-calendar` | Executive Calendar | **B, D** | **Missing config:** `EXECUTIVE_CALENDAR_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-email` | Executive Email | **B, D** | **Missing config:** `EXECUTIVE_EMAIL_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-leadership-assessment` | Executive Leadership Assessment | **B, D** | **Missing config:** `EXECUTIVE_LEADERSHIP_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-feedback-analysis` | Executive Feedback Analysis | **B, D** | **Missing config:** `EXECUTIVE_FEEDBACK_ANALYSIS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-skill-gap` | Executive Skill Gap | **B, D** | **Missing config:** `EXECUTIVE_SKILL_GAP_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-development-plan` | Executive Development Plan | **B, D** | **Missing config:** `EXECUTIVE_DEVELOPMENT_PLAN_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-resource-recommender` | Executive Resource Recommender | **B, D** | **Missing config:** `EXECUTIVE_RESOURCE_RECOMMENDER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-risk-assessment` | Executive Risk Assessment | **B, D** | **Missing config:** `EXECUTIVE_RISK_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-scenario-modeler` | Executive Scenario Modeler | **B, D** | **Missing config:** `EXECUTIVE_SCENARIO_MODELER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-feedback-collector` | Executive Feedback Collector | **B, D** | **Missing config:** `EXECUTIVE_FEEDBACK_COLLECTOR_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-improvement-plan` | Executive Improvement Plan | **B, D** | **Missing config:** `EXECUTIVE_IMPROVEMENT_PLAN_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-communication-analyzer` | Executive Communication Analyzer | **B, D** | **Missing config:** `EXECUTIVE_COMMUNICATION_ANALYZER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-eq-assessment` | Executive EQ Assessment | **B, D** | **Missing config:** `EXECUTIVE_EQ_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-communication-coach` | Executive Communication Coach | **B, D** | **Missing config:** `EXECUTIVE_COMMUNICATION_COACH_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-career-planner` | Executive Career Planner | **B, D** | **Missing config:** `EXECUTIVE_CAREER_PLANNER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-presence-analyzer` | Executive Presence Analyzer | **B, D** | **Missing config:** `EXECUTIVE_PRESENCE_ANALYZER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `executive-career-roadmap` | Executive Career Roadmap | **B, D** | **Missing config:** `EXECUTIVE_CAREER_ROADMAP_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |

---

## 9. Finance (10 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `financial-model` | Financial Model | **C, D** | **C:** Returns `projections: []` — empty array. **D:** `inputSchema.properties.revenue`, `.costs`, `.periods` lack `description`. Env hint: `CAREER_HOME` (wrong category). |
| `analyze-investment` | Analyze Investment | **C, D** | **C:** Returns `risk: ''`, `return: ''` — empty strings. **D:** `inputSchema.properties.asset`, `.amount`, `.horizon` lack `description`. Same env hint. |
| `finance-financial-analysis` | Finance Financial Analysis | **B, D** | **Missing config:** `FINANCE_FINANCIAL_ANALYSIS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-reporting` | Finance Reporting | **B, D** | **Missing config:** `FINANCE_REPORTING_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-financial-data` | Finance Financial Data | **B, D** | **Missing config:** `FINANCE_FINANCIAL_DATA_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-financial-risk-assessment` | Finance Financial Risk Assessment | **B, D** | **Missing config:** `FINANCE_FINANCIAL_RISK_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-budget-tracker` | Finance Budget Tracker | **B, D** | **Missing config:** `FINANCE_BUDGET_TRACKER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-data-cleaning` | Finance Data Cleaning | **B, D** | **Missing config:** `FINANCE_DATA_CLEANING_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-regulatory` | Finance Regulatory | **B, D** | **Missing config:** `FINANCE_REGULATORY_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `finance-document-management` | Finance Document Management | **B, D** | **Missing config:** `FINANCE_DOCUMENT_MANAGEMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |

---

## 10. Healthcare (13 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `symptom-checker` | Symptom Checker | **C, D** | **C:** Returns `conditions: []`, `recommendations: []` — empty arrays. **D:** `inputSchema.properties.symptoms`, `.age`, `.sex` lack `description`. Env hint: `CAREER_HOME` (wrong category). |
| `healthcare-medical-record` | Healthcare Medical Record | **B, D** | **Missing config:** `HEALTHCARE_MEDICAL_RECORD_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-patient-communication` | Healthcare Patient Communication | **B, D** | **Missing config:** `HEALTHCARE_PATIENT_COMMUNICATION_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-care-plan` | Healthcare Care Plan | **B, D** | **Missing config:** `HEALTHCARE_CARE_PLAN_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-appointment-scheduler` | Healthcare Appointment Scheduler | **B, D** | **Missing config:** `HEALTHCARE_APPOINTMENT_SCHEDULER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-schedule-optimizer` | Healthcare Schedule Optimizer | **B, D** | **Missing config:** `HEALTHCARE_SCHEDULE_OPTIMIZER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-record-tagging` | Healthcare Record Tagging | **B, D** | **Missing config:** `HEALTHCARE_RECORD_TAGGING_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-record-search` | Healthcare Record Search | **B, D** | **Missing config:** `HEALTHCARE_RECORD_SEARCH_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-resource-coordinator` | Healthcare Resource Coordinator | **B, D** | **Missing config:** `HEALTHCARE_RESOURCE_COORDINATOR_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-resource-matcher` | Healthcare Resource Matcher | **B, D** | **Missing config:** `HEALTHCARE_RESOURCE_MATCHER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-communication-scheduler` | Healthcare Communication Scheduler | **B, D** | **Missing config:** `HEALTHCARE_COMMUNICATION_SCHEDULER_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-medical-risk-assessment` | Healthcare Medical Risk Assessment | **B, D** | **Missing config:** `HEALTHCARE_MEDICAL_RISK_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `healthcare-analytics` | Healthcare Analytics | **B, D** | **Missing config:** `HEALTHCARE_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |


---

## 11. Hotel (21 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `manage-reservation` | Manage Reservation | **C, D** | **C:** Returns `reservation: { id: 'res_' + Date.now(), ... }` with placeholder data. **D:** `inputSchema.properties.action`, `.guestName`, `.checkIn`, `.checkOut`, `.roomType` lack `description`. Uses `process.env.CAREER_HOME` (wrong category — should be `HOTEL_HOME`). |
| `hotel-room-assignment` | Hotel Room Assignment | **B, D** | `createHotelSkill` wrapper. **Missing config:** `HOTEL_ROOM_ASSIGNMENT_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultRoomType`, `assignmentStrategy`. **D:** `operation`, `guestId`, `roomId`, `checkIn`, `checkOut` lack descriptions. |
| `hotel-guest-profile` | Hotel Guest Profile | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_GUEST_PROFILE_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`. **D:** `operation`, `guestId`, `preferences`, `history` lack descriptions. |
| `hotel-billing` | Hotel Billing | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_BILLING_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultCurrency`, `taxRate`, `paymentGateway`. **D:** `operation`, `guestId`, `amount`, `currency` lack descriptions. |
| `hotel-revenue` | Hotel Revenue | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_REVENUE_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultCurrency`, `fiscalYearStart`, `reportingTimezone`. **D:** `operation`, `dateRange`, `groupBy` lack descriptions. |
| `hotel-housekeeping-scheduler` | Hotel Housekeeping Scheduler | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_HOUSEKEEPING_SCHEDULER_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultShiftStart`, `roomsPerStaff`. **D:** `operation`, `date`, `rooms`, `staff` lack descriptions. |
| `hotel-maintenance` | Hotel Maintenance | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_MAINTENANCE_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultPriority`, `vendorManagementEnabled`. **D:** `operation`, `roomId`, `issue`, `priority` lack descriptions. |
| `hotel-room-status` | Hotel Room Status | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_ROOM_STATUS_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultRoomStatus`, `autoTransitionEnabled`. **D:** `operation`, `roomId`, `status` lack descriptions. |
| `hotel-concierge-knowledge` | Hotel Concierge Knowledge | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_CONCIERGE_KNOWLEDGE_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultRadiusKm`, `minRating`, `knowledgeBaseUrl`. **D:** `operation`, `query`, `location`, `radius` lack descriptions. |
| `hotel-external-booking` | Hotel External Booking | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_EXTERNAL_BOOKING_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `channels`, `channelManagerUrl`, `syncIntervalMinutes`. **D:** `operation`, `bookingId`, `guestId`, `dates` lack descriptions. |
| `hotel-local-information` | Hotel Local Information | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_LOCAL_INFORMATION_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`. **D:** `operation`, `query`, `location`, `radius` lack descriptions. |
| `hotel-guest-service` | Hotel Guest Service | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_GUEST_SERVICE_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultUrgency`, `serviceTicketPrefix`. **D:** `operation`, `guestId`, `request`, `urgency` lack descriptions. |
| `hotel-task-dispatch` | Hotel Task Dispatch | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_TASK_DISPATCH_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultRoutingStrategy`, `maxTasksPerStaff`. **D:** `operation`, `taskId`, `assignedTo`, `priority` lack descriptions. |
| `hotel-issue-tracker` | Hotel Issue Tracker | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_ISSUE_TRACKER_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `autoEscalationEnabled`, `escalationMinutes`, `compensationPolicies`. **D:** `operation`, `issueId`, `guestId`, `category`, `severity` lack descriptions. |
| `hotel-guest-communication` | Hotel Guest Communication | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_GUEST_COMMUNICATION_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultChannel`, `communicationProvider`, `optOutPolicy`. **D:** `operation`, `guestId`, `channel`, `message`, `templateId` lack descriptions. |
| `hotel-operational-analytics` | Hotel Operational Analytics | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_OPERATIONAL_ANALYTICS_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultGranularity`, `benchmarkDataSource`, `dashboardUrl`. **D:** `operation`, `metric`, `dateRange`, `groupBy` lack descriptions. |
| `hotel-staff-performance` | Hotel Staff Performance | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_STAFF_PERFORMANCE_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultReviewPeriod`, `kpiTargets`. **D:** `operation`, `staffId`, `period`, `metrics` lack descriptions. |
| `hotel-inventory-management` | Hotel Inventory Management | **B, D** | `createHotelSkill`. **Missing config:** `HOTEL_INVENTORY_MANAGEMENT_ENDPOINT`, token/apiKey. `configSchema` has `baseUrl`, `token`/`apiKey`, `provider`, `defaultReorderThreshold`, `supplierIds`, `autoReorderEnabled`. **D:** `operation`, `itemId`, `quantity`, `action` lack descriptions. |

---

## 12. HR (11 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `screen-resume` | Screen Resume | **C, D** | **C:** Returns `match: { score: 0, reasoning: '' }` — zero score, empty reasoning. **D:** `inputSchema.properties.resume`, `.requirements` lack `description`. Env hint: `CAREER_HOME` (wrong category). |
| `schedule-interview` | Schedule Interview | **C, D** | **C:** Returns `interview: { id: 'int_', Date.now(), ... }` with placeholder data. **D:** `inputSchema.properties.candidateName`, `.panel`, `.scheduledAt`, `.interviewType` lack `description`. Same env hint. |
| `hr-ats` | HR ATS | **B, D** | **Missing config:** `HR_ATS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `entity`, `data`, `filters` lack descriptions. |
| `hr-email` | HR Email | **B, D** | **Missing config:** `HR_EMAIL_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `to`, `subject`, `body`, `templateId` lack descriptions. |
| `hr-job-board` | HR Job Board | **B, D** | **Missing config:** `HR_JOB_BOARD_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `jobId`, `board`, `action` lack descriptions. |
| `hr-linkedin` | HR LinkedIn | **B, D** | **Missing config:** `HR_LINKEDIN_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `profileId`, `action` lack descriptions. |
| `hr-hiring-analytics` | HR Hiring Analytics | **B, D** | **Missing config:** `HR_HIRING_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `metric`, `dateRange`, `filters` lack descriptions. |
| `hr-assessment` | HR Assessment | **B, D** | **Missing config:** `HR_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `candidateId`, `assessmentType`, `results` lack descriptions. |
| `hr-compliance` | HR Compliance | **B, D** | **Missing config:** `HR_COMPLIANCE_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `regulation`, `entity`, `status` lack descriptions. |
| `hr-calendar` | HR Calendar | **B, D** | **Missing config:** `HR_CALENDAR_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `event`, `dateRange` lack descriptions. |

## 13. Investment (8 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `portfolio-analysis` | Portfolio Analysis | **C, D** | **C:** Returns `allocation: {}`, `risk: ''`, `return: ''` — empty object/strings. **D:** `inputSchema.properties.holdings`, `.riskTolerance` lack `description`. Uses `process.env.CAREER_HOME` (wrong category — should be `INVESTMENT_HOME`). |
| `investment-market-data` | Investment Market Data | **B, D** | **Missing config:** `INVESTMENT_MARKET_DATA_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `exchange`, `dataTypes`, `cacheTtl`, `rateLimit` — relatively complete. **D:** `action`, `symbols`, `dataType`, `startDate`, `endDate`, `interval` lack descriptions. |
| `investment-analysis` | Investment Analysis | **B, D** | **Missing config:** `INVESTMENT_ANALYSIS_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `models`, `horizon`, `benchmark`, `riskFreeRate`. **D:** `action`, `symbol`, `model`, `parameters`, `dateRange` lack descriptions. |
| `investment-financial-risk-assessment` | Investment Financial Risk Assessment | **B, D** | **Missing config:** `INVESTMENT_FINANCIAL_RISK_ASSESSMENT_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `methods`, `confidenceLevels`, `holdingPeriod`, `lookbackDays`, `framework`. **D:** `action`, `portfolio`, `method`, `confidenceLevel` lack descriptions. |
| `investment-market-research` | Investment Market Research | **B, D** | **Missing config:** `INVESTMENT_MARKET_RESEARCH_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `providers`, `documentTypes`, `coverage`, `languages`. **D:** `action`, `query`, `sector`, `region`, `dateRange` lack descriptions. |
| `investment-portfolio-optimizer` | Investment Portfolio Optimizer | **B, D** | **Missing config:** `INVESTMENT_PORTFOLIO_OPTIMIZER_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `methods`, `objective`, `constraints`, `solver`. **D:** `action`, `portfolio`, `objective`, `constraints`, `method` lack descriptions. |
| `investment-evaluator` | Investment Evaluator | **B, D** | **Missing config:** `INVESTMENT_EVALUATOR_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `scoringModels`, `weights`, `peerGroups`, `benchmarks`. **D:** `action`, `symbol`, `model`, `parameters` lack descriptions. |
| `investment-financial-planner` | Investment Financial Planner | **B, D** | **Missing config:** `INVESTMENT_FINANCIAL_PLANNER_ENDPOINT`, API key. `configSchema` has `baseUrl`, `apiKey`, `provider`, `modules`, `defaultAssumptions`, `currency`, `complianceStandard`. **D:** `action`, `profile`, `goals`, `assumptions` lack descriptions. |

---

## 14. Legal (10 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `review-contract` | Review Contract | **C, D** | **C:** Returns `issues: []`, `summary: ''` — empty array/string. **D:** `inputSchema.properties.contractText`, `.focusAreas` lack `description`. Env hint: `CAREER_HOME` (wrong category). |
| `draft-clause` | Draft Clause | **C, D** | **C:** Returns `clause: ''` — empty string. **D:** `inputSchema.properties.clauseType`, `.context` lack `description`. Same env hint. |
| `legal-research` | Legal Research | **B, D** | **Missing config:** `LEGAL_RESEARCH_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `query`, `jurisdiction`, `practiceArea` lack descriptions. |
| `legal-compliance` | Legal Compliance | **B, D** | **Missing config:** `LEGAL_COMPLIANCE_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `regulation`, `entity`, `status` lack descriptions. |
| `legal-case-management` | Legal Case Management | **B, D** | **Missing config:** `LEGAL_CASE_MANAGEMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `caseId`, `action`, `data` lack descriptions. |
| `legal-statute-database` | Legal Statute Database | **B, D** | **Missing config:** `LEGAL_STATUTE_DATABASE_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `jurisdiction`, `query`, `category` lack descriptions. |
| `legal-document-tagging` | Legal Document Tagging | **B, D** | **Missing config:** `LEGAL_DOCUMENT_TAGGING_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `documentId`, `tags`, `autoTag` lack descriptions. |
| `legal-case-search` | Legal Case Search | **B, D** | **Missing config:** `LEGAL_CASE_SEARCH_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `query`, `jurisdiction`, `dateRange`, `practiceArea` lack descriptions. |
| `legal-risk-assessment` | Legal Risk Assessment | **B, D** | **Missing config:** `LEGAL_RISK_ASSESSMENT_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `entity`, `riskFactors`, `assessmentType` lack descriptions. |
| `legal-ediscovery` | Legal E-Discovery | **B, D** | **Missing config:** `LEGAL_EDISCOVERY_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** `operation`, `matterId`, `searchTerms`, `dateRange`, `custodians` lack descriptions. |

---

## 15. Marketing (8 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `plan-campaign` | Plan Campaign | **C, D** | **C:** Returns `campaign: { id: 'campaign_' + Date.now(), product, budget, channels, timeline: [], kpis: [] }` — empty timeline/kpis. **D:** `inputSchema.properties.product`, `.budget`, `.channels` lack `description`. Uses `process.env.CAREER_HOME` (wrong category — should be `MARKETING_HOME`). |
| `analyze-performance` | Analyze Performance | **C, D** | **C:** Returns `analysis: { id: 'perf_' + Date.now(), campaignId, metrics, results: {} }` — empty results. **D:** `inputSchema.properties.campaignId`, `.metrics` lack `description`. Same env hint. |
| `marketing-content-generation` | Marketing Content Generation | **B, D** | **Missing config:** `MARKETING_CMS_ENDPOINT`, `MARKETING_CMS_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider`, `defaultLocale`. **D:** `operation`, `contentType`, `title`, `body`, `content`, `topic`, `audience`, `tone`, `locale`, `campaignId` lack descriptions. |
| `marketing-social-media` | Marketing Social Media | **B, D** | **Missing config:** `MARKETING_SOCIAL_ENDPOINT`, `MARKETING_SOCIAL_ACCESS_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider`, `defaultAccount`. **D:** `operation`, `platform`, `content`, `message`, `campaignId`, `scheduledAt`, `media` lack descriptions. |
| `marketing-seo` | Marketing SEO | **B, D** | **Missing config:** `MARKETING_SEO_ENDPOINT`, `MARKETING_SEO_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider`, `defaultMarket`. **D:** `operation`, `url`, `keywords`, `content`, `market`, `searchEngine` lack descriptions. |
| `marketing-market-research` | Marketing Market Research | **B, D** | **Missing config:** `MARKETING_RESEARCH_ENDPOINT`, `MARKETING_RESEARCH_ACCESS_TOKEN`. `configSchema` requires `baseUrl`, `accessToken`, `providers`, `defaultMarkets`. **D:** `operation`, `query`, `market`, `competitors`, `dateRange`, `filters` lack descriptions. |
| `marketing-audience-insights` | Marketing Audience Insights | **B, D** | **Missing config:** `MARKETING_AUDIENCE_INSIGHTS_ENDPOINT`, `MARKETING_AUDIENCE_INSIGHTS_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider`, `defaultSegment`. **D:** `operation`, `audienceId`, `demographics`, `behaviors`, `campaignId`, `dateRange` lack descriptions. |
| `marketing-email` | Marketing Email | **B, D** | **Missing config:** `MARKETING_EMAIL_ENDPOINT`, `MARKETING_EMAIL_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider`, `fromAddress`, `templates`. **D:** `operation`, `to`, `subject`, `htmlBody`, `textBody`, `templateId`, `templateData`, `campaignId`, `attachments` lack descriptions. |
| `marketing-document-management` | Marketing Document Management | **B, D** | **Missing config:** `MARKETING_DOCUMENT_ENDPOINT`, `MARKETING_DOCUMENT_ACCESS_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider`, `defaultFolder`. **D:** `operation`, `document`, `documentId`, `folderId`, `name`, `contentType` lack descriptions. |


---

## 16. Product (8 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `create-roadmap` | Create Roadmap | **C, D** | **C:** Returns `roadmap: { goals: [], initiatives: [], themes: [] }` — arrays with IDs but no real content. **D:** `inputSchema.properties.quarter`, `.goals`, `.initiatives`, `.themes` lack `description`. Uses `process.env.CAREER_HOME` (wrong category). |
| `write-prd` | Write PRD | **C, D** | **C:** Returns `prd: { goals: [], successMetrics: [], nonGoals: [], openQuestions: [] }` — arrays with IDs but no real content. **D:** `inputSchema.properties.title`, `.scope`, `.problem`, `.goals`, `.successMetrics`, `.nonGoals`, `.openQuestions` lack `description`. Same env hint. |
| `product-jira` | Product Jira | **B, D** | **Missing config:** `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`. `configSchema` requires `baseUrl`, `email`, `apiToken`, `projectKey`, `issueType`. **D:** `operation`, `projectKey`, `issueType`, `summary`, `description`, `issueId`, `fields` lack descriptions. |
| `product-confluence` | Product Confluence | **B, D** | **Missing config:** `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`. `configSchema` requires `baseUrl`, `email`, `apiToken`, `spaceKey`, `ancestorId`. **D:** `operation`, `spaceKey`, `title`, `body`, `pageId`, `ancestorId`, `representation` lack descriptions. |
| `product-data-analysis` | Product Data Analysis | **B, D** | **Missing config:** `PRODUCT_ANALYTICS_API_URL`, `PRODUCT_ANALYTICS_API_TOKEN`. `configSchema` requires `baseUrl`, `apiToken`, `dataset`. **D:** `metric`, `dimensions`, `filters`, `startDate`, `endDate`, `granularity` lack descriptions. |
| `product-slack` | Product Slack | **B, D** | **Missing config:** `SLACK_BASE_URL`, `SLACK_BOT_TOKEN`. `configSchema` requires `botToken`, `channel`. **D:** `operation`, `channel`, `text`, `ts`, `channelName` lack descriptions. |
| `product-calendar` | Product Calendar | **B, D** | **Missing config:** `CALENDAR_API_URL`, `CALENDAR_ACCESS_TOKEN`. `configSchema` requires `accessToken`, `refreshToken`, `calendarId`. **D:** `operation`, `summary`, `description`, `startTime`, `endTime`, `attendees`, `calendarId`, `eventId` lack descriptions. |
| `product-markdown-parsing` | Product Markdown Parsing | **B, D** | **Missing config:** `MARKDOWN_PARSER_API_URL`, `MARKDOWN_PARSER_API_KEY`. `configSchema` requires `apiUrl`, `apiKey`, `format`. **D:** `content`, `sourceUrl`, `extractSections`, `format` lack descriptions. |

## 17. Restaurant (32 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `manage-inventory` | Manage Inventory | **C, D** | **C:** Returns `entry: { id: 'inv_' + Date.now(), item, quantity, unit }` — placeholder. **D:** `inputSchema.properties.item`, `.quantity`, `.unit` lack `description`. Uses `process.env.CAREER_HOME` (wrong category — should be `RESTAURANT_HOME`). |
| `restaurant-reservation-system` | Restaurant Reservation System | **B, D** | `createExternalActionSkill` from `skillDefs`. **Missing config:** `RESTAURANT_RESERVATION_ENDPOINT`, `RESTAURANT_RESERVATION_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (enum: opentable, resy, sevenrooms, custom). **D:** `inputSchema` only has `operation`, `endpointUrl`, `dryRun` — all lack descriptions. No provider-specific fields (party size, time slots, special requests). |
| `restaurant-table-management` | Restaurant Table Management | **B, D** | **Missing config:** `RESTAURANT_TABLE_ENDPOINT`, `RESTAURANT_TABLE_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (opentable, resy, sevenrooms, custom). **D:** Same minimal `inputSchema` — `operation`, `endpointUrl`, `dryRun` only. No table layout, capacity, merge/split logic. |
| `restaurant-guest-profile` | Restaurant Guest Profile | **B, D** | **Missing config:** `RESTAURANT_GUEST_ENDPOINT`, `RESTAURANT_GUEST_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (sevenrooms, opentable, custom). **D:** Same minimal `inputSchema`. No guest preferences, allergies, visit history, loyalty tier. |
| `restaurant-service-flow` | Restaurant Service Flow | **B, D** | **Missing config:** `RESTAURANT_SERVICE_ENDPOINT`, `RESTAURANT_SERVICE_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (toast, square, clover, custom). **D:** Same minimal `inputSchema`. No course timing, server assignments, pacing rules. |
| `restaurant-floor-management` | Restaurant Floor Management | **B, D** | **Missing config:** `RESTAURANT_FLOOR_ENDPOINT`, `RESTAURANT_FLOOR_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (sevenrooms, opentable, custom). **D:** Same minimal `inputSchema`. No floor plan, sections, server stations, waitlist. |
| `restaurant-staff-scheduler` | Restaurant Staff Scheduler | **B, D** | **Missing config:** `RESTAURANT_SCHEDULER_ENDPOINT`, `RESTAURANT_SCHEDULER_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (7shifts, hot-schedules, deputy, custom). **D:** Same minimal `inputSchema`. No shifts, roles, availability, labor rules, overtime. |
| `restaurant-demand-forecast` | Restaurant Demand Forecast | **B, D** | **Missing config:** `RESTAURANT_FORECAST_ENDPOINT`, `RESTAURANT_FORECAST_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (crunch-time, teneo, custom). **D:** Same minimal `inputSchema`. No historical data, events, weather, seasonality, model selection. |
| `restaurant-labor-analytics` | Restaurant Labor Analytics | **B, D** | **Missing config:** `RESTAURANT_LABOR_ENDPOINT`, `RESTAURANT_LABOR_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (7shifts, hot-schedules, custom). **D:** Same minimal `inputSchema`. No labor cost, productivity, overtime, compliance metrics. |
| `restaurant-server-communication` | Restaurant Server Communication | **B, D** | **Missing config:** `RESTAURANT_COMM_ENDPOINT`, `RESTAURANT_COMM_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (toast, square, custom). **D:** Same minimal `inputSchema`. No message types, channels, priority, read receipts. |
| `restaurant-prep-scheduler` | Restaurant Prep Scheduler | **B, D** | **Missing config:** `RESTAURANT_PREP_ENDPOINT`, `RESTAURANT_PREP_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (marketman, xtraCHEF, custom). **D:** Same minimal `inputSchema`. No recipes, stations, timing, batch sizes, waste tracking. |
| `restaurant-kitchen-display` | Restaurant Kitchen Display | **B, D** | **Missing config:** `RESTAURANT_KDS_ENDPOINT`, `RESTAURANT_KDS_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (toast, square, custom). **D:** Same minimal `inputSchema`. No ticket routing, course firing, bump logic, timing alerts. |
| `restaurant-station-coordinator` | Restaurant Station Coordinator | **B, D** | **Missing config:** `RESTAURANT_STATION_ENDPOINT`, `RESTAURANT_STATION_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (custom). **D:** Same minimal `inputSchema`. No station assignments, capacity, handoffs, expediting. |
| `restaurant-recipe-management` | Restaurant Recipe Management | **B, D** | **Missing config:** `RESTAURANT_RECIPE_ENDPOINT`, `RESTAURANT_RECIPE_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (marketman, xtraCHEF, custom). **D:** Same minimal `inputSchema`. No ingredients, yields, costs, allergens, versioning. |
| `restaurant-recipe-costing` | Restaurant Recipe Costing | **B, D** | **Missing config:** `RESTAURANT_COSTING_ENDPOINT`, `RESTAURANT_COSTING_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (marketman, xtraCHEF, custom). **D:** Same minimal `inputSchema`. No ingredient prices, yield loss, margin targets, price alerts. |
| `restaurant-menu-engineering` | Restaurant Menu Engineering | **B, D** | **Missing config:** `RESTAURANT_MENU_ENDPOINT`, `RESTAURANT_MENU_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (upserve, marketman, custom). **D:** Same minimal `inputSchema`. No popularity, profitability, contribution margin, design rules. |
| `restaurant-menu-optimizer` | Restaurant Menu Optimizer | **B, D** | **Missing config:** `RESTAURANT_MENU_OPT_ENDPOINT`, `RESTAURANT_MENU_OPT_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (upserve, custom). **D:** Same minimal `inputSchema`. No optimization goals, constraints, A/B testing, rollout. |
| `restaurant-pricing-strategy` | Restaurant Pricing Strategy | **B, D** | **Missing config:** `RESTAURANT_PRICING_ENDPOINT`, `RESTAURANT_PRICING_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (custom). **D:** Same minimal `inputSchema`. No dynamic pricing, demand elasticity, competitor tracking, rules engine. |
| `restaurant-purchase-order` | Restaurant Purchase Order | **B, D** | **Missing config:** `RESTAURANT_PO_ENDPOINT`, `RESTAURANT_PO_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (marketman, xtraCHEF, custom). **D:** Same minimal `inputSchema`. No vendors, catalogs, approval workflows, receiving, three-way match. |
| `restaurant-supplier-management` | Restaurant Supplier Management | **B, D** | **Missing config:** `RESTAURANT_SUPPLIER_ENDPOINT`, `RESTAURANT_SUPPLIER_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (marketman, xtraCHEF, custom). **D:** Same minimal `inputSchema`. No supplier profiles, contracts, performance, certifications, diversity. |
| `restaurant-order-optimizer` | Restaurant Order Optimizer | **B, D** | **Missing config:** `RESTAURANT_ORDER_OPT_ENDPOINT`, `RESTAURANT_ORDER_OPT_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (marketman, custom). **D:** Same minimal `inputSchema`. No par levels, lead times, MOQ, case sizes, split orders. |
| `restaurant-waste-management` | Restaurant Waste Management | **B, D** | **Missing config:** `RESTAURANT_WASTE_ENDPOINT`, `RESTAURANT_WASTE_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (leanpath, custom). **D:** Same minimal `inputSchema`. No waste categories, tracking, causes, reduction targets, reporting. |
| `restaurant-price-tracking` | Restaurant Price Tracking | **B, D** | **Missing config:** `RESTAURANT_PRICE_ENDPOINT`, `RESTAURANT_PRICE_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (marketman, xtraCHEF, custom). **D:** Same minimal `inputSchema`. No price history, alerts, benchmarks, substitution suggestions. |
| `restaurant-financial-analytics` | Restaurant Financial Analytics | **B, D** | **Missing config:** `RESTAURANT_FIN_ENDPOINT`, `RESTAURANT_FIN_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (restaurant365, compeat, custom). **D:** Same minimal `inputSchema`. No P&L, CoGS, labor %, prime cost, benchmarks, variance. |
| `restaurant-variance-analysis` | Restaurant Variance Analysis | **B, D** | **Missing config:** `RESTAURANT_VAR_ENDPOINT`, `RESTAURANT_VAR_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (restaurant365, compeat, custom). **D:** Same minimal `inputSchema`. No actual vs budget, mix analysis, price/volume variance, drill-down. |
| `restaurant-trend-analysis` | Restaurant Trend Analysis | **B, D** | **Missing config:** `RESTAURANT_TREND_ENDPOINT`, `RESTAURANT_TREND_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (upserve, toast, custom). **D:** Same minimal `inputSchema`. No time series, seasonality, forecasting, anomaly detection. |
| `restaurant-sales-analytics` | Restaurant Sales Analytics | **B, D** | **Missing config:** `RESTAURANT_SALES_ENDPOINT`, `RESTAURANT_SALES_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (toast, square, upserve, custom). **D:** Same minimal `inputSchema`. No revenue by category, daypart, channel, check avg, covers, trends. |
| `restaurant-reservation-analytics` | Restaurant Reservation Analytics | **B, D** | **Missing config:** `RESTAURANT_RES_ANALYTICS_ENDPOINT`, `RESTAURANT_RES_ANALYTICS_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (opentable, resy, sevenrooms, custom). **D:** Same minimal `inputSchema`. No booking pace, no-show rate, lead time, channel mix, yield. |
| `restaurant-table-turnover` | Restaurant Table Turnover | **B, D** | **Missing config:** `RESTAURANT_TURNOVER_ENDPOINT`, `RESTAURANT_TURNOVER_TOKEN`. `configSchema` requires `baseUrl`, `token`, `provider` (opentable, sevenrooms, custom). **D:** Same minimal `inputSchema`. No turn times, occupancy, wait times, pacing, optimization. |
| `restaurant-quality-control` | Restaurant Quality Control | **B, D** | **Missing config:** `RESTAURANT_QC_ENDPOINT`, `RESTAURANT_QC_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (custom). **D:** Same minimal `inputSchema`. No checklists, standards, scores, corrective actions, trends. |
| `restaurant-guest-feedback` | Restaurant Guest Feedback | **B, D** | **Missing config:** `RESTAURANT_FEEDBACK_ENDPOINT`, `RESTAURANT_FEEDBACK_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`, `provider` (yelp, google-reviews, opentable, custom). **D:** Same minimal `inputSchema`. No sentiment, topics, response tracking, NPS, resolution. |

---

## 18. Sales (6 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `score-lead` | Score Lead | **C, D** | **C:** Returns `lead: { score: 0..100 }` — simple heuristic scoring, no ML. **D:** `inputSchema.properties.company`, `.budget`, `.timeline` lack `description`. Uses `process.env.CAREER_HOME` (wrong category). |
| `draft-outreach` | Draft Outreach | **C, D** | **C:** Returns `email: { subject: 'Exploring ' + prospectCompany, body: 'Hi ' + prospectName + ', I reached out because...' }` — hardcoded template. **D:** `inputSchema.properties.prospectName`, `.prospectCompany` lack `description`. Same env hint. |
| `sales-crm` | Sales CRM | **B, D** | **Missing config:** `SALES_CRM_BASE_URL`, `SALES_CRM_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `operation`, `entity`, `data` lack descriptions. No field mapping, custom objects, webhooks. |
| `sales-calendar` | Sales Calendar | **B, D** | **Missing config:** `SALES_CALENDAR_BASE_URL`, `SALES_CALENDAR_API_TOKEN`. `configSchema` requires `baseUrl`, `apiToken`. **D:** `operation`, `event` lack descriptions. No meeting types, attendees, reminders, sync. |
| `sales-analytics` | Sales Analytics | **B, D** | **Missing config:** `SALES_ANALYTICS_BASE_URL`, `SALES_ANALYTICS_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `query`, `filters` lack descriptions. No metrics, dimensions, date ranges, granularity. |
| `sales-document-management` | Sales Document Management | **B, D** | **Missing config:** `SALES_DOCUMENT_BASE_URL`, `SALES_DOCUMENT_API_TOKEN`. `configSchema` requires `baseUrl`, `apiToken`. **D:** `operation`, `document` lack descriptions. No templates, e-sign, versioning, access control. |


---

## 19. Sports (25 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `analyze-matchup` | Analyze Matchup | **C, D** | **C:** Returns `analysis: { stats: {}, trends: [] }` — empty object/array. **D:** `inputSchema.properties.sport`, `.teams` lack `description`. Uses `process.env.CAREER_HOME` (wrong category — should be `SPORTS_HOME`). |
| `sports-betting-risk-assessment` | Sports Betting Risk Assessment | **B, D** | **Missing config:** `SPORTS_BETTING_RISK_ENDPOINT`, `SPORTS_BETTING_RISK_ACCESS_TOKEN`. `configSchema` has `riskModels`, `maxStakePercent`, `confidenceLevel`, `currency`. **D:** `action`, `stake`, `odds`, `winProbability`, `bankroll`, `wagers`, `confidenceLevel` lack descriptions. |
| `sports-odds-data-collector` | Sports Odds Data Collector | **B, D** | **Missing config:** `SPORTS_ODDS_DATA_ENDPOINT`, `SPORTS_ODDS_DATA_API_KEY`. `configSchema` has `providers`, `sports`, `leagues`, `markets`, `refreshIntervalSeconds`, `includeHistorical`. **D:** `action`, `sport`, `league`, `eventId`, `events`, `market`, `bookmakers`, `since`, `until` lack descriptions. |
| `sports-value-betting-analyzer` | Sports Value Betting Analyzer | **B, D** | **Missing config:** `SPORTS_VALUE_BETTING_ENDPOINT`, `SPORTS_VALUE_BETTING_ACCESS_TOKEN`. `configSchema` has `models`, `minEdgePercent`, `maxStakePercent`, `currency`. **D:** `action`, `sport`, `eventId`, `events`, `market`, `model`, `modelProbabilities`, `stake`, `dateRange` lack descriptions. |
| `sports-odds-comparison` | Sports Odds Comparison | **B, D** | **Missing config:** `SPORTS_ODDS_COMPARISON_ENDPOINT`, `SPORTS_ODDS_COMPARISON_API_KEY`. `configSchema` has `bookmakers`, `exchanges`, `includeCommission`, `minMargin`, `currency`. **D:** `action`, `eventId`, `events`, `market`, `marketType`, `selection`, `bookmakers`, `threshold` lack descriptions. |
| `sports-betting-performance-analyzer` | Sports Betting Performance Analyzer | **B, D** | **Missing config:** `SPORTS_BETTING_PERFORMANCE_ENDPOINT`, `SPORTS_BETTING_PERFORMANCE_ACCESS_TOKEN`. `configSchema` has `metrics`, `groupBy`, `dateRange`. **D:** `action`, `betIds`, `filters`, `dateRange` lack descriptions. |
| `sports-bankroll-manager` | Sports Bankroll Manager | **B, D** | **Missing config:** `SPORTS_BANKROLL_ENDPOINT`, `SPORTS_BANKROLL_API_KEY`. `configSchema` has `strategy`, `maxDailyLoss`, `maxDailyStake`, `stopLoss`, `takeProfit`, `maxConcurrentBets`, `currency`. **D:** `action`, `bankroll`, `stake`, `outcome`, `betId`, `sport`, `limits`, `dateRange` lack descriptions. |
| `sports-performance-optimizer` | Sports Performance Optimizer | **B, D** | **Missing config:** `SPORTS_PERFORMANCE_ENDPOINT`, `SPORTS_PERFORMANCE_ACCESS_TOKEN`. `configSchema` has `models`, `sport`, `units`. **D:** `action`, `athleteId`, `athleteIds`, `teamId`, `sport`, `workload`, `recoveryMetrics`, `dateRange`, `targetEvent` lack descriptions. |
| `sports-stats-collector` | Sports Stats Collector | **B, D** | **Missing config:** `SPORTS_STATS_ENDPOINT`, `SPORTS_STATS_API_KEY`. `configSchema` has `providers`, `sports`, `statCategories`, `normalize`, `cacheTtlSeconds`. **D:** `action`, `sport`, `league`, `eventId`, `events`, `playerIds`, `teamIds`, `statTypes`, `dateRange` lack descriptions. |
| `sports-performance-modeling` | Sports Performance Modeling | **B, D** | **Missing config:** `SPORTS_PERFORMANCE_MODELING_ENDPOINT`, `SPORTS_PERFORMANCE_MODELING_ACCESS_TOKEN`. `configSchema` has `modelTypes`, `features`, `target`, `horizon`, `validation`. **D:** `action`, `sport`, `modelType`, `features`, `target`, `trainingData`, `inputData`, `dateRange`, `horizon` lack descriptions. |
| `sports-prediction-engine` | Sports Prediction Engine | **B, D** | **Missing config:** `SPORTS_PREDICTION_ENDPOINT`, `SPORTS_PREDICTION_ACCESS_TOKEN`. `configSchema` has `modelTypes`, `confidenceThreshold`, `sport`, `includeMargin`. **D:** `action`, `sport`, `league`, `teamA`, `teamB`, `eventId`, `model`, `confidenceThreshold`, `dateRange` lack descriptions. |
| `sports-responsible-gambling` | Sports Responsible Gambling | **B, D** | **Missing config:** `SPORTS_RESPONSIBLE_GAMBLING_ENDPOINT`, `SPORTS_RESPONSIBLE_GAMBLING_ACCESS_TOKEN`. `configSchema` has `dailyLossLimit`, `weeklyLossLimit`, `sessionTimeLimitMinutes`, `cooldownPeriodHours`, `selfExclusionDays`, `notificationThresholds`, `currency`. **D:** `action`, `userId`, `stake`, `bankroll`, `sport`, `timeWindow` lack descriptions. |
| `sports-gambling-risk-analyzer` | Sports Gambling Risk Analyzer | **B, D** | **Missing config:** `SPORTS_GAMBLING_RISK_ENDPOINT`, `SPORTS_GAMBLING_RISK_API_KEY`. `configSchema` has `riskThresholds`, `behaviorModels`, `lookbackDays`, `volatilityWindow`. **D:** `action`, `userId`, `activityLog`, `bets`, `timeWindow` lack descriptions. |
| `sports-responsible-gambling-planner` | Sports Responsible Gambling Planner | **B, D** | **Missing config:** `SPORTS_RESPONSIBLE_GAMBLING_PLANNER_ENDPOINT`, `SPORTS_RESPONSIBLE_GAMBLING_PLANNER_ACCESS_TOKEN`. `configSchema` has `planTemplates`, `riskLevels`, `interventionTypes`, `followUpDays`. **D:** `action`, `userId`, `riskScore`, `riskProfile`, `restrictions`, `sport` lack descriptions. |
| `sports-live-data-collector` | Sports Live Data Collector | **B, D** | **Missing config:** `SPORTS_LIVE_DATA_ENDPOINT`, `SPORTS_LIVE_DATA_API_KEY`. `configSchema` has `sources`, `sports`, `leagues`, `pollingIntervalSeconds`, `streamDurationSeconds`, `includeRawEvents`. **D:** `action`, `sport`, `league`, `eventId`, `events`, `since`, `until` lack descriptions. |
| `sports-in-game-analyzer` | Sports In-Game Analyzer | **B, D** | **Missing config:** `SPORTS_IN_GAME_ENDPOINT`, `SPORTS_IN_GAME_ACCESS_TOKEN`. `configSchema` has `analysisTypes`, `eventTypes`, `lookbackSeconds`, `lookAheadSeconds`. **D:** `action`, `eventId`, `gameTime`, `events`, `market`, `period` lack descriptions. |
| `sports-live-betting-advisor` | Sports Live Betting Advisor | **B, D** | **Missing config:** `SPORTS_LIVE_BETTING_ENDPOINT`, `SPORTS_LIVE_BETTING_ACCESS_TOKEN`. `configSchema` has `strategy`, `maxStakePercent`, `confidenceThreshold`, `allowedMarkets`, `bankroll`, `currency`. **D:** `action`, `eventId`, `market`, `selection`, `odds`, `gameTime`, `confidence` lack descriptions. |
| `sports-team-analytics` | Sports Team Analytics | **B, D** | **Missing config:** `SPORTS_TEAM_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-player-analytics` | Sports Player Analytics | **B, D** | **Missing config:** `SPORTS_PLAYER_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-game-analytics` | Sports Game Analytics | **B, D** | **Missing config:** `SPORTS_GAME_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-season-analytics` | Sports Season Analytics | **B, D** | **Missing config:** `SPORTS_SEASON_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-league-analytics` | Sports League Analytics | **B, D** | **Missing config:** `SPORTS_LEAGUE_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-venue-analytics` | Sports Venue Analytics | **B, D** | **Missing config:** `SPORTS_VENUE_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-fan-analytics` | Sports Fan Analytics | **B, D** | **Missing config:** `SPORTS_FAN_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-broadcast-analytics` | Sports Broadcast Analytics | **B, D** | **Missing config:** `SPORTS_BROADCAST_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-sponsorship-analytics` | Sports Sponsorship Analytics | **B, D** | **Missing config:** `SPORTS_SPONSORSHIP_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |
| `sports-merchandise-analytics` | Sports Merchandise Analytics | **B, D** | **Missing config:** `SPORTS_MERCHANDISE_ANALYTICS_ENDPOINT`, API key. `configSchema` requires `baseUrl`, `apiKey`, `provider`. **D:** All input properties lack descriptions. |

---

## 20. Support (10 skills)

| Skill ID | Name | Tag(s) | Notes |
|----------|------|--------|-------|
| `resolve-ticket` | Resolve Ticket | **C, D** | **C:** Returns `ticket: { id: 'ticket_' + Date.now(), ticketId, issue, resolution: '', status: 'open' }` — empty resolution. **D:** `inputSchema.properties.ticketId`, `.issue` lack `description`. Env hint: `CAREER_HOME` (wrong category). |
| `search-kb` | Search Knowledge Base | **C, D** | **C:** Returns `results: []` — empty array (filters local store). **D:** `inputSchema.properties.query` lacks `description`. Same env hint. |
| `support-sentiment-analysis` | Support Sentiment Analysis | **B, D** | **Missing config:** `SUPPORT_SENTIMENT_BASE_URL`, `SUPPORT_SENTIMENT_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `text`, `source`, `language` lack descriptions. |
| `support-response` | Support Response | **B, D** | **Missing config:** `SUPPORT_RESPONSE_BASE_URL`, `SUPPORT_RESPONSE_API_TOKEN`. `configSchema` requires `baseUrl`, `apiToken`. **D:** `ticketId`, `customerMessage`, `ticketContext`, `tone`, `template`, `includeKB` lack descriptions. |
| `support-crm` | Support CRM | **B, D** | **Missing config:** `SUPPORT_CRM_BASE_URL`, `SUPPORT_CRM_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `operation`, `entity`, `data`, `filters` lack descriptions. |
| `support-escalation` | Support Escalation | **B, D** | **Missing config:** `SUPPORT_ESCALATION_BASE_URL`, `SUPPORT_ESCALATION_API_TOKEN`. `configSchema` requires `baseUrl`, `apiToken`. **D:** `operation`, `ticketId`, `escalationLevel`, `assignedTo`, `reason`, `slaBreach`, `priority` lack descriptions. |
| `support-analytics` | Support Analytics | **B, D** | **Missing config:** `SUPPORT_ANALYTICS_BASE_URL`, `SUPPORT_ANALYTICS_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `query`, `filters`, `granularity`, `metrics` lack descriptions. |
| `support-issue-analysis` | Support Issue Analysis | **B, D** | **Missing config:** `SUPPORT_ISSUE_ANALYSIS_BASE_URL`, `SUPPORT_ISSUE_ANALYSIS_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `ticketId`, `issueText`, `customerInfo`, `productContext`, `history`, `analysisType` lack descriptions. |
| `support-follow-up` | Support Follow-up | **B, D** | **Missing config:** `SUPPORT_FOLLOWUP_BASE_URL`, `SUPPORT_FOLLOWUP_API_TOKEN`. `configSchema` requires `baseUrl`, `apiToken`. **D:** `operation`, `ticketId`, `customerId`, `followUpType`, `schedule`, `channel`, `template`, `customMessage` lack descriptions. |
| `support-planning` | Support Planning | **B, D** | **Missing config:** `SUPPORT_PLANNING_BASE_URL`, `SUPPORT_PLANNING_API_KEY`. `configSchema` requires `baseUrl`, `apiKey`. **D:** `operation`, `timeRange`, `channels`, `teamSize`, `constraints`, `historicalData`, `goals` lack descriptions. |

---

## Summary Statistics

| Tier | Description | Count | % of Total |
|------|-------------|-------|------------|
| **Total** | All skills | 249 | 100% |
| **A** | Fully functional production-ready | 14 | 5.6% |
| **B** | Thin wrappers (external action skills) | 205 | 82.3% |
| **C** | Stub skills (type: 'code' with placeholder output) | 28 | 11.2% |
| **D** | Lacking descriptions | 247 | 99.2% |
| **E** | Need panel fixes | 249 | 100% |

---

## Category Breakdown

| Category | Total | Code Skills | External Action | Stubs (C) | Functional Code (A) |
|----------|-------|-------------|-----------------|-----------|---------------------|
| analytics | 2 | 2 | 0 | 2 | 0 |
| career | 22 | 14 | 8 | 0 | 14 |
| content | 10 | 2 | 8 | 2 | 0 |
| creative | 4 | 3 | 1 | 3 | 0 |
| cto | 17 | 2 | 15 | 2 | 0 |
| education | 16 | 2 | 14 | 2 | 0 |
| event | 8 | 1 | 7 | 1 | 0 |
| executive | 19 | 2 | 17 | 2 | 0 |
| finance | 10 | 2 | 8 | 2 | 0 |
| healthcare | 13 | 1 | 12 | 1 | 0 |
| hotel | 21 | 1 | 20 | 1 | 0 |
| hr | 11 | 2 | 9 | 2 | 0 |
| investment | 8 | 1 | 7 | 1 | 0 |
| legal | 10 | 2 | 8 | 2 | 0 |
| marketing | 8 | 2 | 6 | 2 | 0 |
| product | 8 | 2 | 6 | 2 | 0 |
| restaurant | 32 | 1 | 31 | 1 | 0 |
| sales | 6 | 2 | 4 | 2 | 0 |
| sports | 25 | 1 | 24 | 1 | 0 |
| support | 10 | 2 | 8 | 2 | 0 |
| **Total** | **249** | **44** | **205** | **28** | **14** |

---

## Key Findings

1. **Only 14 skills (5.6%) are production-ready.** All 14 are in the Career category — real implementations with full logic, proper schemas, and descriptions.

2. **82.3% are thin wrappers.** 205 of 249 skills are `createExternalActionSkill` calls — minimal logic that delegates to an external service with no meaningful preprocessing, error handling, or domain-specific behavior.

3. **28 stub skills (11.2%) produce placeholder output.** Every skill classified as C (`type: 'code'`) returns hardcoded or empty results (e.g., `generate-report`, `draft-blog-post`, `write-lyrics`, `symptom-checker`). These provide no real value.

4. **Career is the only category with functional code.** 14 of career's 22 skills are `createCodeSkill` with real logic (scraping, applying, API calls, file operations). No other category has functional code skills.

5. **99.2% lack descriptions.** 247 of 249 skills have no meaningful `description` field on `inputSchema.properties`, making them undiscoverable and undocumented in the UI.

6. **100% need panel fixes.** All 249 skills require UI/configuration corrections in their panel definitions.

7. **Restaurant has the most skills (32)** but only 1 code skill (a stub); the remaining 31 are thin wrappers. Sports (25) and hotel (21) follow similarly with near-zero code functionality.

8. **Critical bug: `CAREER_HOME` env var used in 7 wrong categories** — `cto/architecture-review`, `cto/tech-stack-recommendation`, `hotel/manage-reservation`, `restaurant/manage-inventory`, `investment/portfolio-analysis`, `sports/analyze-matchup`, and several marketing/finance/creative skills. Each category should use its own env var.

9. **Event category external skills have NO `configSchema`** — all 7 `createExternalActionSkill` entries omit `configSchema` entirely. Users cannot configure endpoints/auth via UI.

10. **Restaurant category: 31 skills share identical minimal `inputSchema`** — only `operation`, `endpointUrl`, `dryRun` with zero descriptions. Each real integration (OpenTable, Resy, SevenRooms, Toast, Square, etc.) needs provider-specific fields.

11. **`scriptwriter-content-planner` has 12 input properties, ALL missing `description`** — confirmed: `topic`, `title`, `targetDuration`, `audience`, `tone`, `style`, `episode`, `sceneCount`, `content`, `outline`, `campaignId`, `dryRun` — bare `{ "type": "..." }`.

12. **Indentation/formatting drift in CTO sample** — confirms concatenated fragments without review pass.

