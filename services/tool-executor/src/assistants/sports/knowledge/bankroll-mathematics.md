# Bankroll Mathematics: Kelly Criterion, Expected Value, Variance and Drawdown

This handbook covers the arithmetic behind the Bankroll Co-Pilot Skill: how a stake is sized, how much growth a given size is expected to produce, how much variance it carries, and where each of those quantities stops being a useful guide. Every formula here is implemented or directly consumed by `sports-bankroll-co-pilot`, whose output fields (`kellyFraction`, `kellyStake`, `maxKellyStake`, `unitBasedStake`, `edge`, `impliedProbability`, `expectedLoss`, `variance`, `violations`, `responsiblePlay`) are the vocabulary the assistant reports in. This is self-discipline software: it never places a wager and never touches a sportsbook account.

## Notation

| Symbol | Meaning |
| --- | --- |
| `B` | current bankroll, the quantity being staked as a fraction of |
| `b` | net odds, `b = o − 1`, where `o` is the decimal price |
| `o` | decimal odds, gross payout multiplier including the stake |
| `p` | the model's estimated win probability, in [0, 1] |
| `q = 1 − p` | loss probability |
| `f` | fraction of the bankroll staked on this wager |
| `s = f·B` | the stake in currency |
| `r_f` | the risk-free rate used when a reserve is held alongside the action |

The distinction between `o` and `b` is where sizing errors start. A price of 2.00 is `o = 2.00` and `b = 1.00`. Feeding `o` where `b` belongs halves the Kelly fraction on a fair coin flip.

## Edge and expected value

Edge is the model's disagreement with the price, expressed in probability units:

```
edge = p − 1/o
```

`impliedProbability = 1/o` is the break-even probability, and `edge > 0` is the condition the Skill's recommendation logic tests before returning `APPROVE` rather than `HOLD`.

Expected profit per unit staked, from the two outcomes directly:

```
EV = p·(o·s − s) + q·(0 − s) = s·[p·o − 1] = s·o·edge
```

So `EV = stake × o × edge`. Three consequences follow directly and each of them is a discipline:

- **EV scales linearly in the stake.** Doubling the stake doubles the expected profit and doubles the expected loss. There is no size at which a negative-edge wager becomes positive.
- **The break-even probability is exactly `1/o`.** At p = 1/o the wager is a fair coin, EV is zero, and the only variable is variance. Wagering to win a price that is fair is the fastest way to convert a working bankroll into a variance.
- **The minimum edge is a cost decision, not a probability decision.** A wager at 2.00 returning a 5% model return on turnover must be compared against the return on not wagering. That is the argument for fractional staking, and for a reserve.

The `expectedLoss` field the Skill reports is not the net expected value. It is `stake × (1 − p)`, the expected magnitude of the losing branch only. Net expected value is `stake × o × edge`, and the two move in opposite directions: a bet with a large edge has a small `expectedLoss` and a large net EV. Report both when a decision is material.

## The Kelly criterion

Kelly maximises the expected logarithm of final wealth, not the expected final wealth. That distinction is the whole reason it is the right objective: growth is multiplicative, so the quantity to maximise is `E[ln(W)]`, and maximising expected wealth instead would rationalise an all-in bet every time.

Starting wealth `B`, wager fraction `f`. A win multiplies wealth by `1 + f·b`; a loss multiplies it by `1 − f`. Expected log growth per wager is

```
g(f) = p·ln(1 + f·b) + q·ln(1 − f)
```

Setting the derivative to zero:

```
g'(f) = p·b/(1 + f·b) − q/(1 − f) = 0
      ⟹ p·b·(1 − f) = q·(1 + f·b)
      ⟹ p·b − q = f·b·(p + q) = f·b
```

and since `p + q = 1`,

```
f* = (p·b − q) / b = (p·(o − 1) − (1 − p)) / (o − 1) = (p·o − 1) / (o − 1)
```

which is the form the Skill computes as `kellyFraction`, clamped to `[0, 0.25]`. The clamp at zero is the important half: a negative `f*` means no bet at all, and a Kelly practitioner who wagers anyway is converting a negative-expectation wager into a positive-stake negative-expectation wager. The upper clamp bounds the arithmetic case, though in practice the responsible-play cap below binds first.

Note that `f* > 0` exactly when `p·o > 1`, that is exactly when `edge > 0`. Kelly and the edge test are the same test; the fraction is the magnitude.

### A worked case

Price 2.40, model probability 0.47.

```
b      = 2.40 − 1        = 1.40
edge   = 0.47 − 1/2.40   = 0.47 − 0.4167 = 0.0533
EV/u   = o · edge        = 2.40 × 0.0533 = 0.1280  (12.8% of the stake, per wager)
f*     = (0.47 × 2.40 − 1) / 1.40 = (1.128 − 1) / 1.40 = 0.0914  (9.14% of bankroll)
```

