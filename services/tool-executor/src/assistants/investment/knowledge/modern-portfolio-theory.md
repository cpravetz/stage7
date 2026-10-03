# Modern Portfolio Theory: Allocation, Risk Measurement and Rebalancing

This handbook is the methodological reference for the Wealth Management & Personal Portfolio Assistant's Portfolio & Risk Advisory Skill and its Bill Pay & Rebalancing Execution Proxy. It covers the mean–variance foundations those Skills reason from, the risk metrics they report, the constraints a real allocation has to satisfy, and the estimation problems that decide whether any of it survives contact with a live account. This is a methodology, not personalised advice: a qualified, licensed financial adviser governs any real decision, and nothing produced by the Assistant substitutes for one.

The Skill computes only from values the caller supplies. It holds no return history, no covariance estimate and no market data of its own, and it reports `sharpeRatio: null` and `maxDrawdown: null` rather than inventing them. That contract is deliberate, and it is why the mechanics it does implement are described precisely below and the ones it does not are named as gaps.

## Actions and what each one actually does

| `action` | Handler | Computes | Requires |
| --- | --- | --- | --- |
| `analyze-portfolio` | `analyzePortfolio` | `totalValue`, allocation by `assetClass`, value-weighted `expectedReturn` | holdings with positive `value` or `amount` |
| `optimize`, `rebalance`, `efficient-frontier`, `risk-budgeting` | `optimizePortfolio` | equal-weight starting `weights`, mean `expectedReturn`, diagonal-mean `volatility`, `sharpeRatio` | `expectedReturns` keyed by symbol; `covarianceMatrix` for volatility |
| `risk-assessment`, `stress-test` | `assessRisk` | `portfolioValue`, `weights`, parametric `var-parametric`, `stress-test` scenarios | `volatility`, `holdingPeriod`, `confidenceLevel`, `methods` |
| `evaluate`, `factor-exposure`, `scenario-analysis` | `evaluateInvestment` | weighted composite `score`, `ranked` ordering | `symbols`, `criteria` keyed by symbol, `weights` keyed by criterion |

Four of the ten action names are aliases into the same handler. `efficient-frontier` currently returns a single equal-weight point, not a frontier, and `risk-budgeting` returns the same weights with no risk-contribution decomposition. Treat the alias names as the intended future capability, and read the current output as what `optimizePortfolio` computes.

## Mean–variance foundations

For a portfolio of `n` assets with weight vector `w`, expected return vector `μ` and covariance matrix `Σ`:

```
Portfolio expected return    r_p = wᵀ μ
Portfolio variance           σ²_p = wᵀ Σ w
Portfolio volatility         σ_p = √(wᵀ Σ w)
Asset contribution to risk   RC_i = w_i · (Σ w)_i / (wᵀ Σ w)
```

Three results carry the whole of modern portfolio theory.

**Two-fund separation.** Under mean–variance assumptions, every efficient portfolio is a combination of the risk-free asset and a single tangency portfolio of risky assets. Choosing a complete portfolio is choosing a point on the capital allocation line; choosing among risky assets is a separate decision made once. The line is

```
E[R_p] = r_f + [(E[R_e] − r_f) / σ_e] · σ_p
```

whose slope is the Sharpe ratio of the efficient risky portfolio.

**The security market line.** `E[R_i] = r_f + β_i·(E[R_m] − r_f)`, where `β_i = Cov(R_i, R_m)/Var(R_m)`. CAPM prices systematic risk; under its assumptions any portfolio with the same beta has the same expected return, and an uncorrelated residual is worthless.

**The tangency portfolio.**

```
w_tangency = Σ⁻¹(μ − r_f·1) / (1ᵀ Σ⁻¹ (μ − r_f·1))
```

and the global minimum-variance portfolio is the same expression with the risk-premium term removed:

```
w_GMV = Σ⁻¹1 / (1ᵀ Σ⁻¹1)
```

`Σ⁻¹` requires a positive-definite covariance matrix. A matrix estimated from too short a window, or from a handful of assets with near-collinear returns, is singular or indefinite, and the inversion is either unstable or meaningless. A production allocator tests eigenvalues before inverting and falls back to a shrinkage or factor-based estimate.

