# Warehouse Schema Mappings

The physical contract between the analytics assistant and the data warehouse. Both `analytics-adhoc-query-evaluator` and `analytics-scheduled-trend-monitor` declare the same `ANALYTICS_INPUT_SCHEMA`, the same `ANALYTICS_OUTPUT_SCHEMA`, and the same `ANALYTICS_CONFIG_SCHEMA`; whatever you expose in the warehouse has to satisfy this mapping, or the assistant will fall through to the local cache or report `not-connected`. This handbook documents the table and column names the assistant emits, the shapes it will accept back, and the failure modes that follow from a mismatch.

## The canonical table: `metrics`

When you give the assistant a `metric` and no explicit SQL, `buildQuery()` generates:

```sql
SELECT date, <metric> AS value
FROM metrics
WHERE date >= CURRENT_DATE - INTERVAL "<period>"[ AND <key> = <json value>]
ORDER BY date
```

So the warehouse contract is one wide daily table:

- **Table** — `metrics`
- **Time column** — `date`, ascending, one row per day per grain
- **Metric columns** — one column per metric, named exactly as the metric is named
- **Generated alias** — the metric is projected as `value`

A query written against any other table name will run only if you pass it explicitly via `query` or `warehouseQuery`. The generated form is the fallback, not the requirement — but keeping a `metrics` view in the warehouse means the assistant's own generated SQL resolves without operator intervention, which is the cheapest possible integration.

### Local cache schema

The bundled `metrics.json` matches the warehouse shape exactly:

```json
{
  "metrics": ["page_views", "conversions", "revenue", "sessions", "bounce_rate"],
  "data": [
    { "date": "2026-06-16", "page_views": 10971, "conversions": 316, "revenue": 25612, "sessions": 8099, "bounce_rate": 44.2 }
  ]
}
```

`metrics` is the list of available metric names; `data` is the row array with `date` plus one key per metric. A bare top-level array is also accepted and is treated as `data` with an empty `metrics` list, in which case the assistant derives available metrics from the first row's keys minus `date`. The cache is read through the `metricsPath` configuration key, whose documented default is `/tmp/analytics/metrics.json`.

## Metric column naming

Column names are used **literally** as identifiers. When a metric name is interpolated into SQL it is passed through `safeIdentifier()`, which replaces every character outside `[A-Za-z0-9_]` with an underscore and falls back to `value` for an empty name.

| Requested metric | Emitted identifier |
| --- | --- |
| `revenue` | `revenue` |
| `page_views` | `page_views` |
| `bounce_rate` | `bounce_rate` |
| `avg order value` | `avg_order_value` |
| `a.b` | `a_b` |
| *(empty)* | `value` |

Practical consequences:

- Name warehouse columns in `snake_case` with no spaces, hyphens, or dots. A hyphen is not valid in an unquoted identifier and the sanitiser will turn it into an underscore, producing a column that may not exist.
- Never let a user-supplied string reach the identifier position unchecked. The sanitiser is a last line of defence, not a query builder.
- The metric name is the join key between your call, the column, and the local cache. Three spellings of one metric means three separate analyses.

## How metric values are read from a row

`metricValues()` resolves each row with a fixed fallback chain:

```js
row[metricName]  ??  row.value  ??  row.metric_value
```

So a row may return the metric under any of three keys and the analysis still works:

1. **Named key** — `{ "date": "2026-06-16", "revenue": 25612 }`. Preferred; the named form is what the local cache uses and what keeps `breakdown` dates aligned.
2. **`value`** — `{ "date": "2026-06-16", "value": 25612 }`. Matches the `AS value` alias in the generated query, so a direct `SELECT date, revenue FROM metrics` also works.
3. **`metric_value`** — the third fallback, for warehouses that lowercase or normalise column labels.

Only finite numbers survive. A string, a null, or a `NaN` from a failed cast is dropped from the series rather than coerced to zero, which is deliberate: a metric that is missing half its days should look like a short series, not like a collapse to zero.

## The response envelope

The assistant POSTs to the configured endpoint and passes the parsed payload through `normalizeRows()`. The payload may be a bare array, or an object with any one of these array-valued keys:

| Key | Typical source |
| --- | --- |
| `rows` | Hand-rolled JSON API |
| `data` | Snowflake/BigQuery-style result envelope, and the local cache's own key |
| `result` | Metabase/Tableau-style envelope |
| `metrics` | Metric-oriented API |
| `record` | Single-object API, e.g. a helpdesk or CRM read |

Anything else — an object with none of those keys, a string, `null` — normalises to an empty row list. An empty list is not an error: it sets `useWarehouse` to false, and the run falls through to the local cache or returns `not-connected`.

The request body carries these fields alongside the query:

```json
{
  "query": "SELECT ...",
  "parameters": {},
  "metric": "revenue",
  "mode": "report",
  "provider": "snowflake",
  "database": "",
  "warehouse": "",
  "dimensions": [],
  "filters": {}
}
```

