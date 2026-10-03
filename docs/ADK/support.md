# Customer Support Assistant Documentation (Version 9)

**Assistant ID:** `support`
**Assistant Name:** Customer Support Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Customer Support Assistant orchestrates customer service operations. It performs incoming ticket triage, sentiment analysis, knowledge base (KB) retrieval, automated reply drafting, helpdesk ticket updates, and customer satisfaction (CSAT) analytics.

---

## 2. Domain Knowledge

The Support Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/csat-benchmarks.md`**: Customer Satisfaction (CSAT) scoring rubrics, Net Promoter Score (NPS) benchmarks, First Response Time (FRT) SLAs, and customer retention targets.
2. **`knowledge/escalation-protocols.md`**: Tier-1 to Tier-3 technical escalation paths, VIP customer SLA routing rules, and high-severity incident reporting procedures.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `support-resolve-ticket`
* **Purpose:** Evaluates incoming support tickets, performs sentiment and issue analysis, searches knowledge bases, and provides resolution summary cards.
* **Tier:** `advise`
* **Trigger:** **User** — Ticket submitted for resolution
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "ticketId": { "type": "string" },
      "issue": { "type": "string" }
    },
    "required": ["ticketId", "issue"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `support-sentiment-analysis`, `support-issue-analysis`, `support-search-kb`
* **Produces:** Ticket classification, sentiment analysis, matching KB articles, and proposed resolution summary.

### 3.2 `response-drafting-user`
* **Purpose:** Drafts empathetic and accurate customer email/chat responses based on knowledge base search results.
* **Tier:** `aid`
* **Trigger:** **User** — Request reply draft
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "customerMessage": { "type": "string" },
      "ticketId": { "type": "string" },
      "tone": { "type": "string", "enum": ["empathetic", "formal", "concise"] }
    },
    "required": ["customerMessage", "ticketId"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `support-search-kb`
* **Produces:** Personalised response draft and recommended knowledge base link citations.

### 3.3 `response-drafting-notifier`
* **Purpose:** Periodically scans queue for unassigned open tickets and generates queued response drafts.
* **Tier:** `aid`
* **Trigger:** **Schedule** — Every 15 minutes
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
      "eventTypes": { "type": "array", "items": { "type": "string" } },
      "targetChannels": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["eventTypes"]
  }
  ```
* **Consumes:** Local ticket queue
* **Produces:** Queued drafted replies and notification summaries.

### 3.4 `ticket-ops`
* **Purpose:** Updates ticket status, priority, and routing assignments across connected external helpdesks (Zendesk / Freshdesk / Salesforce Service Cloud).
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Ticket state changed
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "ticketId": { "type": "string" },
      "status": { "type": "string" },
      "routingTarget": { "type": "string" }
    },
    "required": ["ticketId", "status"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** External helpdesk API
* **Produces:** Updated helpdesk status confirmation payload.

### 3.5 `analytics-planning`
* **Purpose:** Analyzes support queue telemetry to calculate FRT SLAs, CSAT scores, and ticket volume trends.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly review
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "timeRange": { "type": "string" }
    },
    "required": ["timeRange"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "csatTarget": { "type": "number" }
    }
  }
  ```
* **Consumes:** Local metric store
* **Produces:** CSAT report, queue backlog analysis, and staffing capacity recommendations.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`support-sentiment-analysis`**:
   * **Tier:** `advise`
   * **Inputs:** `text` (string)
   * **Purpose:** Scores customer emotional sentiment (positive, neutral, negative, frustrated, urgent) and sentiment magnitude.
2. **`support-issue-analysis`**:
   * **Tier:** `advise`
   * **Inputs:** `issueText` (string)
   * **Purpose:** Classifies support issue category, sub-category, and priority level.
3. **`support-search-kb`**:
   * **Tier:** `advise`
   * **Inputs:** `query` (string)
   * **Config / Secrets:** `kbEndpoint` (url)
   * **Purpose:** Executes semantic vector search against internal support knowledge base.

---

## 5. Major Data Types & Contracts

### 5.1 Ticket Resolution Schema
```typescript
interface TicketResolutionPayload {
  ticketId: string;
  category: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentimentScore: number; // -1.0 to 1.0
  matchedKbArticles: Array<{ articleId: string; title: string; score: number }>;
  proposedResponse: string;
  escalationRequired: boolean;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Helpdesk API credentials should use `services/vault` rather than raw endpoint variables.
   - Vector search threshold in `support-search-kb` needs dynamic tuning to prevent irrelevant KB article recommendations.

2. **Enhancement Opportunities:**
   - Implement automated post-resolution CSAT survey dispatch triggers.