## The current optimisation path, and what it is not

`optimizePortfolio` returns an **equal-weight** allocation, `w_i = 1/n`, and derives its metrics from that. Concretely:

- `expectedReturn` is the unweighted mean of the supplied `expectedReturns` values. Under equal weights that is correct.
- `volatility` is `√(mean(Σ_ii))`, the square root of the average of the covariance **diagonal** entries. This is the equal-weight portfolio variance only if all off-diagonal covariances are zero. In any real multi-asset portfolio the off-diagonals are strongly negative and the true portfolio volatility is materially lower. The reported figure is therefore an upper bound that ignores diversification entirely, and the reported `sharpeRatio` understates the real risk-adjusted return by the amount diversification is worth.
- `riskFreeRate` defaults to 0 and `sharpeRatio = (expectedReturn − r_f) / volatility`.

It is an honest equal-weight starting allocation and the notice field says so. It is not an optimiser, and no output should be described as one.

### What a real constrained optimiser does

```
minimise    wᵀ Σ w                                   (min-variance)
subject to  1ᵀ w = 1                                (fully invested)
            w_i ≥ 0                                 (longOnly)
            w_i ≤ w_max                             (maxWeight)
            Σ_{i ∈ sector s} w_i ≤ cap_s            (sectorCaps)
```

The `constraints` field accepts `longOnly`, `maxWeight` and `sectorCaps` as a free-form object. Three constraints are non-negotiable in any implementation and none of them is a preference:

- **Weights sum to one.** Without it the optimiser is free to hold cash, and "holding cash" and "not solving the problem" are indistinguishable in the output.
- **Long-only unless shorting is explicitly authorised.** Shorting introduces borrow cost, recall risk, margin mechanics and a financing drag that a mean–variance model with a historical covariance matrix does not represent. `longOnly` should be the default and its relaxation an explicit, logged decision.
- **Bounds and sector caps, enforced as hard constraints.** An unconstrained solution routinely puts 40% in one name and no cap in the optimizer's vocabulary. Post-hoc trimming of an unconstrained solution is not a constrained optimisation; it produces a portfolio the optimiser would not have chosen and that is usually worse on the frontier.

A practical algorithm order: project onto the feasible set, solve the equality-constrained problem in closed form, then run a few iterations of an active-set method that releases the bound constraints. Check the result sums to one within tolerance and that no constraint is violated before reporting it.

## Estimation error, and Black-Litterman

Expected returns are the binding problem. A covariance matrix estimated from a few hundred observations is noisy but usable; an expected return estimated from the same data is noise with a plausible-looking mean, and the optimiser will pursue it to a corner of the feasible set.

- **Covariance.** Use a shrinkage estimator such as Ledoit–Wolf, or a factor model (one market factor plus a handful of sector factors) with idiosyncratic residual variance. A diagonal-plus-shrinkage target is a good default floor.
- **Expected returns.** The market-implied equilibrium return from the capital market line is the most robust prior available: `Π = δ·Σ·w_market`, where `w_market` is the market-capitalisation-weighted portfolio and `δ` is the risk aversion coefficient, typically 2.0 to 2.5.
- **Black-Litterman.** Blend the market prior with a small number of explicit views `P` and their confidences `Ω`:

```
Posterior expected returns:
  E[R] = [ (τΣ)⁻¹ + PᵀΩ⁻¹P ]⁻¹ [ (τΣ)⁻¹Π + PᵀΩ⁻¹Q ]
Posterior covariance:
  Σ_BL = Σ + [ (τΣ)⁻¹ + PᵀΩ⁻¹P ]⁻¹ τΣ
```

`τ` scales the uncertainty in the prior (a default of 0.05 is common), `Q` holds the view returns, and `P` is the `n × k` pick matrix. The `views` and `confidence` fields in the input schema are shaped for this: `views` is `P` with `Q` alongside, and `confidence` is the diagonal of `Ω`. **These inputs are accepted by the schema today and are not yet used in a calculation** — `optimizePortfolio` reads only `expectedReturns` and `covarianceMatrix`. That is the correct shape for a later implementation, and until it lands, a Black-Litterman result must not be reported.

