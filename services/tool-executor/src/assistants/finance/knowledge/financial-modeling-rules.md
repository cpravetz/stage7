# Financial Modelling Rules: FCFF, NPV, IRR and Sensitivity

This handbook specifies how the Finance Modeling & Analysis Skill builds and reports a projection, and it states the conventions the build follows so that a number from one refresh can be compared with a number from the last. The Skill is a two-input unlevered free-cash-flow model: it grows a revenue line and a cost line, taxes the result, subtracts capital expenditure and working-capital investment, discounts the stream and reports NPV, IRR, payback and a three-case sensitivity. Everything below is either a rule the build obeys or a limitation an operator must know about before quoting the output.

The Skill refuses to model without a data source. With `dataSource` unset, or with a source but neither `revenue` nor `costs` set, it returns a not-connected result rather than a model built from defaulted zeroes. A model of zeros is arithmetically valid, completely meaningless, and reads as a real result, so it is not produced.

## Configuration surface

Every driver is operator configuration, not per-run user input. The user is never asked to retype a discount rate on a scheduled refresh.

| Field | Default | Range / note |
| --- | --- | --- |
| `dataSource` | required | ledger, ERP or stored snapshot the figures come from |
| `entity` | — | business unit or legal entity the model describes |
| `revenue` | 0 | starting revenue at `t = 0` |
| `costs` | 0 | starting costs at `t = 0` |
| `periods` | 5 | clamped to [1, 20] |
| `growthRate` | 5% | annual revenue growth |
| `costGrowthRate` | 3% | annual cost growth |
| `taxRate` | 21% | statutory rate applied to EBIT |
| `discountRate` | 10% | WACC or hurdle rate |
| `capexSchedule` | `[]` | per-period capital expenditure |
| `workingCapitalPct` | 10% | working-capital investment as a share of the change in revenue |
| `cadence` | `monthly` | how often the model refreshes |

## The projection as built

For each period `i` from 1 to `periods`:

```
revenue_i               = revenue_0 · (1 + g)^i
costs_i                 = costs_0  · (1 + g_c)^i
grossProfit_i           = revenue_i − costs_i
grossMargin_i           = grossProfit_i / revenue_i
ebitda_i                = grossProfit_i
depreciation_i          = capexSchedule[i−1]  ||  revenue_i · 0.05
ebit_i                  = ebitda_i − depreciation_i
nopat_i                 = ebit_i · (1 − taxRate)
capex_i                 = capexSchedule[i−1]  ||  0
workingCapitalChange_i  = (revenue_i − revenue_{i−1}) · workingCapitalPct
freeCashFlow_i          = nopat_i + depreciation_i − capex_i − workingCapitalChange_i
cumulativeFCF_i         = Σ_{j=1..i} freeCashFlow_j
```

Six conventions in that block need stating out loud, because each is a choice rather than an identity.

1. **`t = 0` is the base year and period 1 is one full year later.** Both lines compound from period 1, so there is no flat stub year. A model configured with `revenue = 12,000,000` produces `12,600,000` in period 1 at the default 5% growth. Setting the base figure as the *current year* total and expecting period 1 to be the next year is the single most common misreading.
2. **`ebitda` is defined as `grossProfit`.** With only a revenue line and a cost line there is no separate depreciation, amortisation, SG&A or other-operating bucket, so EBIT is gross profit less depreciation and EBITDA is gross profit. This is a defensible simplification for a two-line model and it is not the same as a reported EBITDA. A `grossMargin` and an `ebitdaMargin` that are identical in every period is the symptom, and it is correct, not a bug.
3. **The depreciation and capex fallbacks are asymmetric, and it matters.** Where `capexSchedule[i−1]` is supplied, depreciation equals capex in that period. Where it is not, depreciation falls back to 5% of revenue while capex falls back to **zero**. With an empty `capexSchedule` — the default — the model therefore books depreciation and never replaces the asset, which inflates every subsequent EBIT, every NOPAT and every NPV. **Rule: a model with a non-empty `capexSchedule` is required before the output is used for a capital-allocation decision.** If capex is genuinely immaterial, set it to zero deliberately and say so, rather than leaving the schedule empty by accident.
4. **Working capital is an investment in *growth*, not a balance.** `workingCapitalChange` is `workingCapitalPct` applied to the increment in revenue, not to the level of revenue. A business with flat revenue therefore shows zero working-capital investment in every period, and a business at 10% incremental working capital with flat revenue implies a permanently negative cash cycle. This is the incremental formulation and it is the right one for a growth model; it is wrong for a steady-state or turnaround model, where working capital is a release rather than an investment.
5. **Period 1 uses `revenue_0` as its prior.** The first period's working-capital term is `revenue_1 − revenue_0`, not zero, so the first year already books the investment required to grow into period 1. That is internally consistent with the `t = 0` base-year convention.
6. **The discount rate is applied to the same tax rate as the model.** NOPAT uses `taxRate` and NPV uses `discountRate`. A model with a 21% statutory rate and a 10% WACC is internally consistent only if the WACC is a post-tax rate. If the configured `discountRate` is a pre-tax cost of capital, it must be converted before it is set.

