# MEDDPICC Framework

This handbook defines how the B2B Sales & Pipeline Intelligence Assistant evaluates deal health. It covers the MEDDPICC qualification model, the weighted lead-scoring rubric the Lead & Deal Advisory skill computes, the qualification thresholds and category bands, and the pipeline operations the assistant stages. Use it to interpret a lead score, to weight a rubric for a specific market, or to explain why a lead was qualified or set aside.

## The MEDDPICC model

MEDDPICC is the qualification checklist the assistant frames a deal against. Each letter is a qualification dimension:

- **M**etrics — the quantified outcome the buyer is measured on.
- **E**conomic Buyer — the person who can release budget.
- **D**ecision Criteria — how the buyer compares options.
- **D**ecision Process — the steps and approvers between here and signature.
- **I**dentify Pain — the underlying problem driving the search.
- **C**hampion — the internal seller who advances the deal.
- **C**ompetition — the alternatives, including the status quo.

A deal is healthy when each dimension is evidenced, not merely claimed. The assistant scores the signals a caller supplies; it does not infer a dimension that was never provided.

## The weighted lead-scoring rubric

Lead & Deal Advisory scores each lead on four dimensions, normalizes each against its own maximum, then combines them into a 0–100 total. Normalizing against each dimension's own maximum is what keeps the total a genuine 0–100: applying weights to raw point totals whose maxima differ caps the achievable score below the hot threshold and makes the top band unreachable.

| Dimension | Default weight | Raw maximum |
|---|---|---|
| demographic | 0.30 | 35 |
| firmographic | 0.25 | 35 |
| engagement | 0.25 | 75 |
| behavioral | 0.20 | 40 |

The per-dimension score is `clamp(raw, 0, max) / max × 100`, and the total is `Σ(normalized × weight)`, clamped to 0–100 and rounded.

## Thresholds and category bands

| Band | Default threshold | Score | Recommended action |
|---|---|---|---|
| hot | `hotThreshold` | ≥ 70 | `prioritize_immediate` |
| warm | `threshold` | ≥ 50 | `nurture_engage` |
| cold | below threshold | < 50 | `monitor_score` |

A lead is qualified when its score meets `threshold` (default 50) and hot when it meets `hotThreshold` (default 70). The assistant reports the count in each band, the weights used, the dimension maxima, and per-signal rationale for every lead.

## Signal coverage and honesty

Every score is computed locally from the lead records supplied. The assistant reports, per lead, the signals it matched, the signals it ignored as unrecognized, and an `unassessedInputs` list naming what was absent (for example `annualRevenue`, `engagement`, or `site activity`). A set-level coverage summary reports which fields were absent across how many leads, so a partially scored lead set is distinguishable from a fully scored one. With no leads supplied, the skill reports a not-connected result rather than scoring nothing silently.

## Pipeline operations

Pipeline Ops stages CRM writes for a configured sales endpoint. It operates on these entities: `lead`, `contact`, `account`, `opportunity`, `activity`, `event`, and `document`. Sales meetings are typed as `discovery`, `demo`, `proposal`, `followup`, or `negotiation`. A proposal or quote carries `lineItems`, and the total is derived from them (`quantity × unitPrice`, summed and rounded to cents) rather than trusted from a stated `totalAmount`; a stated total that disagrees with the line items is flagged.

## The MEDDPICC dimensions in detail

Each dimension is a qualification question with a pass condition:

- **Metrics** — can the buyer quantify the outcome? Pass when a numeric, business-relevant metric is named.
- **Economic Buyer** — who releases the budget? Pass when a named individual, not a committee, is identified.
- **Decision Criteria** — how will options be compared? Pass when the criteria are stated and rankable.
- **Decision Process** — what steps and approvers stand between here and signature? Pass when the process and its owner are known.
- **Identify Pain** — what problem drives the search? Pass when the pain is specific enough to quantify.
- **Champion** — who internally sells on your behalf? Pass when a credible internal advocate is named.
- **Competition** — what are the alternatives, including the status quo? Pass when the incumbent or rival is known.

A dimension is evidenced, not assumed. The assistant scores the signals a caller supplies and does not infer a dimension that was never provided.

## Per-dimension lead scoring

The rubric scores each dimension from the supplied lead record:

- **Demographic** — title seniority and industry, matched from free text.
- **Firmographic** — company size tier and annual revenue band.
- **Engagement** — boolean signals such as `demoBooked` and `contentDownloaded`.
- **Behavioral** — site activity, pricing visits, competitor visits, and recency decay.

Each dimension's raw points are clamped to its maximum, normalized to 0–100, then weighted. The normalized per-dimension scores and the raw points are both reported, so a total can be traced to its components.

## Pipeline operation flow

Pipeline Ops stages a CRM write in this order:

1. Validate the required fields — `entity`, `entityId`, and `data` (or `lineItems` for a proposal).
2. Derive the total from `lineItems` when supplied, and cross-check any stated `totalAmount`.
3. Stage the operation as a dry run by default.
4. On a confirmed live write, POST the payload to the configured endpoint.

A missing field returns a structured not-connected result naming what is missing. A live write without `confirmation: true` returns a confirmation-required result and sends nothing.

## Dry-run and live-write states

An operation reports one of these states:

- `dry-run` — staged, nothing sent, the default.
- `confirmation-required` — a live write was requested but not confirmed.
- `not-connected` — no endpoint configured, or a required field or key is missing.
- `ok` — a live write succeeded.
- `error` — a live write was attempted and the endpoint failed or was unreachable.

The state, the endpoint, and whether anything was actually sent are always reported, so an operator can tell a staged request from a completed write.

## Worked scoring example

A lead with a C-level title (demographic 20 + 15 industry = 35 raw, the maximum), an enterprise company with revenue over 1,000 (firmographic 20 + 15 = 35 raw, the maximum), a booked demo and a clicked email (engagement 25 + 10 = 35 of 75 raw), and a pricing visit with a recent engagement (behavioral 15 − 0 = 15 of 40 raw) scores:

```
demographic   = clamp(35, 0, 35) / 35 × 100 = 100
firmographic  = clamp(35, 0, 35) / 35 × 100 = 100
engagement    = clamp(35, 0, 75) / 75 × 100 = 46.67
behavioral    = clamp(15, 0, 40) / 40 × 100 = 37.5
total       = 100×0.30 + 100×0.25 + 46.67×0.25 + 37.5×0.20 = 81.04 → 81
```

At 81 the lead is hot (≥ 70) and the recommended action is `prioritize_immediate`. The engagement dimension, despite two strong signals, is capped by its 75-point maximum, which is why normalization matters: raw points alone would understate it.

## Mapping MEDDPICC to the score

The MEDDPICC dimensions and the lead score are complementary, not the same:

- MEDDPICC qualifies a specific deal through evidence gathered in conversation.
- The lead score ranks a lead from the signals supplied in a record.
- A high-scoring lead is a priority to work; a MEDDPICC-complete deal is a priority to close.

Use the score to decide whom to contact first, and MEDDPICC to decide whether a contacted deal is real.

## Configuring this

The dimension weights, the maxima, and the qualification thresholds are defaults. Operators override the rubric through the `weights` input (which must sum to 1.0), set the qualification bar with `threshold`, and set the hot-lead bar with `hotThreshold`. The CRM, calendar, and document providers, the default owner, and the per-minute rate limit are set through the Pipeline Ops skill's persisted configuration. A live pipeline write requires `dryRun: false` plus an explicit `confirmation: true`; the default is a dry run that stages the request and sends nothing.
