# HR Assistant Documentation (Version 9)

**Assistant ID:** `hr`
**Assistant Name:** Human Resources & Talent Acquisition Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Human Resources & Talent Acquisition Assistant manages recruiting workflows, candidate screening, structured interview rubrics, interview scheduling, and EEOC/diversity compliance auditing.

---

## 2. Domain Knowledge

The HR Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/eeoc-compliance-guidelines.md`**: EEOC laws (Title VII, ADA, ADEA), 4/5ths rule for adverse impact, non-discriminatory hiring guidelines, and structured interviewing mandates.
2. **`knowledge/structured-interview-rubrics.md`**: Competency-based interview question banks, Behaviorally Anchored Rating Scales (BARS), STAR method evaluation, and objective scoring guides.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `hr-screen-resume`
* **Purpose:** Evaluates candidate resumes against job requirement specifications to produce objective fit scores.
* **Tier:** `advise`
* **Trigger:** **User** — Resume submitted
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "resumeText": { "type": "string" },
      "jobRequirements": { "type": "object" }
    },
    "required": ["resumeText", "jobRequirements"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Screening endpoint
* **Produces:** Candidate role fit score, missing requirements list, and recommendation.

### 3.2 `hr-assess-candidate`
* **Purpose:** Synthesizes interviewer feedback into structured candidate scorecards within connected ATS platforms.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Score candidate
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "candidateName": { "type": "string" },
      "assessmentData": { "type": "object" }
    },
    "required": ["candidateName", "assessmentData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** ATS API
* **Produces:** Normalized candidate evaluation scorecard payload.

### 3.3 `hr-draft-jd-interview-kit`
* **Purpose:** Drafts non-biased job descriptions and structured competency interview kits.
* **Tier:** `aid`
* **Trigger:** **User** — JD requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "role": { "type": "string" },
      "level": { "type": "string" },
      "competencies": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["role"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** HR rubrics KB
* **Produces:** Inclusive job description draft and BARS interview scorecard kit.

### 3.4 `hr-interview-scheduling-user`
* **Purpose:** Coordinates interview booking slots between candidates and interview panels upon recruiter request.
* **Tier:** `aid`
* **Trigger:** **User** — Manual booking
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "candidateName": { "type": "string" },
      "timeSlot": { "type": "string" }
    },
    "required": ["candidateName", "timeSlot"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Calendar API
* **Produces:** Draft interview invitation calendar entry.

### 3.5 `hr-interview-scheduling-automated`
* **Purpose:** Automatically dispatches calendar invites when candidates pass automated screening thresholds.
* **Tier:** `aid`
* **Trigger:** **Event** — Screening passed
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "candidatePayload": { "type": "object" }
    },
    "required": ["candidatePayload"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "calendarId": { "type": "string" }
    },
    "required": ["calendarId"]
  }
  ```
* **Consumes:** Calendar API
* **Produces:** Confirmed interview calendar booking dispatch record.

### 3.6 `hr-compliance-check`
* **Purpose:** Audits recruiting funnels for EEOC compliance and adverse impact against the 4/5ths rule.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "dateRange": { "type": "string" },
      "filters": { "type": "object" }
    },
    "required": ["dateRange"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal compliance rules
* **Produces:** EEOC compliance report, adverse impact ratio calculations, and risk mitigation steps.

### 3.7 `hr-hiring-analytics`
* **Purpose:** Computes talent pipeline velocity, source yield, and time-to-hire metrics.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly report
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "dateRange": { "type": "string" }
    },
    "required": ["dateRange"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** ATS telemetry
* **Produces:** Pipeline conversion and velocity report.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: HR Assistant executes actions directly via ATS and Calendar APIs configured within skills.)*

---

## 5. Major Data Types & Contracts

### 5.1 Candidate Evaluation Scorecard
```typescript
interface CandidateScorecard {
  candidateId: string;
  roleId: string;
  interviewerId: string;
  overallRating: 1 | 2 | 3 | 4 | 5;
  competencyScores: Array<{ competency: string; score: 1 | 2 | 3 | 4 | 5; notes: string }>;
  recommendation: 'strong_hire' | 'hire' | 'no_hire' | 'strong_no_hire';
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Candidate resume screening (`hr-screen-resume`) must strictly exclude protected demographic characteristics to prevent bias.
   - Calendar booking conflicts across complex panel interviews require advanced calendar availability matching algorithms.

2. **Enhancement Opportunities:**
   - Implement automatic PII masking (names, addresses, graduation years) prior to LLM resume scoring.
