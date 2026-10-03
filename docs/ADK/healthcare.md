# Healthcare Assistant Documentation (Version 9)

**Assistant ID:** `healthcare`
**Assistant Name:** Clinical Practice & Care Operations Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Clinical Practice & Care Operations Assistant supports healthcare providers, clinic administrators, and care coordinators. It evaluates clinical workflow efficiency, provides evidence-based differential diagnosis decision support, generates patient care plans and educational briefings, and coordinates EHR intake and specialist referrals under strict HIPAA compliance policies (`policies.hipaaComplianceEnforced: true`).

---

## 2. Domain Knowledge

The Healthcare Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/hipaa-compliance-standards.md`**: PHI handling rules, Minimum Necessary standards, Business Associate Agreement (BAA) protocols, and access control audit guidelines.
2. **`knowledge/clinical-guidelines-base.md`**: Evidence-based clinical guidelines, USPSTF screening recommendations, CDC immunization schedules, and chronic disease management algorithms.
3. **`knowledge/EHR-integration-specs.md`**: HL7 FHIR R4 resource mapping, SMART on FHIR authorization protocols, Epic/Cerner/AthenaHealth REST APIs, and CPT/ICD-10 coding standards.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `healthcare-clinical-practice-workflow-evaluator`
* **Purpose:** Evaluates clinical throughput, scheduling bottlenecks, and clinic operational metrics.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly workflow scan
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "practiceData": { "type": "object" },
      "metrics": { "type": "object" }
    },
    "required": ["practiceData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Practice telemetry data
* **Produces:** Clinic efficiency evaluation, patient wait time analysis, and scheduling recommendations.

### 3.2 `healthcare-clinical-decision-support-evaluator`
* **Purpose:** Analyzes patient symptoms and clinical history to provide evidence-based differential diagnosis support and treatment guidelines.
* **Tier:** `advise`
* **Trigger:** **User** — Case analysis requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "patientData": { "type": "object", "description": "De-identified patient clinical history, vitals, labs" },
      "symptoms": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["patientData", "symptoms"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Clinical guidelines knowledge base
* **Produces:** Differential diagnosis briefing, recommended diagnostic tests, and guideline citations.

### 3.3 `healthcare-patient-care-plan-educational-briefing-copilot`
* **Purpose:** Crafts personalized patient care plans, discharge instructions, and educational materials.
* **Tier:** `aid`
* **Trigger:** **User** — Care plan requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "patientProfile": { "type": "object" },
      "objectives": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["patientProfile"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Medical literature KB
* **Produces:** Patient education briefing draft and printable care plan document.

### 3.4 `healthcare-appointment-patient-intake-dispatcher`
* **Purpose:** Processes incoming patient intake questionnaires and synchronizes structured entries into EHR systems.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Intake submitted
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "appointmentData": { "type": "object" },
      "intakeForm": { "type": "object" }
    },
    "required": ["appointmentData", "intakeForm"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** EHR FHIR API (Epic/Athena)
* **Produces:** Updated FHIR Patient resource payload and SMS confirmation dispatch record.

### 3.5 `care-resource-referral-coordinator`
* **Purpose:** Coordinates specialist referrals, insurance prior-authorization paperwork, and appointment booking.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Referral requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "resourceType": { "type": "string", "description": "e.g., Cardiology, Physical Therapy" },
      "patientNeed": { "type": "string" }
    },
    "required": ["resourceType", "patientNeed"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Referral gateway API
* **Produces:** Specialist referral booking confirmation and prior-authorization documentation.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Healthcare Assistant operates directly through FHIR EHR integration endpoints.)*

---

## 5. Major Data Types & Contracts

### 5.1 Patient Intake FHIR R4 Payload
```typescript
interface PatientIntakeFhirPayload {
  resourceType: 'Patient';
  id: string;
  identifier: Array<{ system: string; value: string }>;
  name: Array<{ family: string; given: string[] }>;
  telecom: Array<{ system: 'phone' | 'email'; value: string }>;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  medicalConditions: string[]; // ICD-10 codes
  allergies: string[];
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - De-identification / PHI sanitization must be strictly enforced before passing clinical notes to LLM reasoning modules.
   - FHIR SMART on OAuth authorization tokens require encrypted token vault storage (`services/vault`).

2. **Enhancement Opportunities:**
   - Incorporate automated PHI redaction middleware into `agent-runtime` for all healthcare assistant requests.