- **Equal-weight as a default.** For a multi-asset portfolio with no reliable expected-return estimates, equal weighting is defensible and is frequently the harder benchmark to beat. It is also what the Skill currently returns, which makes it a reasonable default rather than a limitation.

## Risk measurement

| Metric | Formula | Reading | Standing |
| --- | --- | --- | --- |
| Volatility | `√(wᵀΣw)`, annualised by `√252` | total dispersion | necessary, not sufficient |
| Parametric VaR | `V · σ · z_α · √(T/252)` | loss not exceeded at confidence `α` over `T` days | threshold risk, no tail shape |
| Expected shortfall | mean loss beyond VaR | average tail loss | coherent; prefer it to VaR |
| CVA | discounted expected loss from default over the exposure life | counterparty credit cost | credit, not market |
| Max drawdown | max peak-to-trough decline of the equity curve | realised pain | path-dependent, not a percentile |
| Beta | `Cov(R_p, R_m)/Var(R_m)` | systematic exposure | CAPM-only interpretation |
| Tracking error | `σ(R_p − R_b)` | deviation from benchmark | paired with information ratio |
| Information ratio | `α_p/TE` where `α_p` is annualised active return | risk-adjusted active return | benchmark-dependent |
| Risk contribution | `RC_i = w_i(Σw)_i / wᵀΣw` | where the risk actually sits | the point of risk budgeting |

`assessRisk` implements the parametric VaR form exactly, using `z = 2.326` for `confidenceLevel ≥ 0.99`, `1.645` for `≥ 0.95`, and `1.282` otherwise, with `holdingPeriod` scaled as `√(holdingPeriod/252)`. Four notes on that implementation:

- The three-case `z` table is a coarse stand-in for the normal quantile `z = Φ⁻¹(α)`. At `confidenceLevel = 0.975` the table returns 1.645, where the true quantile is 1.960 — an 16% understatement of the tail. A production implementation uses the exact quantile.
- The formula requires the volatility to be a **daily** volatility, because the scaling is `√(T/252)`. Passing an annualised volatility inflates VaR by `√252 ≈ 15.9`. The `volatility` field carries no unit label; the practitioner supplies it.
- Parametric VaR assumes a normal distribution and constant volatility. Real returns are fat-tailed and volatility clusters, and a normal VaR at 99% understates the true tail by a wide margin. Expected shortfall is the better metric, and it is the one to report alongside any regulatory-style figure.
- VaR is not subadditive: the VaR of two positions can exceed the sum of their individual VaRs, so it cannot be aggregated into a coherent firm-level measure. ES is coherent. A risk report that reports only VaR is reporting a number that does not aggregate.

Stress tests, when supplied, come through as `scenarios` of `{ name, impact }`. Treat them as a scenario grid to apply to the current holdings, and add two forms the supplied grid cannot express: **historical** (the realised path of a named past episode, 2008, March 2020, a rate shock) and **reverse stress testing** (what has to happen for the portfolio to lose a stated amount). Reverse stress testing is the most informative of the three, because it starts from the loss and works back to the cause, and it does not require anyone to have thought of the scenario in advance.

## Rebalancing and drift

`calculate-drift` compares each holding's current weight to its target and reports whether the gap is worth acting on:

```
currentPct_i  = value_i / totalValue
driftPct_i    = currentPct_i − target_i
needsRebalance = |driftPct_i| > threshold
maxDrift      = max_i |driftPct_i|
```

`rebalanceThreshold` defaults to **0.05 as an absolute weight difference** — five percentage points. This is asymmetric in a way that matters. For a 2%-target sleeve, a 0.07 weight is 7 points of drift but 250% relative; for a 50%-target sleeve, 0.07 is 7 points and 14% relative. A single absolute threshold applies a wildly different rebalancing urgency to a satellite and a core holding. Where a multi-asset allocation is in use, set the threshold per sleeve, or use a relative rule such as `|driftPct_i| > k · target_i`.

