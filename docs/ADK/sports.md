# Sports Assistant Documentation (Version 9)

**Assistant ID:** `sports`
**Assistant Name:** Sports Analytics & Tactical Intelligence Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Sports Analytics & Tactical Intelligence Assistant provides advanced sports telemetry and data-driven insights. It operates under **strict dual-group isolation** (`policies.enforceGroupIsolation: true`), partitioning tactical roster evaluation and opponent scouting (Performance Group - Group A) from wagering odds analysis, Kelly criterion bankroll management, and line shift alerts (Wagering Group - Group B).

---

## 2. Domain Knowledge

The Sports Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/xgboost-sports-metrics.md`**: Expected goals (xG), Expected Possession Value (EPV), player efficiency ratings (PER), and XGBoost match outcome feature weights.
2. **`knowledge/bankroll-mathematics.md`**: Fractional Kelly Criterion formulas, expected value (+EV) calculations, closing line value (CLV) benchmarks, and variance risk management.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 Performance Group (Group A - Isolated)

#### `sports-tactical-roster-evaluator`
* **Purpose:** Evaluates player performance metrics and opponent tactical matchups prior to matches.
* **Tier:** `advise`
* **Trigger:** **Event** — Pre-match window
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "playerMetrics": { "type": "array", "items": { "type": "object" } },
      "opponentData": { "type": "object" }
    },
    "required": ["playerMetrics", "opponentData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Sports telemetry engine
* **Produces:** Tactical lineup adjustments, player matchup advantages, and formation recommendations.

#### `sports-battlecard-creator`
* **Purpose:** Prepares comprehensive scouting reports and battlecards detailing opponent weaknesses.
* **Tier:** `aid`
* **Trigger:** **Event** — Pre-match window
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "opponentData": { "type": "object" },
      "matchupInfo": { "type": "object" }
    },
    "required": ["opponentData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Scouting database
* **Produces:** Opponent tactical scouting battlecard and key matchup callouts.

#### `sports-scouting-alert-dispatcher`
* **Purpose:** Dispatches scouting and player health alert dispatches to coaching staff.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Player health or tactical change
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "playerData": { "type": "object" },
      "alertSpecs": { "type": "object" }
    },
    "required": ["playerData", "alertSpecs"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal messaging systems
* **Produces:** Timestamped scouting alert dispatch logs.

---

### 3.2 Wagering Group (Group B - Isolated)

#### `sports-matchup-odds-explainer`
* **Purpose:** Explains market odds movements, line shifts, and implied probability variances.
* **Tier:** `advise`
* **Trigger:** **Event** — Line movement detected
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "oddsData": { "type": "object" },
      "marketData": { "type": "object" }
    },
    "required": ["oddsData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Odds feed APIs
* **Produces:** Market line movement analysis and public consensus breakdown.

#### `sports-bankroll-co-pilot`
* **Purpose:** Calculates optimal bet sizing based on fractional Kelly Criterion and current bankroll rules.
* **Tier:** `aid`
* **Trigger:** **Schedule** — Daily check
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "bankrollRules": { "type": "object", "description": "Current balance, max drawdown threshold" },
      "unitLimits": { "type": "object" }
    },
    "required": ["bankrollRules"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Bankroll math engine
* **Produces:** Recommended unit stake allocations and risk evaluation.

#### `sports-line-alert-dispatcher`
* **Purpose:** Dispatches push notifications when line movements cross favorable target thresholds.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Threshold line shift
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "lineData": { "type": "object" },
      "bankrollState": { "type": "object" }
    },
    "required": ["lineData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Push notification gateway
* **Produces:** Contextualized line shift alerts and dispatch confirmations.

#### `sports-predictor-ad-hoc`
* **Purpose:** Runs real-time game simulations and win probability modeling upon user request.
* **Tier:** `advise`
* **Trigger:** **User** — Match modeling requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "event": { "type": "string" },
      "sport": { "type": "string" },
      "gameStatus": { "type": "object" }
    },
    "required": ["event", "sport"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Live match simulation engine
* **Produces:** Win probability curves and expected score distribution.

#### `sports-ingame-predictive-modeling-scheduled`
* **Purpose:** Periodically updates win probabilities across active live sports matches.
* **Tier:** `advise`
* **Trigger:** **Schedule** — 5-minute interval
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
      "matchIds": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["matchIds"]
  }
  ```
* **Consumes:** Live games store
* **Produces:** Updated win probability delta reports for live games.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Sports Assistant relies on isolated group higher-order skills using sports data feeds.)*

---

## 5. Major Data Types & Contracts

### 5.1 Tactical Roster Matchup (Group A)
```typescript
interface RosterMatchup {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  keyPlayerMatchups: Array<{ homePlayer: string; awayPlayer: string; advantageScore: number }>;
  expectedFormations: { home: string; away: string };
}
```

### 5.2 Market Odds Edge Object (Group B)
```typescript
interface MarketEdge {
  eventId: string;
  marketName: 'moneyline' | 'spread' | 'total';
  bookmaker: string;
  offeredOdds: number;
  modelImpliedProbability: number;
  expectedValueEV: number; // e.g. +0.05
  recommendedKellyUnits: number;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Group isolation (`policies.enforceGroupIsolation`) is declared in manifest but requires strict runtime validation at `agent-runtime` level to prevent cross-contamination of wagering data with team tactical data.
   - Odds feeds experience rate-limiting during high-volume sports windows (e.g. NFL Sundays).

2. **Enhancement Opportunities:**
   - Implement real-time WebSocket streaming for live in-game sports telemetry and line movements.
