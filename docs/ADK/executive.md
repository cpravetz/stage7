# Executive Assistant Documentation (Version 9)

**Assistant ID:** `executive`
**Assistant Name:** Executive & Leadership Advisory Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Executive & Leadership Advisory Assistant serves C-suite executives and senior leaders. It provides executive coaching, synthesizes multi-rater 360-degree feedback, models corporate strategic risk scenarios, drafts executive speeches and board communications, and optimizes executive calendar focus and time allocation.

---

## 2. Domain Knowledge

The Executive Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/corporate-governance-standards.md`**: Board committee structures, fiduciary duty frameworks, SEC reporting disclosures, and governance best practices.
2. **`knowledge/executive-coaching-frameworks.md`**: Situational leadership models, emotional intelligence rubrics, executive presence frameworks, and conflict resolution playbooks.
3. **`knowledge/board-communication-templates.md`**: Board deck presentation structures, CEO shareholder letters, crisis communication briefs, and executive memo templates.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `executive-leadership-advisory`
* **Purpose:** Provides strategic leadership guidance, C-suite decision support, and stakeholder alignment strategies.
* **Tier:** `advise`
* **Trigger:** **User** — Leadership guidance requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "strategicContext": { "type": "string", "description": "Background situation or strategic decision required" },
      "stakeholderData": { "type": "object", "description": "Key board members, executives, or external stakeholders involved" }
    },
    "required": ["strategicContext"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal C-suite reasoning engine
* **Produces:** Advisory memorandum detailing decision options, trade-offs, and recommended action steps.

### 3.2 `executive-dev-career`
* **Purpose:** Assesses executive career development, core competency gaps, and long-term trajectory.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly review
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "developmentGoals": { "type": "array", "items": { "type": "string" } },
      "careerStage": { "type": "string", "description": "e.g., C-Suite, VP, Board Director" }
    },
    "required": ["developmentGoals", "careerStage"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Leadership competency matrix
* **Produces:** Strategic executive development plan and target milestone roadmap.

### 3.3 `executive-feedback`
* **Purpose:** Synthesizes raw 360-degree feedback from board members, peers, and direct reports into actionable themes.
* **Tier:** `advise`
* **Trigger:** **Event** — 360 feedback ingested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "feedbackData": { "type": "array", "items": { "type": "object" } },
      "stakeholderList": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["feedbackData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Feedback analysis engine
* **Produces:** Anonymous theme synthesis, blind spot identification, and leadership coaching directives.

### 3.4 `executive-risk-scenario`
* **Purpose:** Models strategic corporate risks, market disruptions, and scenario impact matrices.
* **Tier:** `advise`
* **Trigger:** **User** — Scenario modeling requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "scenarioParams": { "type": "object", "description": "Parameters for market, financial, or operational shock" },
      "riskTolerance": { "type": "string" }
    },
    "required": ["scenarioParams"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Corporate risk decision framework
* **Produces:** Multi-scenario risk analysis, downside risk mitigation steps, and decision matrix.

### 3.5 `executive-speech-communication-copilot`
* **Purpose:** Crafts executive speeches, keynotes, board presentations, and town hall scripts.
* **Tier:** `aid`
* **Trigger:** **User** — Speech draft requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "audience": { "type": "string", "description": "e.g., Shareholders, All-Hands, Board of Directors" },
      "coreMessage": { "type": "string" },
      "keynoteTheme": { "type": "string" }
    },
    "required": ["audience", "coreMessage"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Communication style templates
* **Produces:** Draft keynote script, talking points, and Q&A narrative framework.

### 3.6 `executive-strategic-time-proxy`
* **Purpose:** Audits executive calendar allocations against strategic priorities to prevent operational drift.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly calendar audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "calendarExport": { "type": "object", "description": "Weekly calendar event data" },
      "priorityMatrix": { "type": "object", "description": "Declared executive priorities" }
    },
    "required": ["calendarExport", "priorityMatrix"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Focus score algorithm
* **Produces:** Time reallocation recommendations, focus score, and delegation suggestions.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Executive Assistant operates using higher-order reasoning skills without dedicated lower-order tools, relying on shared artifact and context mechanisms.)*

---

## 5. Major Data Types & Contracts

### 5.1 Feedback Synthesis Object
```typescript
interface FeedbackSynthesis {
  executiveId: string;
  surveyPeriod: string;
  strengths: string[];
  growthAreas: string[];
  themesByRaterGroup: {
    board?: string[];
    peers?: string[];
    directReports?: string[];
  };
  coachingRecommendations: string[];
}
```

### 5.2 Strategic Risk Matrix
```typescript
interface RiskScenarioResult {
  scenarioName: string;
  probability: 'low' | 'medium' | 'high';
  impactSeverity: 'catastrophic' | 'major' | 'moderate' | 'minor';
  keyRiskIndicators: string[];
  mitigationPlaybook: string[];
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Calendar analysis currently assumes standardized JSON exports; integration with live Google Workspace / Microsoft Graph calendar APIs is handled via external connectors rather than a native lower-order calendar tool in this assistant.
   - High sensitivity of 360 feedback data requires strict encryption in transit and rest within `services/artifacts`.

2. **Enhancement Opportunities:**
   - Integrate a native calendar connector tool (`executive_calendar_sync`) to stream real-time calendar updates into time-proxy evaluation.
   - Add automated board deck outline generation matching corporate pitch standards.
