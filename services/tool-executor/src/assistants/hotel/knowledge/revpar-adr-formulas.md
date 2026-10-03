# RevPAR, ADR, and Yield Formulas

This handbook is the metric reference for the Revenue & Performance Advisory skill, the only skill in the hotel assistant that computes property financials. It fixes the definitions the skill actually applies, explains why the arithmetic is done on summed numerators rather than averaged per-record ratios, and sets out the derived measures a revenue manager will ask for next. Read the first section before quoting any number from this assistant: two of the three headline figures are computed rather than read, and one of them silently depends on a denominator a real property almost never has.

## Core formulas

| Metric | Formula | Field in the skill | Notes |
| --- | --- | --- | --- |
| Occupancy (%) | `roomsSold / availableRooms × 100` | `summary.occupancy` | Percentage, two decimals |
| Average Daily Rate (ADR) | `revenue / roomsSold` | `summary.adr` | Currency, two decimals |
| Revenue per Available Room (RevPAR) | `revenue / availableRooms` | `summary.revpar` | Currency, two decimals |
| Revenue per Occupied Room (RevPOR) | `revenue / roomsSold` | derived | Numerically equal to ADR |
| Tracked RevPAR (TRevPAR) | `total revenue / available rooms` | derived | Includes revenue that covers no room |
| Gross Operating Profit per Available Room (GOPPAR) | `(revenue − operating cost) / available rooms` | derived | Requires cost data not currently modelled |
| Total Revenue per Available Unit (TRevPAU) | `total revenue / available units` | derived | Apartment and resort variant |

The identity that matters: **RevPAR = ADR × occupancy (as a decimal)**. If a reported RevPAR does not equal ADR multiplied by decimal occupancy, one of the three is wrong or drawn from a different period. Checking that identity on every report is the fastest way to catch a denominator error.

## What counts as revenue and as an available room

Two definitional decisions drive every figure above, and both must be stated on any report.

**Room revenue** is the lodging component of the folio: room charge plus in-room package items that are inseparable from the stay. Excluded: food and beverage posted to the folio, incidentals, taxes, resort and destination fees where reported separately, and any non-room revenue the record happens to carry. This exclusion is why `TRevPAR` and `RevPAR` differ, and why a full-service property's RevPAR is not comparable to a limited-service property's on a revenue basis.

**Available rooms** is sellable physical inventory for the period, reduced by out-of-order rooms. It is not total keys, not total staffed rooms, and not occupied plus vacant. Three errors account for most wrong occupancy figures:

- Using physical room count instead of available rooms, which inflates the denominator and understates occupancy.
- Failing to deduct out-of-order rooms, which inflates occupancy and RevPAR and hides a maintenance problem as a revenue-management one.
- Using a different denominator for revenue than for the rate calculation, which breaks the RevPAR identity.

## How the skill aggregates

The handler does not average per-record ratios. It sums three columns across every usable record and then divides once:

- `revenue` is the sum of each record's `revenue` field, falling back to `amount` or `total` if `revenue` is absent.
- `roomsSold` is the sum of `roomsSold`, falling back to `bookedRooms`.
- `availableRooms` is the sum of `availableRooms`, falling back to `inventory`.
- Occupancy, ADR, and RevPAR are then computed from those three sums.

This is the correct construction. Averaging a set of daily RevPARs over-weights low-inventory days, and a single record with `availableRooms` of 2 will otherwise distort the property. The consequence for the reader is that a period-total ADR is not the mean of the daily ADRs, and the skill's `summary` is the authoritative figure for the requested `dateRange`.

All three headline values are rounded to two decimals at the end, after the division, not before the summation. Rounding per record and then summing would accumulate error across a long period and break the identity.

## The per-record ADR field

Each record accepts its own `adr` field, and it is stored and available for slicing. It is not used to compute `summary.adr`. The summary derives its own ADR from summed revenue over summed rooms sold. When the two disagree, the derived figure is the one that reconciles with `summary.revpar` through the RevPAR identity; a record-level `adr` inconsistent with its own `revenue` and `roomsSold` is a source-data defect worth raising with the PMS owner.

## Denominator discipline

Three edge cases follow from how the guard clauses are written, and each produces a zero rather than an error:

- `availableRooms` of zero across the whole set makes `summary.occupancy` and `summary.revpar` zero even when revenue exists. A zero is a data problem, not a performance result, and a report showing zero occupancy with nonzero revenue should be treated as a defect.
- `roomsSold` of zero with revenue present makes `summary.adr` zero, which then breaks the RevPAR identity. Free upgrades, comps, and in-house revenue posted against a zero-occupancy night are the usual cause.
- An empty record set returns `success: false` with `status: not-connected` and `source: not-connected`, carrying a zero-valued `summary` so the shape stays consistent. The assistant does not fabricate a prior-period value or fall back to cache without labelling it.

## Multi-property aggregation

A group figure is not the average of the property figures. Compute at group level:

```
group ADR    = Σ revenue across all properties / Σ roomsSold
group RevPAR = Σ revenue across all properties / Σ availableRooms
```

Averaging property-level RevPARs weights a 40-room property the same as a 400-room one. The `propertyId` input is a single reference, so multi-property work is achieved by supplying a combined record set with the `department` field carrying the property identity, and by requesting the grouping through `dimensions`.

## Comparable-set and index measures

These require a second property's figures and are not computed by the skill. They are the standard follow-on analysis, and the request field to supply peer figures is `baselineRevenue` for a simple variance or the `params` object for a full index.

