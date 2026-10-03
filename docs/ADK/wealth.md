# Wealth Assistant Documentation (Version 9)

**Assistant ID:** `wealth`
**Assistant Name:** Wealth Management & Personal Portfolio Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Wealth Management & Personal Portfolio Assistant serves financial advisors, family offices, and individual investors. It refreshes live market securities pricing, evaluates asset allocation drift, automates bill payments and portfolio rebalancing, and generates investment research reports.

---

## 2. Domain Knowledge

The Wealth Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/modern-portfolio-theory.md`**: Modern Portfolio Theory (MPT), efficient frontier optimization, Sharpe ratios, beta calculations, and asset class correlation matrices.
2. **`knowledge/tax-efficient-withdrawal-rules.md`**: Tax-loss harvesting rules, capital gains tax brackets, required minimum distributions (RMDs), and tax-advantaged account withdrawal sequences (Roth vs. Traditional IRA vs. Taxable).

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `investment-market-data`
* **Purpose:** Refreshes live market security prices, equity indices, and mutual fund NAVs from brokerage feeds.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Schedule** — 15-minute refresh
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "securities": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["securities"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string", "description": "Brokerage feed URL" }
    }
  }
  ```
* **Consumes:** Brokerage feed API
* **Produces:** Updated market pricing payload and portfolio valuation record.

### 3.2 `portfolio-risk-advisory`
* **Purpose:** Analyzes portfolio allocation drift, calculates Sharpe ratio metrics, and provides rebalancing advice.
* **Tier:** `advise`
* **Trigger:** **Event** — Market data updated
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "portfolioData": { "type": "object" },
      "riskTolerance": { "type": "string", "enum": ["conservative", "moderate", "aggressive"] }
    },
    "required": ["portfolioData", "riskTolerance"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Portfolio rules engine
* **Produces:** Asset allocation drift report, risk exposure warnings, and rebalancing recommendations.

### 3.3 `bill-pay-rebalancing`
* **Purpose:** Executes recurring bill payments and trade rebalance orders through connected custodial accounts.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Schedule** — Monthly cycle
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "obligations": { "type": "array", "items": { "type": "string" } },
      "amounts": { "type": "array", "items": { "type": "number" } }
    },
    "required": ["obligations", "amounts"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Banking and brokerage custodial APIs
* **Produces:** Executed payment logs, trade order confirmations, and cash balance audit trail.

### 3.4 `research-planning`
* **Purpose:** Synthesizes market research, asset class fundamentals, and macro trends into client research reports.
* **Tier:** `aid`
* **Trigger:** **User** — Research requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "portfolioData": { "type": "object" },
      "targetAsset": { "type": "string" }
    },
    "required": ["targetAsset"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Market research data feeds
* **Produces:** Investment thesis document, asset research summary, and risk disclaimers.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Wealth Assistant integrates with brokerage feeds and banking endpoints configured inside higher-order skills.)*

---

## 5. Major Data Types & Contracts

### 5.1 Wealth Portfolio Schema
```typescript
interface WealthPortfolio {
  portfolioId: string;
  clientName: string;
  totalValueUSD: number;
  cashBalanceUSD: number;
  positions: Array<{
    ticker: string;
    shares: number;
    currentPrice: number;
    assetClass: 'equity' | 'fixed_income' | 'real_estate' | 'crypto' | 'cash';
    weightPercentage: number;
  }>;
  targetAllocation: Record<string, number>; // e.g. { equity: 60, fixed_income: 40 }
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Financial trade execution (`bill-pay-rebalancing`) requires strict transaction auditing and dual-authorization mechanisms.
   - Market data refresh rate-limiting requires distributed caching in Redis (`services/brain`).

2. **Enhancement Opportunities:**
   - Integrate automated tax-loss harvesting algorithms into `portfolio-risk-advisory`.
