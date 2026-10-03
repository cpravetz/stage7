# KPI Dictionary

The canonical definitions the analytics assistant reasons over, plus the derived statistics it computes and the thresholds it applies when it calls a series "increasing", "degraded", or anomalous. The metric names here are the column names in the `metrics` table and the keys in the local metrics cache, so a query written against this dictionary resolves without translation. The thresholds in the last two sections are the assistant's defaults; treat every one of them as a tunable, not as a law.

## The five grounded metrics

| Metric | Column / key | Unit | Definition | Watch for |
| --- | --- | --- | --- | --- |
| Page views | `page_views` | count | Total page views served in the day | Includes reloads and non-human traffic; not a reach measure |
| Conversions | `conversions` | count | Completed conversion events in the day | Must be deduplicated on a stable id before it is trusted |
| Revenue | `revenue` | currency | Gross revenue attributed to the day | Gross, not net; refunds and tax are not subtracted |
| Sessions | `sessions` | count | Distinct sessions in the day | Definition must be fixed (timeout window) or the series is not comparable |
| Bounce rate | `bounce_rate` | percent | Share of sessions with no meaningful interaction, 0–100 | The one metric here stored as a percentage, not a 0–1 fraction |

That last row matters more than it looks. `bounce_rate` is on a 0–100 scale in the cache, so it cannot be averaged alongside the count metrics, and a `z` threshold tuned for a percentage has a completely different meaning than one tuned for a count. Always check the unit before comparing two series.

## Derived measures

These are computed on the fly and are what most questions actually want.

| Measure | Formula | Notes |
| --- | --- | --- |
| Conversion rate | `conversions / sessions` | The primary funnel diagnostic |
| Revenue per session | `revenue / sessions` | Monetisation depth of existing traffic |
| Revenue per conversion | `revenue / conversions` | Average order value; a mix shift shows up here before it shows up in revenue |
| Views per session | `page_views / sessions` | Depth of engagement; a fall often precedes a bounce-rate rise |
| Bounce rate (inverse check) | `100 - bounce_rate` | Convenience for combining with the other rates on one 0–100 axis |
| Net revenue retention | `(opening + expansion - contraction - churn) / opening` | Requires a customer-level series this table does not hold; query it separately |

Safe division: every ratio needs a zero guard on the denominator. A day with `sessions = 0` produces an infinite or NaN conversion rate, and a single such day in a 30-day window moves the average more than most real effects do.

## What the assistant computes

`computeStats()` returns, over the numeric values in the selected window:

- `sum` — total across the window
- `avg` — arithmetic mean
- `min`, `max` — extremes
- `pctChange` — `((last - first) / abs(first)) x 100`, the change from the first point in the window to the last
- `growthRate` — `(last - first) / (n - 1)`, the average absolute change per step

`pctChange` and `growthRate` answer different questions. `pctChange` is the headline move over the window and is the number that goes in a summary. `growthRate` is the per-day slope of the endpoints and is only comparable between series of the same length. Neither is a trend: a window that rises then falls can have a positive `pctChange` and a flat `growthRate`.

For `trends` mode the assistant adds, from `linearRegression()` over the value series indexed by position:

- `slope` — change per period
- `intercept`
- `rSquared` — `1 - ssRes / ssTot`, the fraction of variance explained
- `confidence` — derived from `rSquared`, see below
- `movingAverages` — `ma7` and `ma30`, each returning the last 7 computed points, with `null` padding before the window fills
- `anomalies` — see below

## Interpretation bands

`report` mode bands the window on `pctChange`:

| Condition | `interpretation` |
| --- | --- |
| `pctChange > 10` | Strong positive movement |
| `pctChange < -10` | Significant decline |
| otherwise | Relatively stable |

`trends` mode bands the regression slope:

| Condition | `trend.direction` |
| --- | --- |
| `slope > 0.01` | increasing |
| `slope < -0.01` | decreasing |
| otherwise | flat |

`trend.confidence` is a label on `rSquared`, and `rSquared` on a weekly business series is usually low for reasons that have nothing to do with the data quality:

| `rSquared` | `confidence` |
| --- | --- |
| `> 0.7` | high |
| `> 0.4` | medium |
| otherwise | low |

A "low confidence, decreasing" verdict on a seasonal metric is the expected output most days of the year. Before acting on it, check the day-of-week structure: the bundled series carries a clear weekly cycle, and a 30-day window that happens to end mid-week will show a negative slope that reverses the next day. This is why the `breakdown` array (date and value per point) is in the output — read it before you read the verdict.

