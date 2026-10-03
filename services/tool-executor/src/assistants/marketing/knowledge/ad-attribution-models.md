# Ad Attribution Models

How the marketing assistant decides which channel gets credit for a conversion, and what each model is allowed to claim. `plan-campaign` records `budget`, `channels`, `timeline`, and `kpis`; `analyze-performance` runs against a `campaign` identifier with a list of `metrics` such as impressions, clicks, conversions, and ROI; `marketing-audience-insights` supplies behaviour and campaign-response signal. Nothing in that chain picks an attribution model for you, which is why this handbook does.

## The measurement chain

Attribution sits at the end of a chain, and each link distorts:

```
Impression -> Click -> Visit -> Lead -> Qualified -> Convert -> Retain
```

Every model is a rule for distributing one conversion's value back across that chain. The rule is always a simplification; the useful question is which simplification the decision at hand can survive.

## The models

| Model | Rule | Strength | Blind spot | Typical use |
| --- | --- | --- | --- | --- |
| First touch | 100% of credit to the first interaction | Simple, defensible | Ignores everything after discovery | Top-of-funnel budget defence |
| Last touch | 100% of credit to the final interaction before conversion | Simple, matches many attribution windows | Steals credit from the demand that created the demand | Platform-default reporting, short-cycle sales |
| Last non-direct click | All credit to the last click that was not a direct or unattributed visit | The industry default; survives direct traffic inflation | Still ignores assist | Routine channel comparison |
| Linear | Credit split evenly across all interactions | Fair, stable, easy to defend | Treats a 90-day-old billboard the same as yesterday's click | Budgeting where no single touch dominates |
| Time decay | More weight to interactions nearer the conversion, typically 7-day half-life | Rewards long consideration without the maths | Still front-loads; a cheap tunable | Longer consideration cycles, e-commerce |
| Position-based / U-shaped | 40% first, 40% last, 20% spread across the middle | Balances acquisition and conversion | Arbitrary 40/40/20 split | E-commerce funnels with distinct entry and close |
| Data-driven (DDA) | A model — usually Markov or Shapley — estimates each touch's incremental contribution from observed paths | Best available use of the data; no hand-set rules | Black box; unstable on sparse or short paths | Mature accounts with clean identity resolution |
| Algorithmic / Shapley | DDA's most common implementation; evaluates marginal contribution across all orderings of a path | Principled, order-independent | Costly; needs enough paths to be stable | Enterprise, high volume, long windows |
| Incrementality / geo-lift | Randomised holdout or matched-market test: what happened to the exposed group versus the control | The only model that measures **causation** | Slow, needs budget for the control, limited resolution | Budget allocation, deciding whether a channel works at all |

## Choosing

- **Which channel deserves more budget next quarter?** Use **incrementality**. Every other model answers a different question.
- **Which channel should the reporting dashboard show?** Use **last non-direct click** so the numbers reconcile with the ad platforms everyone else is reading.
- **Which content is creating demand that closes weeks later?** Use **time decay** or **position-based**.
- **Can we trust any of it?** Run a holdout. Without one, you are reading a model, not measuring a result.
- **Do we have enough data for DDA?** Usually no, below a few thousand conversions per channel per month. Below that, a transparent rule beats an opaque one.

**Rule of thumb:** keep two numbers. A rule-based number for reconciliation, an experimental or DDA number for decisions. Never make a budget decision from a number whose method you cannot state in one sentence.

## Metrics the assistant reports against

`analyze-performance` takes a metric list; the useful ones and their definitions:

- **Impressions** — renderings. A delivery metric, not an outcome. Never a success measure.
- **Clicks** — intent signal, still not an outcome.
- **CTR** = `clicks / impressions`. Measures message resonance, not channel value.
- **CPC** = `spend / clicks`. Compare within a channel and over time; cross-channel comparison mixes auctions.
- **CPA / CAC** = `spend / conversions` (or `/ new customers`). The number that survives a budget review, and only when conversions are deduplicated.
- **ROAS** = `attributed revenue / spend`. Blended versus paid is the distinction that matters; blended ROAS flatters paid by absorbing organic and direct.
- **Conversion rate** = `conversions / sessions`. A landing-page and message diagnostic, not a channel diagnostic.
- **LTV:CAC** — the ratio that decides whether acquisition should continue at all. Below roughly 3x, growth is destroying value regardless of what any attribution model reports.
- **Incrementality rate** = `incremental conversions / attributed conversions`. The discount factor between what a model claims and what actually happened. Persist it; it is the most useful number in this list.

## Windows, view-through, and cross-device

- **Attribution window** — how far back a click can claim credit: commonly 7, 14, 28, or 30 days. A longer window always produces more attributed conversions. A comparison across windows is meaningless; fix the window and state it.
- **View-through** — crediting impressions that preceded a conversion without a click. This is the largest single source of inflation in display and social reporting. Default it off for budget decisions; keep it only for viewability analysis.
- **Cross-device** — stitching a phone impression to a laptop conversion inflates click-through channels. If identity resolution is not deterministic, say so in the note attached to the report rather than quietly including it.
- **Self-attributed conversions** — "How did you hear about us?" answers are a sampling instrument, not a measurement. Use them as a directional cross-check only.

## Deduplication