## NPV

```
NPV = Σ_{i=1..T} FCF_i / (1 + r)^i
```

The Skill discounts at end-of-period, with the first flow at `t = 1`, and reports `summary.npv` rounded to two decimals.

The mid-year convention shifts every flow half a period earlier and multiplies the whole result by `√(1+r)`:

```
NPV_mid-year = NPV_end-year · √(1 + r)          (a 4.9% uplift at r = 10%)
```

The convention is not a rounding difference and it must be the same on both sides of any comparison. A model discounted end-of-year compared against a peer model discounted mid-year is comparing a number to a 5% larger number, and the difference will be reported as a valuation gap. State the convention in the model header, every time.

Negative NPV means the configured cash flows do not cover the configured cost of capital at these assumptions. The correct response is to interrogate the assumptions — usually the growth rate, the cost growth rate, the capex schedule and the discount rate — not to lower the discount rate until the answer is positive. A discount rate is an input derived from a capital structure and a cost of capital, and moving it to reach a target NPV destroys the only external validation the model has.

## IRR

`summary.irr` is the rate that sets NPV to zero, solved by Newton–Raphson on the derivative of NPV with respect to the rate:

```
NPV'(r) = Σ_{i=1..T} −i · FCF_i / (1 + r)^{i+1}
r_{n+1} = r_n − NPV(r_n) / NPV'(r_n)
```

Build settings: initial guess 0.10, up to 100 iterations, convergence at `|Δr| < 1e-6`, early exit when `|NPV'| < 1e-10`, and the rate clamped to `(−0.99, 10)`.

Four limitations an operator must know before quoting the figure.

- **No sign-pattern check is performed.** IRR is well defined for a conventional cash-flow stream — one sign change, negative then positive. The Skill does not verify that. By Descartes' rule of signs, a stream with two sign changes can have up to two valid IRRs, and the Newton iteration converges to whichever is nearer the 0.10 starting point. The result is a number that solves NPV = 0 correctly and means nothing. **Rule: verify the sign pattern of the FCF series before reporting an IRR.** In this build's structure — positive NOPAT, positive depreciation, capex and working capital subtracted — that means confirming the first-period FCF is not negative, because a negative first period is what creates the multi-IRR case.
- **The clamp bounds are reported, not signalled.** A rate of exactly −0.99 or exactly 10 is a clamped output, not a converged one, and the build returns it in the same field as a genuine solution. Treat `irr = 10` as a red flag rather than a 1,000% return.
- **No discounting convention and no re-investment assumption is attached.** The IRR implicitly assumes interim cash flows can be re-invested at the IRR itself. The NPV does not assume that. They will disagree, and they always will.
- **Use `XIRR` for unevenly dated flows.** An annual model with a mid-year acquisition or a seasonal working-capital cycle is better measured with date-stamped flows. The annual IRR is a period-aggregate proxy and should be labelled as one.

## Payback and ROIC

`summary.paybackPeriod` is the index of the first period in which `cumulativeFCF` is non-negative, reported as a whole period. There is no interpolation, so a payback of 3 means "cumulative FCF turned positive somewhere in year 3", and the model does not tell you when. Where a month-accurate figure matters, interpolate within the crossing period, and report the **discounted** payback as well: an undiscounted payback of 3 years against a 10% discount rate is a discounted payback nearer 4. A payback that is not positive within the modelled horizon is reported as `null`, and null means "not inside `periods`", not "never".

`summary.roic` is computed as

```
investedCapital = Σ capex_i  +  revenue_1 · workingCapitalPct
roic            = nopat_periods / investedCapital
```