| Index | Formula | Reading |
| --- | --- | --- |
| RevPAR Index (RGI) | `property RevPAR / comp-set RevPAR × 100` | Below 100 means underperforming the set; 100 is market |
| Market Penetration Index (MPI) | `property occupancy / market occupancy × 100` | Demand capture independent of rate |
| Average Rate Index (ARI) | `property ADR / market ADR × 100` | Rate positioning independent of demand |

RGI decomposes into MPI multiplied by ARI, normalised. Read the pair rather than the product: a property can post a healthy RGI by discounting into a high-occupancy market, which is a different problem from failing to sell rooms. When selecting a comparable set, control for property class, size, condition, and market; an uncontrolled set will hand a luxury property an RGI of 140 that means nothing.

## Revenue-per-available-room by segment

The record shape carries `channel`, `department`, and `staffId` alongside the numeric columns, and `dimensions` names the grouping the caller wants. Three slices are worth standardising:

- **By channel**: direct, brand website, OTA, GDS, wholesale, and corporate negotiated. Channel cost is the differentiator; a high-ADR OTA segment can be margin-negative once commission is deducted, so ADR alone misranks segments.
- **By department**: rooms, food and beverage, and other operated departments, each divided by the same available-room base. This is the TRevPAR family and the first step toward a GOPPAR view.
- **By stay characteristic**: length of stay and booking window, which belong in the recommendation narrative rather than in a computed field.

## Forecasting shape

`forecast` is deterministic and assumption-explicit:

- `forecast.revenue` is `summary.revenue × (1 + growthRate / 100)`.
- `forecast.occupancy` is `targetOccupancy`, clamped to a maximum of 100.
- `forecast.adr` is `targetAdr`.
- `forecast.assumptions` echoes `growthRate` and the `currency` code, defaulting to USD.

When `targetOccupancy` or `targetAdr` is not supplied, the target defaults to the corresponding measured value, so the forecast occupancy and ADR equal current performance and only the growth term moves revenue. Read the assumptions object before treating the forecast as a projection. The two standing recommendations are deliberately conservative: compare the forecast against current pickup before changing rates, and review channel mix and length-of-stay constraints before publishing a rate change.

For real projection work, layer on booking pace. Occupancy should be compared to the same point in the comparable window, not to last week. Pickup for the remaining period divided by the remaining available rooms gives the pace required to reach target occupancy. Below pace means hold or discount; above pace means the constraint is rate. Length-of-stay restrictions, minimum-stay controls, and closed channels exist to protect the pace number and should be adjusted before rates, not after.

## Budget variance

Variance against budget or against last year is the first thing a manager asks for and the thing most often reported loosely. Three rules:

- Compare like denominators. Year-on-year RevPAR across a property that added or removed rooms is not a performance change.
- State the base. A percentage variance is meaningless without naming the base figure and the period.
- Separate rate volume from mix. A RevPAR increase that comes entirely from a higher share of suite nights is a mix change, not a pricing success.

## Source and staleness disclosure

`source` is one of `supplied`, `local-cache`, `pms`, `not-connected`, or `error`, and `stale` flags an analysis that leaned on the local cache rather than live data. Records come from the caller's `records` array when present and otherwise from the persisted local analytics store; the store is only written when the caller supplies records and `dryRun` is false. Always report the source alongside the figures. A RevPAR computed from last night's cache and presented as current is the most common reporting failure in this domain, and the schema has a field designed to prevent it.

## Currency and reporting conventions

Mixed-currency properties need two decisions made explicitly and applied consistently:

- **Conversion rate and its source.** Convert at the rate published for the date of the transaction, not a single period rate, so that the revenue series matches the charges that produced it. Using one period-end rate distorts a period in which the currency moved.
- **Presentation.** Report a single presentation currency and state it. `forecast.assumptions.currency` defaults to USD, so a European property must pass its own code or the report will label euros as dollars.

Revenue in a `currency` field is not revenue until the conversion rule is stated. Two properties reporting the same RevPAR in different currencies are not comparable.

## Common reporting errors

Recurring mistakes, listed because each produces a plausible-looking wrong number rather than an obvious failure:

- Averaging property-level RevPAR to report a group figure, which weights a 40-room property like a 400-room one.
- Mixing periods: revenue over one `dateRange` with inventory over another, which breaks the RevPAR identity.
- Including non-room revenue in the `revenue` field, which inflates ADR and inflates RevPAR.
- Using occupied rooms as the ADR denominator and available rooms as the RevPAR denominator with different underlying periods.
- Reporting a month that includes the current business date before the night audit has run, so the figures change the next morning.
- Quoting a `local-cache` figure without the source label, which makes yesterday's data look like today's.

None of these raise an error. All of them are caught by checking the identity and the source label on every report.

## Configuring this

Growth rate, target occupancy, target ADR, currency, granularity, and the choice of dimensions and metrics are per-call inputs, and `granularity` accepts `hourly`, `daily`, `weekly`, `monthly`, or `quarterly` for the aggregation the caller wants. The two-decimal rounding, the zero-denominator behaviour, and the fallback chain from `revenue` to `amount` to `total` are defaults baked into the skill's arithmetic and are not exposed as configuration. The record store location and the property reference are the persisted state the skill reads from, so a deployment that wants a different persistence location or a different set of built-in channel definitions changes that configuration rather than the formulas in this document.