`filters` are also folded into the generated `WHERE` clause as `AND <key> = <JSON value>`, so `{"country": "GB"}` becomes `... AND country = "GB"`. Values are JSON-encoded, which is correct for the string case and worth checking for numeric and boolean columns.

## Connector configuration

The connector is assembled from the run input, then the skill configuration, then the JSON file at `warehouseConfigPath` (documented default `/tmp/analytics/warehouse-config.json`).

| Field | Accepted aliases | Default |
| --- | --- | --- |
| `endpointUrl` | `endpointUrl`, `endpoint`, `baseUrl`, `url` | none — required |
| credential | `apiKey`, `token`, `accessToken` | none — required |
| `provider` | `provider` | `custom` |
| `defaultDatabase` | `defaultDatabase`, `database` | empty |
| `defaultWarehouse` | `defaultWarehouse`, `warehouse` | empty |
| `queryTimeoutMs` | `queryTimeoutMs` | `120000` |

Supported `provider` values: `snowflake`, `bigquery`, `redshift`, `postgres`, `mysql`, `clickhouse`, `looker`, `tableau`, `metabase`, `custom`. The provider value is forwarded in the request body; the assistant does not generate provider-specific SQL, so if your dialect needs different interval or quoting syntax, pass an explicit `query`.

`queryTimeoutMs` is floored at 1000 ms and enforced with an abort signal. A query that runs past it returns `connectorStatus: unavailable` with an HTTP-status or abort message in `error`, and the run falls back rather than failing hard.

## Result envelope you should expect back

Both skills emit the same required fields, and a consumer that reads any other shape will break:

| Field | Type | Values |
| --- | --- | --- |
| `success` | boolean | false only for `not-connected` or `error` |
| `source` | string | `warehouse`, `local`, `local-fallback`, `query-plan`, `not-connected` |
| `warehouseConnected` | boolean | whether the warehouse was actually used |
| `connectorStatus` | string | `connected`, `not-configured`, `unavailable`, `not-executed` |
| `data` | object | insight, query sample, or query plan |
| `error` | string or null | explicit failure reason |
| `note` | string or null | source, fallback, and freshness disclosure |

`source` is the field to branch on. `local-fallback` means the warehouse was attempted and failed and the answer came from the cache — the `note` says so, and that answer is not live. `query-plan` means `dryRun` was set and nothing was executed. `not-connected` means there was no grounded data at all.

## Period and mode semantics

- **Periods** — `7d`, `30d`, `90d`, `1y`, `YTD`. Anything unrecognised falls back to the last 30 rows. In the warehouse path the period is embedded in the generated `INTERVAL`; in the local path it slices the tail of the array, except `1y` and `YTD` which filter on the `date` field. A local cache shorter than the requested window silently returns fewer points, and `dataPoints` in the insight is where you see it.
- **Modes** — `report` summarises the period using `pctChange`; `trends` uses `timeframe` and adds regression and moving averages; `query` returns `rowCount` and the first 20 rows as `sample`. Any other mode is rejected with "Invalid analytics mode. Use report, trends, or query."
- **Analysis window** — `trends` uses `timeframe`; `report` uses `period`. `period` and `timeframe` both default to `30d`, so a trends run that forgets `timeframe` quietly analyses 30 days.
- **`dryRun`** — builds the query and returns it as a `query-plan` with `connectorStatus: not-executed` and no warehouse request. Use it to verify a query resolves before relying on it.

## Integration checklist

- Expose a `metrics` table or view with a `date` column plus one column per metric, named exactly as the assistant is asked for them.
- Return rows under `rows`, `data`, `result`, `metrics`, `record`, or as a bare array. Return the metric value under the metric name, `value`, or `metric_value`.
- Cast every metric column to a number. Text-typed numerics are silently dropped from the series.
- Set `endpointUrl` and the credential in the skill configuration; both are required before `connectorStatus` can leave `not-configured`.
- Set `provider`, `defaultDatabase`, and `defaultWarehouse` so the request body carries routing rather than relying on the connector's own defaults.
- Run the first integration with `dryRun` and confirm the generated SQL against your dialect before executing anything.
- Watch the `note` field on every run. A silent local fallback is the failure mode that looks most like success.

## Configuring this

`queryTimeoutMs` (120000), `metricsPath` (`/tmp/analytics/metrics.json`), `warehouseConfigPath` (`/tmp/analytics/warehouse-config.json`), `provider` (`custom`), `defaultDatabase`, `defaultWarehouse`, and the credential itself are all declared defaults in `ANALYTICS_CONFIG_SCHEMA` and are attached to both analytics skills. An operator overrides them in the assistant's persisted configuration for `analytics-adhoc-query-evaluator` and `analytics-scheduled-trend-monitor` — the runtime merges each skill's `configSchema` defaults with the saved values, and a per-run input value takes precedence over both. `sourceMode` (`auto`, `warehouse`, `local`) and `dryRun` are per-run switches rather than persisted settings, which is what makes it safe to rehearse a query against the cache and then run it for real.