`stageRebalance` creates one transfer per holding that crossed the threshold, sized at `|driftPct_i| × totalValue`, directed at `to` (or the symbol itself if `to` is absent), and each staged with `status: 'staged'`, `requiresConfirmation: true` and `dryRun` set. Nothing is executed: the Skill never moves money, and a staged transfer is a proposal awaiting a person. `blocked` collects the transfers it could not build, which in practice means a missing `from` or `to` or a non-positive amount.

Four effects the drift calculation deliberately does not model, and a practitioner must account for them separately: **new cash flows** (contributions and withdrawals rebalance continuously and are usually the cheapest way to drift back), **dividends and coupons** received in kind, **tax on the disposal** that the correction would trigger, and **trading costs and minimum ticket sizes** that make a small correction uneconomic. The one rebalancing method that avoids the tax and the cost entirely is to redirect new contributions to under-weight sleeves until the drift closes. Where a taxable account sits beside a tax-deferred one, the correction is usually to buy the under-weight asset inside the account that is already positioned to hold it.

## Risk tolerance as a policy label

`riskTolerance` accepts `Conservative`, `Moderate`, `Aggressive` and `Very Aggressive`. In the current implementation it is recorded and displayed and **no mathematics is attached to it**: it is a label on the analysis, not an input to it. A production mapping should bind the label to an explicit target portfolio volatility and a policy asset-class weight, something on the order of:

| Label | Target volatility | Indicative policy allocation |
| --- | --- | --- |
| Conservative | 4–6% | 20–30% growth, 50–60% fixed income, remainder cash |
| Moderate | 8–10% | 50–60% growth, 30–40% fixed income, remainder cash |
| Aggressive | 14–16% | 80–85% growth, remainder fixed income |
| Very Aggressive | 20%+ | ~100% growth |

The label is an input to a suitability conversation with an adviser, never a substitute for one. Volatility capacity is a function of time horizon and loss tolerance jointly, and a client who can tolerate a 40% drawdown in a five-year horizon may have a completely different capacity over two. Suitability is determined by horizon, liquidity needs, liabilities and the client's own stated behaviour under stress — not by a dropdown.

## Composite evaluation scoring

`evaluate` computes a weighted linear composite across supplied criteria:

```
score_i = Σ_k weights_k · criteria_{i,k}  /  Σ_k weights_k
```

over the criteria that are present and numeric for symbol `i`, and ranks descending. Three properties of that formula are worth knowing because they affect the ranking:

- The denominator is the sum of weights of the **available** criteria, not of all criteria. A symbol missing one criterion is scored on a renormalised basis, so a thin record can outrank a complete one on the strength of the factors it happens to have. Fix: require a minimum criteria coverage, or impute the missing value and penalise the symbol.
- No cross-sectional standardisation is applied. A criterion on a 1–5 scale dominates a criterion on a 0.01 scale. Fix: z-score each criterion across the candidate set before weighting.
- Symbols with no numeric criteria get `score: null` and `source: 'insufficient-input'`, and are excluded from `ranked`. A short ranking that is not read as short is a silent omission.

## Configuring this

Every threshold, multiplier and default in this document is a shipped value, not a rule. `portfolio-risk-advisory` takes its covariance matrix, expected returns, views, confidence map, constraints, scenarios, `confidenceLevel`, `holdingPeriod`, `volatility` and `riskFreeRate` per call; `bill-pay-rebalancing` takes `rebalanceThreshold` (default 0.05) and the `targets` map per call. An operator tightening or loosening the risk budget, the drift band, the VaR confidence level, the volatility unit convention, the minimum criteria coverage, or the mapping from a risk-tolerance label to a target allocation, does it through the persisted configuration of those Skills, and the effective values should be restated alongside any output that depends on them. The equal-weight starting allocation, the three-case `z` table and the unit-less `volatility` field are properties of the current build rather than configuration, and they are the first things to fix when the optimiser proper is implemented.