On a 10,000 bankroll that is a full-Kelly stake of 914, a half-Kelly stake of 457, and a quarter-Kelly stake of 229. The Skill's own `single-bet-cap` fires above 5% and its `max-stake-percent` above 10%, so on this wager the cap is the binding constraint, not Kelly. A 9.14% Kelly stake is not a size anyone should take from a 5% model edge with a standard error of several points on `p`.

### Full, half and quarter Kelly

Kelly's `f*` maximises growth assuming `p` is known exactly. It is not. The standard error of a win rate estimated from `n` uncorrelated observations is `√(p(1−p)/n)`, and at p = 0.47 with n = 100 that is 0.0500 — so the true fraction could plausibly be anywhere from roughly −0.04 to 0.22. Full Kelly on a noisy `p` is a bet sized for a certainty that does not exist.

The standard remedy is a fraction of `f*`, and the growth cost of each is exact rather than approximate. Substituting `f = k·f*` into the quadratic approximation of `g` gives `g(k·f*) = (2k − k²)/4 · g(f*)`:

| Stake size | Multiple of `f*` | Growth retained | Drawdown scale | Robust to `p` error? |
| --- | --- | --- | --- | --- |
| Quarter Kelly | 0.25 | 43.75% | 0.25× | yes |
| Half Kelly | 0.50 | 75.00% | 0.50× | yes |
| Three-quarter Kelly | 0.75 | 84.38% | 0.75× | partly |
| Full Kelly | 1.00 | 100% | 1.00× | no |
| 1.5× Kelly | 1.50 | 75.00% | 1.50× | no — overdrawn |
| 2× Kelly | 2.00 | 43.75% | 2.00× | no — worse than half Kelly |

The table is the argument for fractional Kelly in one line: **overbetting Kelly by 2× produces less growth than betting half Kelly, with twice the drawdown.** The cost of the fractional convention is small and bounded; the cost of the error is unbounded.

Half Kelly is the default recommendation for a reason that is not visible in the table: it is the largest fraction whose growth is monotonically increasing in `k`, so a modest error in `f*` costs growth on one side and a smaller loss on the other. Quarter Kelly is the right choice whenever the probability estimate rests on a small sample, a single analyst, or a market the model is structurally worse at pricing.

The Skill reports the full-Kelly figure as `kellyFraction` and `kellyStake = B · kellyFraction`, alongside `maxKellyStake = 0.05 · B`. The `0.05` cap and the `0.25` upper clamp on `kellyFraction` disagree by a factor of five, and the responsible-play cap is the one that binds. An operator who wants half-Kelly behaviour in the reported figures should scale `kellyFraction` in configuration; the shipped build reports full Kelly and lets the cap arbitrate.

## Variance of a wager

The two outcomes of a wager are `o·s` (win, probability p) and `0` (loss, probability q). Since profit is outcome minus a constant, profit has the same variance as outcome:

```
Var = p·q·(o·s)²          σ = s·o·√(p·q)
```

Compare that with the mean, `s·o·edge`. The signal-to-noise ratio of a single wager is

```
EV / σ = edge / √(p·q)
```

which is the quantity to compare across wagers, not `edge`. Two 5% edges are not the same wager: at p = 0.47, `√(p·q) = 0.4995` and the ratio is 0.107; at p = 0.90 with the same 5% edge, `√(p·q) = 0.30` and the ratio is 0.167. The high-probability wager is a better bet on identical disagreement with the market.

The Skill's `variance` field is computed as

```
variance = (o·s − s)² · p + (−s)² · q
```

which is the second moment of profit, `E[profit²]`, not the variance. The true variance subtracts the square of the mean:

```
Var_true = s²·[ (o−1)²·p + q − (p·o − 1)² ]  =  s²·p·q·o²
```

Use `s²·p·q·o²` when standard deviation is needed, for example to express a target in standard deviations or to scale a stress test. The shipped field is a conservative over-statement of the spread and should be read as one.

## Bankroll growth rate

Over `N` statistically independent wagers of equal size, expected log wealth is `N·g(f)` and the log-wealth standard deviation is `√N · σ_g(f)`, where

```
σ_g(f)² = p·b²·(1+f·b)² + q·(1−f)²
```

The long-run growth rate of the bankroll is conventionally expressed in percent per period as `(e^g − 1) · 100`. Two facts follow that no practitioner should have to discover the hard way:

- **Growth in log wealth is what is linear in the number of wagers.** Doubling the number of wagers does not double the bankroll; it doubles the expected log wealth, and the bankroll multiplies as `e^(2·N·g)`. This is the entire argument for accepting a lower arithmetic return per wager in exchange for a higher wager count, and for refusing to increase size to chase a target.
- **The wagers are not independent.** Serial correlation in a betting programme — chasing losses, reacting to the previous result, staking more after wins — is the mechanism that produces ruin in practice. `p = 0.52` at even money with 4% of bankroll stakes and perfect discipline has a positive `f*` and, in a strictly fair random walk, a probability of eventual ruin approaching zero. The same programme with Martingale staking has `f* = 0` and a probability of ruin of one.

