### Finance (9 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `financial-model` | finance | A, C, D, E | `type: 'code'` — writes stub with empty `projections: []`. Input: `revenue`, `costs`, `periods` — **no descriptions**. |
| `analyze-investment` | finance | A, C, D, E | `type: 'code'` — writes stub with empty `risk: ''`, `return: ''`. Input: `asset`, `amount`, `horizon` — **no descriptions**. |
| `finance-financial-analysis` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-reporting` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-financial-data` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-financial-risk-assessment` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-budget-tracker` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-data-cleaning` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-regulatory` | finance | B, D, E | **External action** — thin wrapper. |
| `finance-document-management` | finance | B, D, E | **External action** — thin wrapper. |

### Healthcare (13 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `symptom-checker` | healthcare | A, C, D, E | `type: 'code'` — writes stub. Input: `symptoms`, `age`, `sex` — **no descriptions**. |
| `healthcare-medical-record` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-patient-communication` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-care-plan` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-appointment-scheduler` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-schedule-optimizer` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-record-tagging` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-record-search` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-resource-coordinator` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-resource-matcher` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-communication-scheduler` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-medical-risk-assessment` | healthcare | B, D, E | **External action** — thin wrapper. |
| `healthcare-analytics` | healthcare | B, D, E | **External action** — thin wrapper. |

### Hotel (21 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `manage-reservation` | hotel | A, C, D, E | `type: 'code'` — reads `CAREER_HOME` bug. Input: `action` enum, `guestName`, `checkIn`, `checkOut`, `roomType` — **no descriptions**. |
| `hotel-room-assignment` | hotel | B, D, E | **External action** (via `createHotelSkill`). Input has `operation` enum. Config has some extra props (`defaultRoomType`, `assignmentStrategy`) — better than most. |
| `hotel-guest-profile` | hotel | B, D, E | **External action**. Input has `operation` enum with sub-operations. Config has extra props. |
| `hotel-billing` | hotel | B, D, E | **External action**. Good config props (`defaultCurrency`, `taxRate`, `paymentGateway`). |
| `hotel-revenue` | hotel | B, D, E | **External action**. Good config props (`defaultCurrency`, `fiscalYearStart`, `reportingTimezone`). |
| `hotel-housekeeping-scheduler` | hotel | B, D, E | **External action**. Config has `defaultShiftStart`, `roomsPerStaff`. |
| `hotel-maintenance` | hotel | B, D, E | **External action**. Config has `defaultPriority`, `vendorManagementEnabled`. |
| `hotel-room-status` | hotel | B, D, E | **External action**. Config has `defaultRoomStatus`, `autoTransitionEnabled`. |
| `hotel-concierge-knowledge` | hotel | B, D, E | **External action**. Config has `defaultRadiusKm`, `minRating`, `knowledgeBaseUrl`. |
| `hotel-external-booking` | hotel | B, D, E | **External action**. Config requires `channels`, has `channelManagerUrl`, `syncIntervalMinutes`. |
| `hotel-local-information` | hotel | B, D, E | **External action**. Config has provider enums. |
| `hotel-guest-service` | hotel | B, D, E | **External action**. Config has `defaultUrgency`, `serviceTicketPrefix`. |
| `hotel-task-dispatch` | hotel | B, D, E | **External action**. Config requires `defaultRoutingStrategy`, has `maxTasksPerStaff`. |
| `hotel-issue-tracker` | hotel | B, D, E | **External action**. Config has `autoEscalationEnabled`, `escalationMinutes`, `compensationPolicies`. |
| `hotel-guest-communication` | hotel | B, D, E | **External action**. Config requires `defaultChannel`, has `communicationProvider`, `optOutPolicy`. |
| `hotel-operational-analytics` | hotel | B, D, E | **External action**. Config has `defaultGranularity`, `benchmarkDataSource`, `dashboardUrl`. |
| `hotel-staff-performance` | hotel | B, D, E | **External action**. Config has `defaultReviewPeriod`, `kpiTargets`. |
| `hotel-inventory-management` | hotel | B, D, E | **External action**. Config requires `defaultReorderThreshold`, has `supplierIds`, `autoReorderEnabled`. |

### HR (11 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `screen-resume` | hr | A, C, D, E | `type: 'code'` — writes stub. Input: `resume`, `requirements` — **no descriptions**. |
| `schedule-interview` | hr | A, C, D, E | `type: 'code'` — writes stub. Input: `candidateName`, `panel`, `scheduledAt`, `interviewType` — **no descriptions**. |
| `hr-ats` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-email` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-job-board` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-linkedin` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-hiring-analytics` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-assessment` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-compliance` | hr | **B, D, E** | **External action** — thin wrapper. |
| `hr-calendar` | hr | **B, D, E** | **External action** — thin wrapper. |

### Investment (8 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `portfolio-analysis` | investment | A, C, D, E | `type: 'code'` — reads `CAREER_HOME` bug. Input: `holdings`, `riskTolerance` — **no descriptions**. Output: empty `allocation`, `risk`, `return`. |
| `investment-market-data` | investment | B, D, E | **External action** — thin wrapper. Good config (provider, exchange, dataTypes, cacheTtl, rateLimit). Input has `action` enum with 7 ops. |
| `investment-analysis` | investment | B, D, E | **External action** — thin wrapper. Good config (models, horizon, benchmark, riskFreeRate). Input has `action` enum with 7 ops. |
| `investment-financial-risk-assessment` | investment | B, D, E | **External action** — thin wrapper. Good config (methods, confidenceLevels, holdingPeriod, lookbackDays, framework). |
| `investment-market-research` | investment | B, D, E | **External action** — thin wrapper. Good config (providers, documentTypes, coverage, languages). |
| `investment-portfolio-optimizer` | investment | B, D, E | **External action** — thin wrapper. Excellent config (methods, objective, constraints, solver). |
| `investment-evaluator` | investment | B, D, E | **External action** — thin wrapper. Good config (scoringModels, weights, peerGroups, benchmarks). |
| `investment-financial-planner` | investment | B, D, E | **External action** — thin wrapper. Good config (modules, defaultAssumptions, currency, complianceStandard). |

### Legal (10 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `review-contract` | legal | A, C, D, E | `type: 'code'` — writes stub. Input: `contractText`, `focusAreas` — **no descriptions**. |
| `draft-clause` | legal | A, C, D, E | `type: 'code'` — writes stub. Input: `clauseType`, `context` — **no descriptions**. |
| `legal-research` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-compliance` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-case-management` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-statute-database` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-document-tagging` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-case-search` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-risk-assessment` | legal | B, D, E | **External action** — thin wrapper. |
| `legal-ediscovery` | legal | B, D, E | **External action** — thin wrapper. |
