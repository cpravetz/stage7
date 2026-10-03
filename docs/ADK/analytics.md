# Analytics Assistant Documentation (Version 9)

**Assistant ID:** `analytics`
**Assistant Name:** Data Analytics & Business Intelligence Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Data Analytics & Business Intelligence Assistant enables data-driven decision making across enterprise organizations. It executes grounded, read-only SQL queries against corporate data warehouses (Snowflake, BigQuery, PostgreSQL, Databricks) to answer ad-hoc business questions, generate visual chart specifications, and monitor scheduled metric trends over time.

---

## 2. Domain Knowledge

The Analytics Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/warehouse-schema-mappings.md`**: Enterprise data warehouse entity-relationship diagrams, canonical table join paths, foreign key constraints, and column data dictionary definitions.
2. **`knowledge/kpi-dictionary.md`**: Standardized corporate KPI mathematical formulas (ARR, MRR, LTV, CAC, Net Churn Rate, Gross Margin, DAU/MAU) and SQL aggregation expressions.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `analytics-adhoc-query-evaluator`
* **Purpose:** Translates natural language business questions into grounded, optimized read-only SQL queries, executes them against configured data warehouses, and formats data into visual chart specifications.
* **Tier:** `advise`
* **Trigger:** **User** — Ad-hoc question asked
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "Natural language business query" },
      "metric": { "type": "string", "description": "Optional target KPI metric name" },
      "filters": { "type": "object", "description": "Date ranges, regions, or customer segment filters" }
    },
    "required": ["question"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "apiKey": { "type": "string", "description": "Secret database connection credential" },
      "provider": { "type": "string", "enum": ["snowflake", "bigquery", "postgres", "databricks"] }
    },
    "required": ["endpointUrl", "apiKey", "provider"]
  }
  ```
* **Consumes:** SQL Data Warehouse (Snowflake / BigQuery / PostgreSQL / Databricks)
* **Produces:** Grounded data response, executed SQL query, tabular dataset, and visual chart specs.

### 3.2 `analytics-scheduled-trend-monitor`
* **Purpose:** Periodically executes scheduled metric SQL queries to monitor dataset trends, compute period-over-period delta variance, and alert on statistically significant metric anomalies.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Periodic trend check
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "metric": { "type": "string" },
      "dataset": { "type": "string" },
      "period": { "type": "string", "enum": ["daily", "weekly", "monthly"] }
    },
    "required": ["metric", "dataset", "period"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "apiKey": { "type": "string" },
      "provider": { "type": "string", "enum": ["snowflake", "bigquery", "postgres", "databricks"] }
    },
    "required": ["endpointUrl", "apiKey", "provider"]
  }
  ```
* **Consumes:** SQL Data Warehouse
* **Produces:** Automated metric trend analysis report, trend direction indicators, and anomaly alerts.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Analytics Assistant executes database connections via higher-order skills using configured data warehouse credentials.)*

---

## 5. Major Data Types & Contracts

### 5.1 Analytics Query Result
```typescript
interface AnalyticsQueryResult {
  queryId: string;
  naturalLanguageQuestion: string;
  generatedSql: string;
  executionTimeMs: number;
  rowCount: number;
  columns: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'date' }>;
  rows: Array<Record<string, unknown>>;
  visualizationSpec?: {
    chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'kpi_card';
    xAxisColumn: string;
    yAxisColumns: string[];
    title: string;
  };
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Generated SQL queries must strictly enforce read-only `SELECT` statements; destructive operations (`DROP`, `DELETE`, `UPDATE`) must be blocked by query validation middleware before execution.
   - Large result sets returned by ad-hoc queries can cause memory pressure in `services/tool-executor`; automatic pagination or truncation (max 1000 rows) is necessary.

2. **Enhancement Opportunities:**
   - Integrate semantic layer modeling APIs (e.g. dbt Semantic Layer or Cube.js API) to decouple metric logic from raw SQL generation.
