# Career Assistant Documentation (Version 9)

**Assistant ID:** `career`
**Assistant Name:** Career & Executive Search Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Career & Executive Search Assistant orchestrates end-to-end job discovery, ATS resume and cover letter template optimization, candidate positioning, interview preparation, automated recruitment outreach, and career growth roadmap tracking.

---

## 2. Domain Knowledge

The Career Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/resume-parsing-standards.md`**: Defines canonical JSON schema mappings for ATS parsers (Greenhouse, Lever, Workday) and parsing heuristics.
2. **`knowledge/ats-optimization-rules.md`**: Outlines keyword density algorithms, section formatting rules, and typography/header constraints to pass automated screening filters.
3. **`knowledge/executive-comp-benchmarks.md`**: Contains compensation data structures, equity valuation models (BSM/409A), base salary percentile benchmarks, and executive perk negotiation rules.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `career-job-market-positioning-evaluator`
* **Purpose:** Evaluates executive/professional positioning against target industry sectors and market demand.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly market audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "resume": { "type": "string", "description": "Candidate full resume text or profile JSON" },
      "market": { "type": "string", "description": "Target geographic or remote sector market" }
    },
    "required": ["resume", "market"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_job_discovery`, `career_rank`
* **Produces:** Positioning recommendations, competitive strength analysis, and target salary ranges.

### 3.2 `career-job-discovery-fit-ranking`
* **Purpose:** Sweeps job boards to discover, score, and rank open positions matching candidate criteria.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Daily sweep
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "jobTitles": { "type": "array", "items": { "type": "string" } },
      "locations": { "type": "array", "items": { "type": "string" } },
      "minSalary": { "type": "number", "description": "Minimum acceptable compensation" }
    },
    "required": ["jobTitles", "locations"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "premiumJobBoards": { "type": "array", "items": { "type": "string" } },
      "freeJobBoards": { "type": "array", "items": { "type": "string" } }
    }
  }
  ```
* **Consumes:** `career_job_discovery`
* **Produces:** Ranked list of job opportunities with alignment scores.

### 3.3 `career-resume-template-manager`
* **Purpose:** Manages resume versions and renders ATS-compliant document templates.
* **Tier:** `aid`
* **Trigger:** **User** — Template request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "templateId": { "type": "string" },
      "content": { "type": "object", "description": "Resume sections and experience entries" },
      "tags": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["templateId", "content"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Local document storage
* **Produces:** Rendered resume document metadata and formatted output text.

### 3.4 `career-interview-compensation-battlecard-creator`
* **Purpose:** Prepares custom interview strategy briefings, executive negotiation tactics, and compensation battlecards.
* **Tier:** `aid`
* **Trigger:** **Event** — Interview scheduled
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "company": { "type": "string" },
      "role": { "type": "string" },
      "context": { "type": "string", "description": "Interview stage, panel details, or offer terms" }
    },
    "required": ["company", "role"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_interview_prep`
* **Produces:** Tactical interview briefing, anticipated questions, and negotiation counters.

### 3.5 `career-interview-practice-mock-interviewer`
* **Purpose:** Conducts interactive mock interviews with real-time feedback and answer scoring.
* **Tier:** `aid`
* **Trigger:** **User** — Practice session requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "role": { "type": "string" },
      "company": { "type": "string" },
      "battlecard": { "type": "object", "description": "Reference strategy battlecard" }
    },
    "required": ["role"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_interview_prep`
* **Produces:** Mock conversation transcript, STAR response scoring, and improvement coaching.

### 3.6 `career-governed-application-outreach-manager`
* **Purpose:** Coordinates governed job applications and outreach communications with approval gates.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Outreach initiated
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "applicationData": { "type": "object" },
      "outreachData": { "type": "object" }
    },
    "required": ["applicationData", "outreachData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_apply_execute`
* **Produces:** Application submission audit trail and confirmation records.

### 3.7 `career-application-execution-orchestrator`
* **Purpose:** Automates portal applications across multiple target listings.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Multi-apply submitted
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "targetRoles": { "type": "array", "items": { "type": "string" } },
      "listings": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["listings"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_apply_execute`
* **Produces:** Portal submission records and status log.

### 3.8 `career-portal-recruiter-workflow`
* **Purpose:** Responds to recruiter outreach and manages portal messages.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Recruiter message received
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "targetCompany": { "type": "string" },
      "targetPerson": { "type": "string" },
      "relationshipStage": { "type": "string" }
    },
    "required": ["targetCompany", "targetPerson"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_networking_outreach`
* **Produces:** Outbound message dispatches and dialogue updates.

### 3.9 `career-pipeline-outcome-tracker`
* **Purpose:** Tracks job application progress, interview feedback, and offer outcomes.
* **Tier:** `aid`
* **Trigger:** **Event** — Application status changed
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "targetRole": { "type": "string" },
      "company": { "type": "string" },
      "status": { "type": "string" },
      "offerDetails": { "type": "object" }
    },
    "required": ["targetRole", "company", "status"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `career_outcome`
* **Produces:** Pipeline metric reports and funnel progression logs.

### 3.10 `career-upskill-role-targeted-learning-planner`
* **Purpose:** Identifies skill gaps and builds role-targeted learning plans.
* **Tier:** `advise`
* **Trigger:** **Event** — Skill gap identified
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "gaps": { "type": "array", "items": { "type": "string" } },
      "targetRole": { "type": "string" }
    },
    "required": ["gaps", "targetRole"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal learning knowledge base
* **Produces:** Tailored upskilling roadmap and course recommendations.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`career_profile_intake`**:
   * **Tier:** `advise`
   * **Inputs:** `rawResumeText` (string)
   * **Purpose:** Parses unstructured text into a canonical candidate JSON schema.
2. **`career_job_discovery`**:
   * **Tier:** `advise`
   * **Inputs:** `searchQuery` (string)
   * **Config / Secrets:** `jobBoardApiKey` (secret)
   * **Purpose:** Queries external job search engines and returns raw listing payloads.
3. **`career_apply_execute`**:
   * **Tier:** `represent`
   * **Inputs:** `payload` (object), `credentials` (object)
   * **Config / Secrets:** `portalEndpoint` (secret)
   * **Purpose:** Performs HTTP form post / API submission to candidate ATS portals.

---

## 5. Major Data Types & Contracts

### 5.1 Candidate Profile Schema (`resume.json`)
```typescript
interface CandidateProfile {
  id: string;
  contact: { name: string; email: string; phone?: string; linkedin?: string };
  summary: string;
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    achievements: string[];
  }>;
  skills: string[];
  education: Array<{ degree: string; institution: string; year: number }>;
}
```

### 5.2 Application Outcome Object
```typescript
interface ApplicationOutcome {
  applicationId: string;
  company: string;
  role: string;
  stage: 'sourced' | 'applied' | 'screening' | 'interviewing' | 'offer' | 'rejected';
  appliedDate: string;
  offerDetails?: { baseSalary: number; equity?: string; bonus?: number };
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - External job board integration currently lacks standardized rate-limiting handling across diverse API providers (Workday vs. Lever vs. Greenhouse).
   - Mock interview state management relies on ephemeral session context rather than storing conversation state in `services/artifacts`.

2. **Enhancement Opportunities:**
   - Implement direct OAuth authentication with job portals (e.g., LinkedIn / Workday) rather than storing portal credentials directly in runtime state.
   - Introduce automated background web scraping fallbacks when job boards lack open public REST APIs.
