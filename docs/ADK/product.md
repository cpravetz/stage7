# Product Assistant Documentation (Version 9)

**Assistant ID:** `product`
**Assistant Name:** Product Management & Delivery Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Product Management & Delivery Assistant supports product managers, technical program managers, and engineering leads. It constructs strategic product roadmaps using RICE and WSJF prioritization frameworks, drafts comprehensive Product Requirement Documents (PRDs) and user stories, analyzes product usage telemetry, and orchestrates cross-tool delivery synchronization across Jira, Confluence, Slack, and Google Calendar.

---

## 2. Domain Knowledge

The Product Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/rice-wsjf-prioritization.md`**: RICE (Reach, Impact, Confidence, Effort) and WSJF (Weighted Shortest Job First) scoring formulas, cost of delay calculations, and prioritization matrix heuristics.
2. **`knowledge/prd-writing-standards.md`**: PRD template structures, user story mapping guidelines, Gherkin acceptance criteria standards, and Definition of Done (DoD) rubrics.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `create-roadmap`
* **Purpose:** Evaluates product initiatives and constructs RICE/WSJF prioritized product roadmaps.
* **Tier:** `advise`
* **Trigger:** **User** — Roadmap request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "initiatives": { "type": "array", "items": { "type": "object" } },
      "strategyDocs": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["initiatives"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Prioritization knowledge base
* **Produces:** Prioritized roadmap matrix, RICE scores, and milestone breakdown.

### 3.2 `write-prd`
* **Purpose:** Drafts complete Product Requirement Documents (PRDs) with acceptance criteria and technical constraints.
* **Tier:** `aid`
* **Trigger:** **User** — PRD request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "requirements": { "type": "string" },
      "userStories": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["requirements"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** PRD template knowledge base
* **Produces:** Structured PRD document draft and user story specification list.

### 3.3 `product-data-analysis-user`
* **Purpose:** Queries Mixpanel and Amplitude product analytics to answer feature adoption and user retention questions.
* **Tier:** `advise`
* **Trigger:** **User** — Metric query
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "metric": { "type": "string" },
      "dimensions": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["metric"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "baseUrl": { "type": "string" },
      "apiToken": { "type": "string", "description": "Analytics secret token" }
    }
  }
  ```
* **Consumes:** Mixpanel / Amplitude REST APIs
* **Produces:** Product telemetry analysis report and adoption trends.

### 3.4 `product-insights-scheduled`
* **Purpose:** Periodically monitors product telemetry for funnel drop-offs, churn spikes, or usage anomalies.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Hourly sweep
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "runReason": { "type": "string" }
    }
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "metrics": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["metrics"]
  }
  ```
* **Consumes:** Mixpanel / Amplitude REST APIs
* **Produces:** Product metric anomaly report and funnel analysis.

### 3.5 `product-delivery-sync-orchestrator`
* **Purpose:** Coordinates multi-system delivery syncs across Jira, Confluence, Slack, and Google Calendar.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Feature status updated
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "featureId": { "type": "string" },
      "targetState": { "type": "string" }
    },
    "required": ["featureId", "targetState"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `product-jira`, `product-confluence`, `product-slack`, `product-calendar`, `product-markdown-parsing`
* **Produces:** Multi-platform synchronization payload and delivery audit status.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`product-jira`**:
   * **Tier:** `represent`
   * **Inputs:** `issueKey` (string), `status` (string)
   * **Config / Secrets:** `jiraToken` (secret)
   * **Purpose:** Updates Atlassian Jira issue status, assignees, and sprint targets.
2. **`product-confluence`**:
   * **Tier:** `represent`
   * **Inputs:** `pageId` (string), `body` (string)
   * **Config / Secrets:** `confluenceToken` (secret)
   * **Purpose:** Updates Atlassian Confluence PRD pages and documentation spaces.
3. **`product-slack`**:
   * **Tier:** `represent`
   * **Inputs:** `channel` (string), `message` (string)
   * **Config / Secrets:** `slackBotToken` (secret)
   * **Purpose:** Posts release updates and delivery alerts to Slack channels.
4. **`product-calendar`**:
   * **Tier:** `represent`
   * **Inputs:** `eventId` (string), `details` (object)
   * **Purpose:** Schedules release windows and sprint review meetings.
5. **`product-markdown-parsing`**:
   * **Tier:** `aid`
   * **Inputs:** `markdown` (string)
   * **Purpose:** Converts Markdown documentation into Jira ADF (Atlassian Document Format) or HTML.

---

## 5. Major Data Types & Contracts

### 5.1 RICE Prioritization Scorecard
```typescript
interface RiceFeatureScore {
  featureId: string;
  name: string;
  reach: number; // users per time period
  impact: 0.25 | 0.5 | 1 | 2 | 3; // minimal to massive
  confidence: 0.5 | 0.8 | 1.0; // 50%, 80%, 100%
  effortPersonMonths: number;
  riceScore: number; // (Reach * Impact * Confidence) / Effort
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Multi-platform sync in `product-delivery-sync-orchestrator` lacks Saga / rollback handling if Jira succeeds but Slack notification fails.
   - Atlassian API rate limits during bulk issue updates must be managed via retry middleware.

2. **Enhancement Opportunities:**
   - Add native integration with Figma API to embed real-time UI design links into PRDs.
