Decision: Split hybrid Skills and define `configSchema` for automated Skills

Overview
--------
This document captures the product+engineering decisions for the Class 4 skills (ambiguous trigger/source). Each skill is proposed to be split when both user-driven and automated behaviour is required. For automated Skills, required runtime selectors must be expressed in `configSchema` (persisted configuration) rather than `inputSchema`.

Per-skill proposals
-------------------

1) contract-document-advisory
- Split names:
  - `contract-document-advisory-user` (user-triggered)
  - `contract-document-advisory-scheduled` (automated/upstream)
- `contract-document-advisory-scheduled` configSchema (JSON Schema fragment):

  {
    "type": "object",
    "properties": {
      "contractSources": { "type": "array", "items": { "type": "string" }, "description": "IDs of contract stores or buckets" },
      "tagFilters": { "type": "array", "items": { "type": "string" } },
      "cadence": { "type": "string", "description": "cron expression or schedule id" }
    },
    "required": ["contractSources"],
    "additionalProperties": false
  }

2) compliance-tracking
- Split names:
  - `compliance-tracking-user`
  - `compliance-tracking-scheduled`
- `compliance-tracking-scheduled` configSchema:

  {
    "type": "object",
    "properties": {
      "sources": { "type": "array", "items": { "type": "string" } },
      "policySetId": { "type": "string" },
      "scanWindow": { "type": "string", "description": "cron/window definition" },
      "notifyOn": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["sources"],
    "additionalProperties": false
  }

3) response-drafting
- Split names:
  - `response-drafting-user`
  - `response-drafting-notifier` (automated)
- `response-drafting-notifier` configSchema:

  {
    "type": "object",
    "properties": {
      "eventTypes": { "type": "array", "items": { "type": "string" } },
      "targetChannels": { "type": "array", "items": { "type": "string" } },
      "templateId": { "type": "string" }
    },
    "required": ["eventTypes"],
    "additionalProperties": false
  }

4) education-lesson-assessment-drafting
- Split names:
  - `education-lesson-assessment-drafting-user`
  - `education-lesson-assessment-drafting-scheduled`
- `education-lesson-assessment-drafting-scheduled` configSchema:

  {
    "type": "object",
    "properties": {
      "courseId": { "type": "array", "items": { "type": "string" } },
      "gradeLevels": { "type": "array", "items": { "type": "string" } },
      "cadence": { "type": "string" }
    },
    "required": ["courseId"],
    "additionalProperties": false
  }

5) hr-trigger-interview-scheduling
- Split names:
  - `hr-interview-scheduling-user`
  - `hr-interview-scheduling-automated`
- `hr-interview-scheduling-automated` configSchema:

  {
    "type": "object",
    "properties": {
      "calendarId": { "type": "string" },
      "roundTypes": { "type": "array", "items": { "type": "string" } },
      "timeWindowRules": { "type": "object" }
    },
    "required": ["calendarId"],
    "additionalProperties": false
  }

6) scriptwriting-genre-market-evaluator
- Split names:
  - `scriptwriting-genre-market-evaluator-user`
  - `scriptwriting-market-report-scheduled`
- `scriptwriting-market-report-scheduled` configSchema:

  {
    "type": "object",
    "properties": {
      "genres": { "type": "array", "items": { "type": "string" } },
      "regions": { "type": "array", "items": { "type": "string" } },
      "cadence": { "type": "string" }
    },
    "required": ["genres"],
    "additionalProperties": false
  }

7) sports-ingame-predictive-modeling
- Split names:
  - `sports-predictor-ad-hoc` (user-triggered)
  - `sports-ingame-predictive-modeling-scheduled` (automated/upstream)
- `sports-ingame-predictive-modeling-scheduled` configSchema (important: must limit scope):

  {
    "type": "object",
    "properties": {
      "sports": { "type": "array", "items": { "type": "string" } },
      "teams": { "type": "array", "items": { "type": "string" } },
      "matchIds": { "type": "array", "items": { "type": "string" } },
      "dateRange": { "type": "object", "properties": { "from": { "type": "string" }, "to": { "type": "string" } } },
      "cadence": { "type": "string" }
    },
    "anyOf": [ { "required": ["matchIds"] }, { "required": ["teams"] }, { "required": ["sports"] } ],
    "additionalProperties": false
  }

8) product-data-analysis
- Split names:
  - `product-data-analysis-user`
  - `product-insights-scheduled`
- `product-insights-scheduled` configSchema:

  {
    "type": "object",
    "properties": {
      "metrics": { "type": "array", "items": { "type": "string" } },
      "segments": { "type": "array", "items": { "type": "string" } },
      "cadence": { "type": "string" },
      "thresholds": { "type": "object" }
    },
    "required": ["metrics"],
    "additionalProperties": false
  }

9) marketing-center
- Recommendation: decompose into focused Skills. Two examples:
  - `marketing-reports-scheduled` (automated) — configSchema: `campaignIds[]`, `channels[]`, `reportCadence`.
  - `marketing-analysis-user` (ad-hoc) — inputSchema: `campaignId`, `timeRange`, `queryFilters`.

Operational notes
-----------------
- For all scheduled/automated Skills CI should validate that `configSchema` has at least one selector (reject empty wide-scope configs).
- When splitting, extract common business logic into a shared library to avoid duplication.

Owners suggested: Legal/Product (contract), Compliance/Product, Support/Product, Education/Product, HR/Product, Content/Product, Sports/Product, Analytics/Product, Marketing/Product.

Next steps
----------
- Per-skill issue drafts were created in `issues/` for owner assignment and implementation. I can open PRs to add the `-scheduled` and `-user` Skill declarations and schema changes if you want.
