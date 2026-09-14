### Content (9 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `draft-blog-post` | content | A, C, D, E | `type: 'code'` — writes stub `campaign: {}` to file. Input: `product`, `budget`, `channels` — **no descriptions**. Config empty. |
| `social-media-post` | content | A, C, D, E | `type: 'code'` — writes stub. Input: `platform`, `topic`, `tone` — **no descriptions**. Config empty. |
| `content-trend-analysis` | content | B, D, E | **External action** — thin wrapper. Input requires `operation` enum. Config missing data sources, date ranges, platforms. |
| `content-audience-insights` | content | B, D, E | **External action** — thin wrapper. Similar gaps. |
| `content-adaptation` | content | B, D, E | **External action** — thin wrapper. |
| `content-seo` | content | B, D, E | **External action** — thin wrapper. |
| `content-blog-platform` | content | B, D, E | **External action** — thin wrapper. Config missing CMS providers, auth types. |
| `content-video-platform` | content | B, D, E | **External action** — thin wrapper. |
| `content-analytics` | content | B, D, E | **External action** — thin wrapper. |
| `content-planner` | content | B, D, E | **External action** — thin wrapper. |

### Creative (4 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `write-lyrics` | creative | A, C, D, E | `type: 'code'` — writes stub with empty `lyrics: ''`. Input: `topic`, `genre`, `structure`, `mood` — **no descriptions**. |
| `write-script` | creative | A, C, D, E | `type: 'code'` — writes stub with empty `script: ''`. Input: `title`, `genre`, `characters`, `plot` — **no descriptions**. |
| `scriptwriter-content-planner` | creative | **B, C, D, E** | `type: 'code'` — **has `operation` enum (plan/outline/write/revise/structure/generate)** forcing user to pick pipeline stage. Writes stub with empty arrays. **Prime example from brief.** Input: `topic`, `title`, `targetDuration`, `audience`, `tone`, `style`, `episode`, `sceneCount`, `content`, `outline`, `campaignId`, `dryRun` — **ALL missing descriptions**. Config empty but should have LLM model, token limits, output format. |
| `songwriter-trend-analysis` | creative | B, D, E | **External action** — thin wrapper. |

### CTO (17 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `architecture-review` | cto | A, C, D, E | `type: 'code'` — **reads `process.env.CAREER_HOME` (wrong category!)**. Input: `system`, `requirements` — **no descriptions**. Output: hardcoded `concerns: []`, `recommendations: []`. Config empty. |
| `tech-stack-recommendation` | cto | A, C, D, E | `type: 'code'` — same `CAREER_HOME` bug. Input: `requirements`, `constraints`, `teamSize`, `timeline` — **no descriptions**. Output: hardcoded empty strings for `frontend`, `backend`, `database`, `hosting`. |
| `cto-jira` | cto | **B, D, E** | **External action** — thin wrapper. Input: `operation` enum (`createIssue`, `getIssueDetails`, `updateIssueStatus`, `queryIssues`), `payload`. Config: baseUrl, token, provider. Missing: project keys, issue types, custom fields, webhook config. |
| `cto-datadog` | cto | **B, D, E** | **External action** — thin wrapper. Input: `operation` enum. Config gaps: API keys per env, dashboard IDs, monitor tags. |
| `cto-github` | cto | **B, D, E** | **External action** — thin wrapper. Input: `operation` enum. Config gaps: repo scopes, app vs user auth, webhook secrets. |
| `cto-aws` | cto | **B, D, E** | **External action** — thin wrapper. 10+ operations. Config gaps: region, role ARN, profile, retry config. |
| `cto-gcp` | cto | **B, D, E** | **External action** — thin wrapper. Similar gaps. |
| `cto-azure` | cto | **B, D, E** | **External action** — thin wrapper. Similar gaps. |
| `cto-pagerduty` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: integration keys, escalation policies. |
| `cto-kubernetes` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: kubeconfig, context, namespace defaults. |
| `cto-cost-optimization` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: billing export, recommendation types. |
| `cto-team-metrics` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: data sources (GitHub, Jira, etc.), time windows. |
| `cto-iac-monitoring` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: Terraform Cloud, state backends. |
| `cto-database-operations` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: connection pooling, read replicas, PITR. |
| `cto-service-mesh` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: Istio/Linkerd config, mTLS. |
| `cto-disaster-recovery` | cto | **B, D, E** | **External action** — thin wrapper. Config gaps: RPO/RTO targets, failover regions, test schedules. |