## Anomaly detection

`detectAnomalies()` computes a z-score per point against the window mean and standard deviation, keeping points where `|z| > 2`. Severity is then assigned:

| Condition | `severity` |
| --- | --- |
| `|z| > 3` | critical |
| otherwise | warning |

Three caveats that matter more than the threshold:

- **Fewer than three points returns nothing.** There is no anomaly detection on a 7-day window's worth of noise, and there should not be.
- **The distribution is over the whole window**, so a sustained shift scores every point in the new regime, not just the transition. A step change produces a wall of warnings; read the first one, not the count.
- **Weekly seasonality inflates the standard deviation** on a daily series, which suppresses real anomalies. Comparing against a rolling baseline rather than a single window mean is the standard fix; the assistant's default does not do this, which is one reason the thresholds are worth tuning.

`recommendation` follows the same logic: a `pctChange` below -10 recommends investigating root causes and validating the metric definition; otherwise any anomaly recommends reviewing those periods; otherwise the run recommends continued monitoring against the agreed baseline.

## Where the metrics live

- **Warehouse** — table `metrics`, column `date` plus one column per metric, queried as `SELECT date, revenue AS value FROM metrics WHERE date >= CURRENT_DATE - INTERVAL "30d" ORDER BY date`.
- **Local cache** — the `metrics.json` shape, with the `metrics` array naming the five metrics and `data` holding daily rows.
- **Support analytics** — a different store, read by `analytics-planning`, whose rows are `{ date, value }` pairs and whose `period` selector is `7d`, `30d`, `90d`, `YTD`, `1y` with `granularity` of `day`, `week`, or `month`. `reportType` selects `operational`, `financial`, `quality`, or `customer_satisfaction`. That store is not the `metrics` table; a support dashboard and a warehouse report are not reconcilable without a join.
- **Product insights** — `product-insights-scheduled` sweeps a configured `metrics` list with per-metric `thresholds` and `segments`, and reports `succeeded` versus `unreachable`. Metric names there come from the operator's configuration, not from the fixed five, so the same name may not mean the same thing in both systems. Check the definition before comparing.

## Defining a metric properly

Six things to write down, and to keep in a place that outlives the person who wrote them:

1. **Name** — the exact string, matching the column name.
2. **Definition** — what is counted, in one sentence with no ambiguity.
3. **Unit and type** — count, percent 0–100, percent 0–1, or currency. State the currency.
4. **Grain and window** — per day, per week; timezone; whether the day boundary is UTC or local.
5. **Filters and exclusions** — internal traffic, test accounts, bots, refunded orders.
6. **Owner and review date** — who answers when two dashboards disagree, and when the definition was last confirmed.

A metric whose definition lives only in a dashboard is a metric that will change under you between one report and the next. A definition change without a version bump is indistinguishable from a real business trend, and the anomaly detector will happily narrate the artefact.

## Common measurement traps

- **Denominator drift** — a change in how sessions are counted moves the conversion rate without any change in behaviour.
- **Partial days** — today's row is incomplete at the time the report runs and always looks like a collapse. The last point in the series is suspect by construction.
- **Unattributed revenue** — a gap between order volume and `revenue` is usually a currency or refund-handling difference, not lost money.
- **Mix shift** — aggregate counts hold steady while every segment degrades, or vice versa. Break down by `dimensions` before concluding.
- **Comparing across sources** — warehouse figures and cached figures are different vintages. The `source` and `note` fields exist for exactly this; check them before quoting a number.

## Configuring this

The `+10` and `-10` percent bands on `pctChange`, the `0.01` slope boundary between increasing, decreasing, and flat, the `0.7` and `0.4` `rSquared` boundaries on confidence, the `|z| > 2` anomaly threshold and `|z| > 3` severity boundary, the `ma7` and `ma30` window sizes, the `30d` default for both `period` and `timeframe`, and the 20-row `sample` cap on `query` mode are the assistant's compiled defaults. The operator-controlled settings around them are the per-run `metric`, `period`, `timeframe`, `dimensions`, `filters`, `sourceMode`, and `dryRun` inputs, and the persisted skill configuration that supplies the warehouse endpoint, provider, database, and `queryTimeoutMs` plus the `metricsPath` cache location. Pin the agreed alert thresholds per metric in the `thresholds` object on `product-insights-scheduled` for scheduled alerting, and treat the bands above as the reporting defaults they are — a 10% move on a low-volume metric is usually noise, and a 4% move on a high-volume one is usually a signal, which is why the raw `stats` and the `breakdown` should travel with every quoted figure.
