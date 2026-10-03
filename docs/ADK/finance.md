# Finance Assistant Documentation (Version 9)

**Assistant ID:** `finance`
**Assistant Name:** Corporate Finance & FP&A Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Corporate Finance & FP&A Assistant manages financial planning, corporate modeling, accounting compliance, budget vs. actuals (BVA) monitoring, and general ledger (GL) reporting.

---

## 2. Domain Knowledge

The Finance Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/gaap-ifrs-accounting-standards.md`**: GAAP and IFRS revenue recognition (ASC 606 / IFRS 15), lease accounting (ASC 842), capital expenditure rules, and inventory valuation methods.
2. **`knowledge/financial-modeling-rules.md`**: Three-statement financial modeling conventions (Income Statement, Balance Sheet, Cash Flow), DCF valuation models, and IRR/NPV calculations.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `finance-modeling-analysis`
* **Purpose:** Constructs dynamic three-statement financial models and scenario forecasts.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly refresh
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "modelType": { "type": "string", "enum": ["three_statement", "dcf", "lbo", "budget_forecast"] },
      "scenarioParams": { "type": "object", "description": "Growth rates, margin assumptions, capex schedule" }
    },
    "required": ["modelType", "scenarioParams"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Financial modeling engine
* **Produces:** Integrated financial forecast model, cash runway analysis, and valuation outputs.

### 3.2 `risk-regulatory-advisory`
* **Purpose:** Evaluates accounting risks, compliance disclosures, and regulatory GAAP/IFRS updates.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "riskParams": { "type": "object" },
      "regulatoryUpdates": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["riskParams"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Accounting rules KB
* **Produces:** Regulatory risk compliance summary and audit advisory notes.

### 3.3 `budget-tracking`
* **Purpose:** Monitors actual spend against department budgets and generates variance alerts.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Schedule** — Weekly BVA check
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "budgetData": { "type": "object" },
      "actuals": { "type": "object" }
    },
    "required": ["budgetData", "actuals"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** ERP general ledger
* **Produces:** Budget vs. Actual (BVA) variance breakdown and flag notifications.

### 3.4 `reporting-data-ops`
* **Purpose:** Generates executive financial statements and dispatches periodic closing reports.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Schedule** — Period close
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "reportType": { "type": "string", "enum": ["balance_sheet", "p_and_l", "cash_flow", "board_financial_deck"] },
      "dataRange": { "type": "string" }
    },
    "required": ["reportType", "dataRange"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Accounting ERP system
* **Produces:** Formatted financial statements and report dispatch logs.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Finance Assistant integrates directly with general ledger and ERP services via configured skills.)*

---

## 5. Major Data Types & Contracts

### 5.1 Financial Statement Model Object
```typescript
interface FinancialStatementModel {
  companyName: string;
  fiscalPeriod: string;
  incomeStatement: { revenue: number; cogs: number; opex: number; netIncome: number };
  balanceSheet: { assets: number; liabilities: number; equity: number };
  cashFlow: { operating: number; investing: number; financing: number; netCashChange: number };
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Financial models currently produce static structured JSON; excel formula (.xlsx) export capabilities need enhancement.
   - ERP connection tokens must strictly use encrypted vault storage (`services/vault`).

2. **Enhancement Opportunities:**
   - Integrate `xlsx` generation libraries to output native Excel financial models with active formulas.