Two structural points. The denominator is a **cumulative** capital base while the numerator is a **point-in-time** NOPAT, so the ratio rises mechanically as `periods` is increased — doubling the horizon with the same cash flows raises the reported ROIC without changing anything about the business. And textbook ROIC uses invested capital at a point in time, net working capital plus net fixed assets, measured at the same date as the NOPAT. This is a simplified unlevered return on cumulative capex plus first-period working capital, and it is not comparable to a ROIC computed on a company's own balance sheet.

The trap worth naming explicitly: with the default empty `capexSchedule`, the capex sum is zero, so `investedCapital` collapses to `revenue_1 · workingCapitalPct` and ROIC becomes enormous. A ROIC printed off a default-configured model carries no information. Treat it as a diagnostic of the configuration, not of the business.

## Sensitivity

`summary.sensitivity` reports base, bull and bear, each of which re-runs its **own** cash-flow series through the same projection code and reports that scenario's own NPV and IRR:

| Case | `growthAdj` | `costAdj` | Revenue growth | Cost growth |
| --- | --- | --- | --- | --- |
| `base` | 0 | 0 | `growthRate` | `costGrowthRate` |
| `bull` | +2% | −1% | `growthRate` + 2% | `costGrowthRate` − 1% |
| `bear` | −2% | +1% | `growthRate` − 2% | `costGrowthRate` + 1% |

The bull and bear adjustments are applied to the **compound** growth rates, so the divergence from base widens with the period index. At `periods = 10` and default settings, bull revenue is 21.9% above base and bear revenue is 18.4% below. That is a sensitivity with teeth, and it is the reason the three cases can look asymmetric even though the adjustments are symmetric.

The structural rule: a scenario that reuses the base cash-flow series and only re-labels the summary is not a sensitivity analysis, it is a duplicated number, and it reports identical NPV and IRR across all three cases while appearing to show sensitivity. This build recomputes the series for every case specifically to avoid that.

Two-point sensitivity is a diagnostic, not a decision tool. Before a capital commitment, replace it with:

- A **two-variable data table** over the two drivers that actually decide the case — growth rate against EBITDA margin, or volume against price — computing NPV across the grid rather than along three rays. Three rays through a non-linear surface miss the corners, and the corners are where the failure cases live.
- A **break-even solve**: the growth rate, margin or discount rate at which NPV crosses zero. This is a second root find on the same NPV function used for IRR, and it is far more useful than a bear case because it names the assumption the decision is actually sensitive to.
- A **tornado analysis**: vary one driver at a time across its plausible range, sort by NPV impact, and present in that order. The single-variable spread is the honest measure of which assumption the decision rests on.
- A **real-options note** where the investment is staged and reversible. A static NPV of a staged investment understates it, and the understating is systematic.

## Rounding, presentation and refusal rules

Currency amounts are rounded to two decimals and ratios to four, and the rounding is applied at output, not carried through the calculation. Ratios stored as four-decimal values are decimals: `irr: 0.1234` is a 12.34% annual rate and `avgGrossMargin: 0.1842` is 18.42%. Never render one as a number and the other as a percentage in the same report.

- The summary line states NPV, IRR and payback together. A report that shows NPV without the discount rate that produced it, or IRR without the sign pattern of the series, is not fit to circulate.
- The output states that projections are computed locally from configured figures and are not third-party market data. That statement is part of the model, not a disclaimer attached to it.
- If `dataSource` is unset, the Skill reports that no data source is configured. If the source is set but supplies no revenue and no costs, it reports that the source has no figures to model. Both are not-connected outcomes, and neither produces a model.
- The `models` store accumulates each refresh with its full `config` snapshot and the computed `model`, so a figure can always be traced to the assumptions that produced it. Retain that history; a projection whose inputs cannot be reconstructed is not auditable.

## Configuring this

Every default in this handbook — the 5-year horizon, 5% and 3% growth, the 21% tax rate, the 10% discount rate, the 10% incremental working-capital ratio, the 2% and 1% sensitivity adjustments, the 5%-of-revenue depreciation fallback, the 20-period maximum — is a shipped default in the persisted configuration of the `finance-modeling-analysis` Skill, and the operator overrides each one there. The two settings that change the model's validity rather than its scenario are `capexSchedule` and `discountRate`: populate the former before the output informs a capital-allocation decision, and confirm the latter is a post-tax cost of capital before comparing its IRR against a hurdle rate. `periods` and `cadence` control the horizon and the refresh rhythm, and both belong to the operator as well. Nothing in this document is a fixed rule of the code; it is the rule set the current build ships with, and it is intended to be changed deliberately.
