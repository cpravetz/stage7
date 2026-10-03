# Marketing Assistant Documentation (Version 9)

**Assistant ID:** `marketing`
**Assistant Name:** Growth Marketing & Multi-Channel Campaign Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Growth Marketing & Multi-Channel Campaign Assistant oversees growth acquisition, multi-channel campaign planning, ROAS ad attribution, SEO technical audits, competitive market research, audience persona segmentation, and automated social media and email campaign execution.

---

## 2. Domain Knowledge

The Marketing Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/brand-positioning-rules.md`**: Brand positioning frameworks, messaging pillars, value proposition formulas, tone of voice guidelines, and trademark compliance rules.
2. **`knowledge/ad-attribution-models.md`**: Multi-touch attribution models (First Touch, Last Touch, Linear, Time-Decay, Data-Driven/Markov), CAC/LTV payback ratios, ROAS targets, and ad spend tracking across Google, Meta, and LinkedIn.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `plan-campaign`
* **Purpose:** Outlines multi-channel growth campaigns, channel allocations, budget schedules, and target CAC/ROAS targets.
* **Tier:** `advise`
* **Trigger:** **User** — Campaign plan request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "campaignName": { "type": "string" },
      "budget": { "type": "number" },
      "channels": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["campaignName", "budget", "channels"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Growth framework knowledge base
* **Produces:** Campaign budget allocation plan, channel messaging strategy, and projected KPI scorecard.

### 3.2 `analyze-performance`
* **Purpose:** Evaluates marketing telemetry, ad spend, conversion rates, and ROAS performance across active channels.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly performance scan
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "metrics": { "type": "object" },
      "channel": { "type": "string" }
    },
    "required": ["metrics"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Marketing telemetry data
* **Produces:** Multi-touch attribution analysis, channel ROAS performance report, and budget reallocation advice.

### 3.3 `marketing-campaign-execution-orchestrator`
* **Purpose:** Orchestrates multi-platform campaign launches across email, social media, and paid search.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Execute campaign
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "targetChannel": { "type": "string" },
      "campaignData": { "type": "object" }
    },
    "required": ["targetChannel", "campaignData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `marketing-content-generation`, `marketing-social-media`, `marketing-email`
* **Produces:** Dispatched campaign execution payload and platform confirmation logs.

### 3.4 `marketing-reports-scheduled`
* **Purpose:** Generates scheduled weekly metric reports summarizing campaign performance.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly report
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
      "campaignIds": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["campaignIds"]
  }
  ```
* **Consumes:** Campaign performance store
* **Produces:** Weekly campaign metric summary report.

### 3.5 `marketing-seo`
* **Purpose:** Executes technical SEO audits, site speed assessments, and keyword ranking tracking.
* **Tier:** `aid`
* **Trigger:** **Schedule** — Monthly audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "url": { "type": "string" },
      "keywords": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["url"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** SEO audit API
* **Produces:** Technical SEO audit report and rank tracking updates.

### 3.6 `marketing-market-research`
* **Purpose:** Gathers competitive intelligence, market share data, and industry benchmarks.
* **Tier:** `aid`
* **Trigger:** **User** — Research query
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "researchQuery": { "type": "string" },
      "scope": { "type": "string" }
    },
    "required": ["researchQuery"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Market research APIs
* **Produces:** Competitive intelligence summary and market positioning matrix.

### 3.7 `marketing-audience-insights`
* **Purpose:** Analyzes customer demographic data and constructs target audience personas.
* **Tier:** `aid`
* **Trigger:** **Schedule** — Ongoing monitoring
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "audienceParams": { "type": "object" }
    },
    "required": ["audienceParams"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Analytics API
* **Produces:** Segmented audience persona profiles and engagement recommendations.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`marketing-content-generation`**:
   * **Tier:** `aid`
   * **Inputs:** `contentType` (string), `brief` (object)
   * **Purpose:** Generates ad copy variations, social media posts, and email subjects.
2. **`marketing-social-media`**:
   * **Tier:** `represent`
   * **Inputs:** `platform` (string), `message` (string)
   * **Config / Secrets:** `socialToken` (secret)
   * **Purpose:** Posts updates and schedules social media broadcasts (Twitter/X, LinkedIn, Meta).
3. **`marketing-email`**:
   * **Tier:** `represent`
   * **Inputs:** `campaignData` (object), `recipients` (array)
   * **Config / Secrets:** `sendgridApiKey` (secret)
   * **Purpose:** Dispatches marketing broadcasts via SendGrid / Mailchimp REST APIs.

---

## 5. Major Data Types & Contracts

### 5.1 Campaign Execution Schema
```typescript
interface CampaignExecution {
  campaignId: string;
  name: string;
  targetChannels: Array<'email' | 'linkedin' | 'meta_ads' | 'google_ads' | 'twitter'>;
  budgetAllocations: Record<string, number>;
  creativeAssets: Array<{ assetId: string; type: 'copy' | 'image' | 'video'; content: string }>;
  status: 'draft' | 'approved' | 'executing' | 'completed';
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Social media platform tokens (`socialToken`) expire frequently and require OAuth refresh flow handling.
   - Ad spend attribution relies on aggregated daily API reports rather than real-time event webhooks.

2. **Enhancement Opportunities:**
   - Implement automated A/B split creative test generation on Meta and Google Ads.
