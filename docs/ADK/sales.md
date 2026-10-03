# Sales Assistant Documentation (Version 9)

**Assistant ID:** `sales`
**Assistant Name:** B2B Sales & Pipeline Intelligence Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The B2B Sales & Pipeline Intelligence Assistant optimizes revenue operations by assessing deal health using the MEDDPICC framework, generating comprehensive account research dossiers, drafting personalized outreach messaging, and updating CRM deal pipeline records.

---

## 2. Domain Knowledge

The Sales Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/meddpicc-framework.md`**: Evaluation rubrics for Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, and Competition.
2. **`knowledge/icp-definitions.md`**: Ideal Customer Profile parameters, annual revenue tiers, employee headcounts, tech stack qualification signals, and target titles.
3. **`knowledge/objection-handling-playbook.md`**: Tactical re-framing scripts for pricing, timeline, legacy vendor lock-in, and feature gap objections.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `lead-deal-advisory`
* **Purpose:** Evaluates deal risk and pipeline health using MEDDPICC scoring.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Daily deal audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "prospectData": { "type": "object", "description": "Opportunity details, deal stage, contacts" },
      "criteria": { "type": "object", "description": "MEDDPICC stage criteria" }
    },
    "required": ["prospectData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `sales_crm_sync`
* **Produces:** MEDDPICC deal scorecard, deal velocity assessment, and recommended next steps to prevent deal slippage.

### 3.2 `outreach-drafting`
* **Purpose:** Generates personalized cold outreach, follow-up emails, and LinkedIn messaging tailored to prospect persona.
* **Tier:** `aid`
* **Trigger:** **User** — Outreach request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "prospectInfo": { "type": "object", "description": "Title, company, recent news, trigger events" },
      "messageType": { "type": "string", "enum": ["cold_email", "linkedin_inmail", "follow_up", "breakup"] }
    },
    "required": ["prospectInfo", "messageType"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal sales playbook KB
* **Produces:** Personalized message draft, subject line options, and call-to-action suggestions.

### 3.3 `sales-account-brief-generator`
* **Purpose:** Compiles full company research dossiers and stakeholder maps prior to sales discovery calls.
* **Tier:** `aid`
* **Trigger:** **User** — Dossier request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "companyDomain": { "type": "string" },
      "targetPersonas": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["companyDomain"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal sales KB and web search
* **Produces:** Comprehensive account brief, company overview, tech stack profile, and MEDDPICC initial outline.

### 3.4 `pipeline-ops`
* **Purpose:** Executes CRM updates, stage movements, close date modifications, and forecasting notes.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Stage update triggered
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "dealId": { "type": "string" },
      "targetStage": { "type": "string" },
      "notes": { "type": "string" }
    },
    "required": ["dealId", "targetStage"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `sales_crm_sync`
* **Produces:** Updated CRM deal record payload and updated pipeline forecast metrics.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`sales_crm_sync`**:
   * **Tier:** `represent`
   * **Inputs:** `dealData` (object), `action` (string)
   * **Config / Secrets:** `crmApiKey` (secret)
   * **Purpose:** Connects directly to Salesforce / HubSpot REST APIs to perform read/write sync operations on deals and contacts.

---

## 5. Major Data Types & Contracts

### 5.1 MEDDPICC Deal Health Schema
```typescript
interface MeddpiccScorecard {
  dealId: string;
  overallScore: number; // 0 - 100
  metrics: { score: number; notes: string };
  economicBuyer: { score: number; identified: boolean; contactId?: string };
  decisionCriteria: { score: number; documented: boolean };
  decisionProcess: { score: number; timelineKnown: boolean };
  paperProcess: { score: number; legalInvolved: boolean };
  identifyPain: { score: number; quantifiedPainUSD?: number };
  champion: { score: number; contactId?: string };
  competition: { score: number; primaryCompetitor?: string };
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Multi-CRM integration logic is coupled within a single tool (`sales_crm_sync`) rather than separated by vendor (Salesforce vs. HubSpot vs. Pipedrive).
   - `outreach-drafting` needs explicit tone configuration (e.g. formal vs concise) to prevent overly verbose AI generated emails.

2. **Enhancement Opportunities:**
   - Implement real-time call transcript analysis integration (e.g., Gong / Chorus API) to automatically update MEDDPICC scores post-call.