### Education (18 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `create-lesson-plan` | education | A, C, D, E | `type: 'code'` — writes stub. Input: `subject`, `level`, `duration` — **no descriptions**. |
| `generate-quiz` | education | A, C, D, E | `type: 'code'` — writes stub with empty `questions: []`. Input: `topic`, `questionCount` — **no descriptions**. |
| `education-learning-analytics` | education | B, D, E | **External action** — thin wrapper. |
| `education-learning-style-analyzer` | education | B, D, E | **External action** — thin wrapper. |
| `education-adaptation-engine` | education | B, D, E | **External action** — thin wrapper. |
| `education-performance-analyzer` | education | B, D, E | **External action** — thin wrapper. |
| `education-progress-tracker` | education | B, D, E | **External action** — thin wrapper. |
| `education-resource-organizer` | education | B, D, E | **External action** — thin wrapper. |
| `education-resource-tagger` | education | B, D, E | **External action** — thin wrapper. |
| `education-resource-analyzer` | education | B, D, E | **External action** — thin wrapper. |
| `education-content-creator` | education | B, D, E | **External action** — thin wrapper. |
| `education-multimedia-integrator` | education | B, D, E | **External action** — thin wrapper. |
| `education-accessibility-checker` | education | B, D, E | **External action** — thin wrapper. |
| `education-motivation-analyzer` | education | B, D, E | **External action** — thin wrapper. |
| `education-engagement-planner` | education | B, D, E | **External action** — thin wrapper. |
| `education-activity-designer` | education | B, D, E | **External action** — thin wrapper. |

### Event (8 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `plan-event` | event | A, C, D, E | `type: 'code'` — writes stub with empty `venue`, `vendors`, `timeline`. Input: `eventType`, `attendees`, `date` — **no descriptions**. Config empty. |
| `event-budget-tracker` | event | **B, D, E** | **External action** — thin wrapper. No configSchema at all! Input minimal. |
| `event-vendor-database` | event | **B, D, E** | **External action** — thin wrapper. No configSchema. |
| `event-seating` | event | **B, D, E** | **External action** — thin wrapper. No configSchema. |
| `event-monitor` | event | **B, D, E** | **External action** — thin wrapper. No configSchema. |
| `event-check-in` | event | **B, D, E** | **External action** — thin wrapper. No configSchema. |
| `event-contract` | event | **B, D, E** | **External action** — thin wrapper. No configSchema. |
| `event-payment` | event | **B, D, E** | **External action** — thin wrapper. No configSchema. |

### Executive (19 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `leadership-coaching` | executive | A, C, D, E | `type: 'code'` — writes stub with empty `plan: {}`. Input: `area`, `goals` — **no descriptions**. |
| `decision-framework` | executive | A, C, D, E | `type: 'code'` — writes stub with empty `analysis: {}`. Input: `decision`, `framework` — **no descriptions**. |
| `executive-performance-analyzer` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-calendar` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-email` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-leadership-assessment` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-feedback-analysis` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-skill-gap` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-development-plan` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-resource-recommender` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-risk-assessment` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-scenario-modeler` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-feedback-collector` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-improvement-plan` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-communication-analyzer` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-eq-assessment` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-communication-coach` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-career-planner` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-presence-analyzer` | executive | B, D, E | **External action** — thin wrapper. |
| `executive-career-roadmap` | executive | B, D, E | **External action** — thin wrapper. |