The continuous approximation `g(f) ≈ f·μ − f²·σ²/2`, with per-wager mean return `μ = p·o − 1` and variance `σ² = p·q·o²`, gives `f* = μ/σ²` directly. Use it for a quick sizing sanity check; use the exact logarithmic form when the wager count is small or the price is short.

## Drawdown

Drawdown at time *t* is measured from the running peak:

```
DD_t = (peak_t − W_t) / peak_t
maxDD = max_t DD_t
```

Drawdown is a path statistic, not an expectation, and its distribution is what matters. The standard large-deviation approximation for the probability that a log-drift process hits a drawdown of at least *d* over a horizon is

```
P(max drawdown ≥ d) ≈ 1 − exp( − 2·g·N·d / σ_g² )        (per-wager σ_g, N wagers, small d)
```

The two things this equation makes precise:

- **Drawdown scales linearly with the stake fraction while growth scales quadratically.** Reducing size by half halves the drawdown and retains 75% of the growth. Halving the size of a full-Kelly programme is the single most effective risk lever available, and it costs one quarter of the growth rate.
- **Drawdown probability compounds with the number of wagers.** A programme sized to a 10% drawdown over 100 wagers will breach 10% over 1,000. Any drawdown tolerance stated without a horizon is meaningless, and a stated tolerance without a recovery plan is a plan to stop.

The classical ruin result is the limiting case: for a game with negative log drift, the probability of eventual ruin is one; for a game with positive log drift, a full-Kelly bettor has a probability of ruin approaching one half. This is the theoretical justification for never staking full Kelly, and it is conservative in practice because most negative-drift wagering programmes are stopped by their owner before the asymptotic event arrives.

## Unit sizing and session control

Flat staking in fixed units decouples size from the estimate, which is why it survives estimation error. The Skill computes `unitBasedStake = unitSize · unit` and tracks `currentUnits` against `unitLimit` (default 100 units), flagging a `unit-limit` violation when one more unit would breach the ceiling. A unit is conventionally 1% of bankroll, and a session ceiling of 100 units is therefore 100% of bankroll of exposure across a session — exposure, not loss, and the distinction matters.

The `single-bet-cap` fires above 5% of bankroll and `max-stake-percent` above 10%. Note that both can fire on the same wager; `violations` is an array, `blocked` is true when it is non-empty, and `reason` concatenates the messages. `REJECT` is returned on any violation, `APPROVE` when a positive edge is present and clean, and `HOLD` otherwise. `HOLD` is the correct and common answer: most proposed wagers are not mispriced, and a system that approves them all is not evaluating edge.

`responsiblePlay` reports `sessionExposure` (cumulative `session.wagered`), `bankrollPercent`, `unitsUsed`, `unitLimit` and `cooldownMinutes` (default 5). The cooldown is the cheapest control in the entire system and the one most often disabled: a fixed pause between wagers breaks the action-reaction loop that converts a sequence of independent decisions into a correlated programme.

## Honest limits of the session ledger

The session record splits stakes into `won` and `lost` on the supplied `winProbability` relative to 0.5, not on settlement. Those fields are a record of what the model believed, not realised profit and loss, and they will disagree with the bankroll if the model is wrong. Read them as a confidence diary. For realised P&L, reconcile the bankroll itself.

`confidenceLevel` (default 0.95) is accepted as an input for variance reasoning but is not currently used in the sizing calculation. If a variance-aware adjustment is added, it belongs in the `f` that is applied, not in the reported `f*`: with parameter uncertainty the growth-optimal stake is strictly below full Kelly, and the reduction grows with the variance of `p`, not with its level.

## Configuring this

Every percentage, limit and default in this document is a shipped value, not policy. `sports-bankroll-co-pilot` takes `bankroll`, `unitSize`, `stake`, `odds` and `winProbability` per call, and takes `unitLimit` (default 100 units), `currentUnits`, `cooldownMinutes` (default 5) and `confidenceLevel` (default 0.95) from its own configuration or the call. An operator who wants quarter-Kelly behaviour overrides the fraction applied to `kellyFraction` in the Skill's persisted configuration, and moves the `single-bet-cap`, `max-stake-percent` and `maxKellyStake` caps there as well, together with the Kelly upper clamp of 0.25 and the unit-to-bankroll ratio. Session state persists in the Skill's own store keyed by `sessionId`, so the exposure ceiling is a per-session configuration value rather than a hard limit on the code. The recommendations in this handbook are a sizing methodology; the numbers that govern any individual session are the operator's.
