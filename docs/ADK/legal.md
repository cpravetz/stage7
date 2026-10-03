# Legal Assistant Documentation (Version 9)

**Assistant ID:** `legal`
**Assistant Name:** Legal & Compliance Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Legal & Compliance Assistant manages corporate legal operations, commercial contract reviews, statutory legal research, document operations (drafting, redlining, clause analysis, finalization), and regulatory compliance monitoring.

### Refactoring in Version 9
In Version 8, document operations were split using an `operation` enum (`draft`, `redline`, `clause`, `finalize`). In Version 9, enums have been eliminated from input schemas in favor of a single higher-order Skill (`legal-document-ops`) that infers user intent from natural language instructions and delegates execution to single-purpose lower-order tools (`legal_draft`, `legal_redline`, `legal_analyze_clauses`, `legal_finalize`).

---

## 2. Domain Knowledge

The Legal Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/contract-playbooks.md`**: Standard fallback clause playbooks, risk variance scoring rules, fallback negotiation clauses, and mandatory approval terms for commercial agreements (NDAs, MSAs, SOWs, SaaS Agreements).

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `contract-document-advisory-user`
* **Purpose:** Reviews commercial contract documents, identifies risk variances against corporate playbooks, and generates issue lists upon user request.
* **Tier:** `advise`
* **Trigger:** **User** — Contract review requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "contractText": { "type": "string" },
      "contractType": { "type": "string", "description": "e.g., NDA, MSA, SOW, SaaS" }
    },
    "required": ["contractText"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal clause playbook rules
* **Produces:** Clause risk assessment, deviation issue list, and recommended redline position.

### 3.2 `contract-document-advisory-scheduled`
* **Purpose:** Periodically scans contract repositories to identify expiring terms, auto-renewals, or non-standard provisions.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly sweep
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
      "contractSources": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["contractSources"]
  }
  ```
* **Consumes:** Contract repository store
* **Produces:** Contract risk sweep report and upcoming milestone alerts.

### 3.3 `legal-document-ops`
* **Purpose:** Single higher-order skill orchestrating legal document operations (drafting, redlining, clause analysis, and finalization) without routing enums.
* **Tier:** `aid`
* **Trigger:** **User** — Document work requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "instruction": { "type": "string", "description": "User intent statement describing requested document action" },
      "documentType": { "type": "string" },
      "partyDetails": { "type": "object" },
      "terms": { "type": "object" },
      "originalText": { "type": "string" },
      "proposedText": { "type": "string" },
      "clauseText": { "type": "string" },
      "targetStandard": { "type": "string" }
    },
    "required": ["instruction"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Clause library, playbook rules, `legal_draft`, `legal_redline`, `legal_analyze_clauses`, `legal_finalize`
* **Produces:** Draft document, redline markup with risk variance, clause comparison, or clean finalized document per request intent.

### 3.4 `legal-research`
* **Purpose:** Conducts statutory legal research, analyzes case precedents, and synthesizes legal memorandum briefings.
* **Tier:** `advise`
* **Trigger:** **User** — Research question asked
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "statuteQuery": { "type": "string" },
      "jurisdiction": { "type": "string" }
    },
    "required": ["statuteQuery"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** External legal research APIs
* **Produces:** Precedent research synthesis and statutory interpretation memorandum.

### 3.5 `compliance-tracking-user`
* **Purpose:** Checks operational processes against specific regulatory frameworks (GDPR, CCPA, HIPAA, SOC2).
* **Tier:** `advise`
* **Trigger:** **User** — Compliance check requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "regulation": { "type": "string" },
      "jurisdiction": { "type": "string" }
    },
    "required": ["regulation"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal compliance rules
* **Produces:** Regulatory risk scorecard and gap analysis.

### 3.6 `compliance-tracking-scheduled`
* **Purpose:** Periodically audits corporate controls against target regulatory compliance standards.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly audit
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
      "sources": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["sources"]
  }
  ```
* **Consumes:** Compliance repository store
* **Produces:** Periodic control audit report and non-compliance flags.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`legal_draft`**:
   * **Tier:** `aid`
   * **Inputs:** `documentType` (string), `partyDetails` (object), `terms` (object)
   * **Purpose:** Generates initial legal document drafts from standard clause templates.
2. **`legal_redline`**:
   * **Tier:** `aid`
   * **Inputs:** `originalText` (string), `proposedText` (string)
   * **Purpose:** Generates strike-through redline markup diffs and calculates risk variance.
3. **`legal_analyze_clauses`**:
   * **Tier:** `advise`
   * **Inputs:** `clauseText` (string), `targetStandard` (string)
   * **Purpose:** Compares target clause text against standard playbooks to produce risk scores.
4. **`legal_finalize`**:
   * **Tier:** `aid`
   * **Inputs:** `documentText` (string)
   * **Purpose:** Clean-formats approved legal documents into execution-ready final drafts.

---

## 5. Major Data Types & Contracts

### 5.1 Clause Risk Analysis Payload
```typescript
interface ClauseRiskAnalysis {
  clauseId: string;
  category: 'limitation_of_liability' | 'indemnification' | 'governing_law' | 'ip_ownership' | 'termination';
  foundText: string;
  standardPlaybookText: string;
  riskSeverity: 'low' | 'medium' | 'high' | 'critical';
  varianceReason: string;
  fallbackOption: string;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Redline generation output currently uses markdown diff syntax (`~~deleted~~` / `**inserted**`); direct export to DOCX with active Track Changes markup is required for enterprise legal workflows.
   - `legal-document-ops` requires strict validation when user instruction contains ambiguous intents that span both drafting and redlining.

2. **Enhancement Opportunities:**
   - Integrate `docx` generation libraries capable of embedding native XML Track Changes markup (`<w:del>` / `<w:ins>`) into generated Word files.