Before any of the above, one conversion must be one conversion. Duplicate conversion events, double-fired pixels, and order-plus-subscription counting all inflate attributed performance, and the inflation lands on whichever channels are most generously credited. Deduplicate at the conversion record, not in the reporting query, and state the deduplication key in the report.

## Rules for what the assistant may claim

- **State the model in every output.** "Conversions" without an attribution model is not a fact.
- **State the window with the number.** `conversions = 412 (last non-direct click, 28-day window, deduplicated on order id)`.
- **Never sum across models.** Last-touch and DDA totals for the same period are not summable and not comparable.
- **Separate rate from volume.** A channel with 40 conversions at a 12% rate and a channel with 200 at 1% need different decisions; the ranking depends on which you sort by.
- **Report the fallback.** When a source is a local cache rather than a live platform — which is the current state of `analyze-performance`, whose `results` start empty — the note must say the figures are not live. Present an unpopulated local record as a report of nothing, not as a report of zero.
- **Flag partial coverage.** `marketing-reports-scheduled` counts a campaign as failed when the call throws *or* returns nothing; a report covering fewer campaigns than requested must be labelled partial, never presented as a clean run.

## The same conversions, six models

One campaign, 1,000 conversions in a 30-day window, deduplicated on order id. The spread is the entire argument for naming your model.

| Model | Attributed conversions | Share of total | Change vs. last-touch |
| --- | --- | --- | --- |
| First touch | 1,000 | 100% | +38% |
| Last touch | 1,000 | 100% | baseline |
| Linear | 1,000 | 100% | 0% (by construction) |
| Position-based (40/40/20) | 1,000 | 100% | 0% |
| Time decay, 7-day half-life | 1,000 | 100% | +12% |
| Data-driven | 1,000 | 100% | +4% |
| Incrementality (holdout) | 610 | 61% | **-39%** |

Two things to take from this. First, every point-based model sums to the same total by construction — it only redistributes it, so a "conversion lift" attributed by a different model is not more conversions, it is the same conversions moved. Second, the only row that changes the total is the experimental one, and it says the campaign is roughly a third less effective than any rule-based model reports. That 39% discount is the incrementality rate, and it is the number that should be applied to every model-based forecast.

## Designing an incrementality test

- **Geo holdout** — pick matched markets, exclude one, run in the other, compare the outcome against the holdout's own pre-period trend. Best for national campaigns; geographic noise is the limiting factor.
- **User-level holdout** — randomly withhold a slice of the addressable audience from the channel entirely. Cleanest causal read; needs enough budget to keep the exposed group measurable.
- **Time-based switchback** — alternate on and off by day or week. Good for channels that buy continuously; needs care to avoid carryover.
- **Conversion lift / ghost ads** — the platform's own randomised holdout. Free, credible, and scoped to the platform's own measurement — which is the limitation.

Whatever the design, four things must be true before the result is quoted:

1. **Randomisation is genuinely random.** Random assignment inside a re-targeting list is not random if the assignment depends on behaviour the channel observes.
2. **The holdout is large enough.** A holdout of 1% of users cannot resolve the effect you are trying to detect.
3. **Pre-period trends are comparable.** If the markets diverged before the test, they will diverge during it.
4. **The window covers the full consideration cycle.** Ending a 30-day test on a product with a 90-day cycle measures nothing but the first month.

Report the result as a lift with a confidence interval. A lift with no interval is an anecdote with decimal places.

## A reporting template

Every performance report should carry these fields, and a report missing any of them is not comparable to a report that has them:

```
campaign:        <campaignId>
period:          <start> to <end>, timezone
model:           <name and version, or "geo holdout">
window:          <click-through lookback in days>
view-through:    <on / off>
conversion dedup key: <stable identifier>
response:        <conversions, revenue, attributed to this model>
total attributed:<all channels>
incrementality:  <measured lift with CI, or "not tested">
exclusions:      <internal traffic, test accounts, refunded orders>
source:          <platform or warehouse; local cache is not a source>
```

The `source` line is not optional in this toolkit. `analyze-performance` records an `analysis` per run with `metrics` and a `results` object, and `results` starts empty — so until a platform connector is feeding it, a report is a record that nothing was retrieved, not a record of zero performance. The scheduled report already treats a campaign as failed when the call returns nothing, and the same honesty belongs on any figure quoted from it.

## What attribution cannot answer

- Whether a customer would have bought anyway.
- Whether a channel's brand contribution shows up anywhere in the last-click number — it does not.
- The long-term effect of cheap, low-intent acquisition on retention and LTV.
- Anything about a cohort you have not measured post-conversion.

For those questions the answer is a holdout test, a cohort analysis, or an experiment — not a different attribution model.

## Configuring this

The metrics list, the attribution window, the deduplication key, the view-through setting, the per-channel floor for statistical significance, and the `campaignIds` and `channels` the scheduled report covers are all operator settings, not defaults embedded in the skills. Set them in the assistant's persisted configuration: `marketing-reports-scheduled` requires `campaignIds` and takes `channels` and `reportCadence`, `marketing-audience-insights` carries `defaultSegment` and `segmentationModels`, and `analyze-performance` takes its `metrics` list per run and writes an `analysis` record keyed by `campaignId`. Pin one attribution model and one window per campaign in that configuration so every report is comparable, keep a separate experimental stream for incrementality testing, and treat any comparison where the model or window differ as a non-comparison.
