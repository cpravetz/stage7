# Education Assistant Documentation (Version 9)

**Assistant ID:** `education`
**Assistant Name:** Education & Curriculum Design Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Education & Curriculum Design Assistant supports educators, instructional designers, and e-learning platforms. It monitors learner progress telemetry, constructs adaptive learning paths using spaced repetition algorithms, drafts Bloom's Taxonomy-aligned assessments, and curates educational resource libraries.

---

## 2. Domain Knowledge

The Education Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/blooms-taxonomy-framework.md`**: Cognitive domain levels (Remember, Understand, Apply, Analyze, Evaluate, Create), question stem verbs, and rubric scoring tiers.
2. **`knowledge/spaced-repetition-algorithms.md`**: SuperMemo SM-2 and Leitner box interval formulas, memory retention decay curves, and optimal review schedule parameters.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `education-learner-insight`
* **Purpose:** Analyzes student engagement and quiz telemetry from Learning Management Systems (LMS).
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly scan
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "learnerData": { "type": "object", "description": "Student activity logs, quiz performance" }
    },
    "required": ["learnerData"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "apiKey": { "type": "string", "description": "LMS API secret key" }
    }
  }
  ```
* **Consumes:** LMS API (Canvas / Moodle)
* **Produces:** Student competency profiles, gap analysis, and topic mastery scorecards.

### 3.2 `education-adaptive-personalization`
* **Purpose:** Constructs personalized lesson sequences and spaced-repetition review schedules.
* **Tier:** `advise`
* **Trigger:** **User** — Path request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "learnerId": { "type": "string" },
      "courseContext": { "type": "object" }
    },
    "required": ["learnerId"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `education-learner-insight`
* **Produces:** Personalized lesson study sequence and review calendar.

### 3.3 `education-lesson-assessment-drafting-user`
* **Purpose:** Drafts quizzes, rubrics, and exam units aligned with target cognitive Bloom levels upon user request.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Assessment request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "subject": { "type": "string" },
      "topic": { "type": "string" },
      "gradeLevel": { "type": "string" }
    },
    "required": ["subject", "topic"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Spaced repetition store
* **Produces:** Formatted assessment question unit and answer key.

### 3.4 `education-lesson-assessment-drafting-scheduled`
* **Purpose:** Periodically audits course curriculum gaps and drafts automated review quizzes.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Schedule** — Weekly audit
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
      "courseId": { "type": "string" }
    },
    "required": ["courseId"]
  }
  ```
* **Consumes:** Local course store
* **Produces:** Automated review quiz package.

### 3.5 `education-resource-library`
* **Purpose:** Searches and curates open-educational resources (OER), media, and reading materials.
* **Tier:** `aid`
* **Trigger:** **User** — Library search
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "subject": { "type": "string" },
      "level": { "type": "string" },
      "accessibility": { "type": "string" }
    },
    "required": ["subject"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Resource KB
* **Produces:** Curated list of educational materials and citations.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Education Assistant operates directly via LMS connectors in higher-order skills.)*

---

## 5. Major Data Types & Contracts

### 5.1 Assessment Question Unit Schema
```typescript
interface AssessmentQuestionUnit {
  assessmentId: string;
  topic: string;
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  questions: Array<{
    questionId: string;
    prompt: string;
    questionType: 'multiple_choice' | 'short_answer' | 'essay';
    options?: string[];
    correctAnswer: string;
    explanation: string;
  }>;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Standardized LTI (Learning Tools Interoperability) v1.3 protocol support should be implemented for seamless LMS embedding.
   - Question generation needs hallucination checks for specialized STEM subjects.

2. **Enhancement Opportunities:**
   - Add QTI (Question and Test Interoperability) XML export to allow direct import into Canvas / Blackboard gradebooks.
