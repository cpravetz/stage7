# Chief Technology Officer Assistant Documentation (Version 9)

**Assistant ID:** `cto`
**Assistant Name:** Chief Technology Officer Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Chief Technology Officer (CTO) Assistant provides strategic technical leadership, engineering operations guidance, and cloud infrastructure optimization. It evaluates architectural technical debt, optimizes multi-cloud spending, synthesizes war-room incident root causes, tracks DORA delivery health metrics, models disaster recovery (DR) compliance, and executes Infrastructure-as-Code (IaC) drift remediation under strict approval governance.

---

## 2. Domain Knowledge

The CTO Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/distributed-architecture.md`**: Microservices patterns, event-driven architecture standards, domain-driven design (DDD), API gateway topologies, and distributed consensus algorithms.
2. **`knowledge/dora-metrics.md`**: DevOps Research and Assessment (DORA) metrics definitions: Deployment Frequency (DF), Lead Time for Changes (LTFC), Change Failure Rate (CFR), and Mean Time to Recovery (MTTR).
3. **`knowledge/cloud-cost-baselines.md`**: AWS / GCP / Azure billing allocation models, compute reservation / savings plans, rightsizing heuristics, and unattached resource cleanup rules.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `cto-architecture-tech-debt-evaluator`
* **Purpose:** Evaluates software system architecture, identifies tech debt hotspots, and builds modernization roadmaps.
* **Tier:** `advise`
* **Trigger:** **User** — Modernization requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "systems": { "type": "array", "items": { "type": "string" } },
      "requirements": { "type": "object" }
    },
    "required": ["systems"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `cto-infrastructure-query`
* **Produces:** Architectural technical debt evaluation, risk ratings, and prioritized refactoring roadmap.

### 3.2 `cto-cloud-spend-infrastructure-optimizer`
* **Purpose:** Analyzes multi-cloud infrastructure billing records to identify idle resources, rightsizing opportunities, and cost reductions.
* **Tier:** `advise`
* **Trigger:** **User** — Spend review requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "billingRows": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["billingRows"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `cto-infrastructure-query`
* **Produces:** Cloud spend optimization recommendations, idle resource inventory, and projected savings breakdown.

### 3.3 `cto-incident-war-room-synthesizer`
* **Purpose:** Correlates real-time incident telemetry, deployment logs, and error traces during active outages to synthesize root cause hypotheses.
* **Tier:** `advise`
* **Trigger:** **User** — Correlation requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "signals": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["signals"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** `cto-infrastructure-query`
* **Produces:** Outage timeline synthesis, primary root-cause hypotheses, and recommended remediation options.

### 3.4 `cto-team-delivery-health-evaluator`
* **Purpose:** Computes team DORA delivery velocity and system reliability metrics.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "systems": { "type": "array", "items": { "type": "string" } },
      "period": { "type": "string" }
    },
    "required": ["systems"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "leadTimeDays": { "type": "number" },
      "mttrHours": { "type": "number" }
    }
  }
  ```
* **Consumes:** `calculate-dora-metrics`
* **Produces:** DORA scorecards (Elite, High, Medium, Low), velocity trends, and bottleneck analysis.

### 3.5 `cto-disaster-recovery-planner`
* **Purpose:** Evaluates backup topologies, replication lag, and failover automation against target RTO and RPO benchmarks.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "systems": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["systems"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "rtoTargetMinutes": { "type": "number" },
      "rpoTargetMinutes": { "type": "number" }
    }
  }
  ```
* **Consumes:** Internal DR rules
* **Produces:** RTO/RPO readiness scorecard and failover topology evaluation.

### 3.6 `cto-engineering-action-iac-drift-remediation`
* **Purpose:** Applies Terraform / CloudFormation IaC drift remediation commands to realign cloud state with declarative configuration.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Drift detected
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "payload": { "type": "object" },
      "dryRun": { "type": "boolean", "default": true }
    },
    "required": ["payload"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "token": { "type": "string", "description": "IaC automation token" }
    },
    "required": ["endpointUrl", "token"]
  }
  ```
* **Consumes:** IaC management REST API
* **Produces:** IaC plan execution result, state drift diff, and remediation logs.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

1. **`cto-infrastructure-query`**:
   * **Tier:** `advise`
   * **Inputs:** `target` (string), `filter` (object)
   * **Config / Secrets:** `cloudCredentials` (secret)
   * **Purpose:** Queries AWS / GCP / Datadog APIs for live resource state, metrics, and billing records.
2. **`calculate-dora-metrics`**:
   * **Tier:** `advise`
   * **Inputs:** `repoId` (string), `timeframe` (string)
   * **Config / Secrets:** `gitHubToken` (secret)
   * **Purpose:** Aggregates PR, commit, release, and incident timestamps to compute raw DORA metrics.

---

## 5. Major Data Types & Contracts

### 5.1 DORA Metrics Assessment Schema
```typescript
interface DoraMetricsAssessment {
  teamOrSystemId: string;
  timeframe: string;
  metrics: {
    deploymentFrequencyPerDay: number;
    leadTimeForChangesHours: number;
    changeFailureRatePercentage: number;
    meanTimeToRecoveryHours: number;
  };
  performanceTier: 'elite' | 'high' | 'medium' | 'low';
  improvementRecommendations: string[];
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - IaC drift remediation (`cto-engineering-action-iac-drift-remediation`) carries high operational risk; strict dry-run verification and mandatory human confirmation (`confirmBeforeSend`) are critical safeguards.
   - Cloud credential isolation must use least-privilege IAM roles via `services/vault`.

2. **Enhancement Opportunities:**
   - Integrate native OpenTelemetry tracing graph visualization for war-room incident synthesis.
