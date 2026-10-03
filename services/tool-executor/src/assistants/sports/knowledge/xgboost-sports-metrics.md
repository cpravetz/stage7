# XGBoost Modelling and Probability Metrics for Sports Forecasting

This handbook covers how win probabilities and key in-game event forecasts are produced for the Wagering Group of the `sports` Assistant, and how those probabilities are judged before they are allowed to inform a stake. The runtime currently serves a deterministic momentum-and-lineup heuristic; the gradient-boosted tree setup described here is the target it is being replaced by, and the metric suite is the acceptance test that governs the replacement. Read the implied-probability section carefully: every probability the models produce is only interpretable relative to a bookmaker's price.

Group isolation applies. The Performance Group (`sports-tactical-roster-evaluator`, `sports-battlecard-creator`, `sports-scouting-alert-dispatcher`) holds roster, scouting and health data and its outputs never reach a wagering Skill. The Wagering Group (`sports-matchup-odds-explainer`, `sports-bankroll-co-pilot`, `sports-line-alert-dispatcher`, `sports-predictor-ad-hoc`, `sports-ingame-predictive-modeling-scheduled`) may only read market prices, play-by-play and lineup availability.

## Prediction targets

Two models are maintained, and they answer different questions.

| Model | Question | Label | Unit of observation |
| --- | --- | --- | --- |
| Pre-game classifier | Which side wins this fixture? | 1 if home side wins, else 0 | one row per fixture |
| In-game classifier | Given the state at clock *t*, does the home side still win? | 1 if home side ultimately wins, else 0 | one row per (fixture, observation time) |

Three-way sports (soccer, cricket, some hockey) need a second setup: a three-class model over {home, draw, away} with `multi:softprob` and one output node per class. Sibling class probabilities must sum to 1 or the implied-probability arithmetic downstream is meaningless. A binary model silently forces the draw into the away class, which inflates the away-side edge by exactly the draw probability.

For any market with a push or void outcome (totals, spreads, player props), the label must be three-class {win, push, loss}, not binary. Collapsing a push into a loss overstates the loss rate and understates the true Kelly stake.

## Feature engineering

Feature construction is where a sports model is won or lost. The rules below are non-negotiable.

- **As-of joins only.** Every feature for observation time *t* must be built from data timestamped at or before *t*. Joining a table on the fixture identifier and then filtering on the timestamp is the correct pattern; joining on the fixture identifier and then filtering on the *fixture end time* is leakage.
- **Trailing aggregates, always lagged.** A rolling mean over the last *n* observations of a team is computed over data strictly before *t*. Write it as `value.shift(1).rolling(n).mean()`, never `value.rolling(n).mean()`.
- **Expanding means with a minimum sample.** A team with three games played has a batting average that is not a rate. Require a minimum sample (default 10 prior observations) and fall back to a league prior, shrinking toward the mean rather than emitting a raw sample.
- **No in-sample opponent statistics.** Team A's strength estimate for a fixture must not include that fixture's own result. Because the pre-game model is one row per fixture, this is automatic; the in-game model is not, because the same fixture generates many rows.
- **Freeze the feature set at prediction time.** A model that has seen a different column set at training time must not be served. XGBoost is index-based and will not error on a shifted column layout; it will silently score garbage. Pin and assert the training feature order.

Feature families used in production:

| Family | Examples | Leakage risk |
| --- | --- | --- |
| Team strength | trailing points per possession, expected points differential, rolling efficiency | high if the current game is in the window |
| Opponent-adjusted | opponent-adjusted rating, `team_rating − opponent_rating` | medium; needs the opponent's own prior data only |
| Availability | starters out, minutes-weighted lineup value, key-player on/off | high; injury news timestamp must precede *t* |
| Rest and schedule | days rest, games in last 14 days, back-to-back flag, travel distance | low |
| Venue | home/away/neutral, `lineup.homeAdvantage` | low |
| Game state | time remaining, score differential, period, overtime flag | only valid for the in-game model |
| Momentum proxies | scoring runs, turnover count, possession share over the last *k* plays | only valid for the in-game model |
| Market prior | de-vigged implied probability from the opening and current line | high if the current line is used at the opening timestamp |

The market-prior feature is the most powerful and the most dangerous. It is legitimate only at the timestamp of the line it uses. Feeding the closing line into a model that is asked to predict the closing line teaches the model nothing and inflates offline scores.

The `sports-predictor-ad-hoc` input schema names the live feature surface directly: `playByPlay[]` with `time`, `quarter`, `eventType`, `scoringTeam` and `points`; `lineup.homeAdvantage` and `lineup.keyPlayer`; `momentum` in {strong, neutral, weak}; and `timeRemaining`. `gameStatus` in {in-progress, halftime, overtime} gates which feature families are valid at all.

## The current heuristic baseline, and its known defects

`modelVersion: 'v7-ingame'` is the shipped estimator. It is an additive, unweighted log-odds-free heuristic, recorded in full here so it is never mistaken for a trained model:

```
base                = 0.50
+ lineup.homeAdvantage                → +0.05
+ momentum == 'strong'                → +0.08
- momentum == 'weak'                  → −0.08
+ scoringRun (scored plays in the last 10 plays) > 6  → +0.06
- scoringRun < 3                                  → −0.04
winProbability = clamp(result, 0.05, 0.95)
```

`scoringRun` counts entries with a non-null `scoringTeam` in the trailing 10 plays. The scheduled variant omits the play-by-play term and emits `winProbability` and `delta` to three decimals, where `delta` is `null` on first sight of a game so a movement is never invented for a game the Skill has not previously observed; `movements` counts games whose `|delta|` exceeds 0.01.

Three defects must be closed before this is replaced by a trained model, and the metric suite below is what proves they are closed:

1. **The clamp at 0.05 and 0.95 truncates the tails.** In a live game a 3-point lead with 30 seconds remaining genuinely carries a win probability above 0.95. The clamp forces a confident forecast to look uncertain, and it does so asymmetrically at both ends, which biases any downstream Kelly stake toward the middle.
2. **Additive adjustments are applied on the probability scale, not the logit scale.** Independent ±0.08 shocks summed linearly ignore the variance of the sum, so a combination of several moderate signals produces a probability that is too central. Working in log-odds, `logit(p) = ln(p/(1−p))`, and summing there respects the geometry.
3. **The momentum label is an input, not a measurement.** `momentum` in {strong, neutral, weak} is a three-level categorical supplied by the caller. A trained model should derive its own momentum signal from the trailing play window and treat any supplied label as one weak feature among many, not as a ±0.08 prior.

`keyEventPredictions` currently uses fixed confidences: a `momentum-shift` event at confidence 0.65 with window "next 5 min" when the trailing window holds more than 5 plays, and a `fatigue` event at confidence 0.60 with window "next 8 min" when turnovers exceed 4. These are declared constants, not calibrated estimates, and must be reported as such.

## Gradient-boosted tree configuration

XGBoost is the right learner here: the signal is non-linear, the features are heterogeneous and partly missing, interactions between availability and rest are real, and there is no scale to normalise away.

Starting hyperparameter set. These are defaults, not gospel.

| Parameter | Default | Rationale |
| --- | --- | --- |
| `objective` | `binary:logistic` | emits a probability directly |
| `eval_metric` | `logloss` | the metric that matters, not accuracy |
| `eta` (learning rate) | 0.05 | slow, with enough trees to keep variance down |
| `max_depth` | 5 | deeper trees memorise fixture-specific noise in small samples |
| `min_child_weight` | 10 | a leaf needs real support before it is split on |
| `subsample` | 0.8 | row subsampling, one seed per fold |
| `colsample_bytree` | 0.8 | feature subsampling, one seed per fold |
| `lambda` (L2) | 2.0 | default shrinkage on leaf weights |
| `alpha` (L1) | 0.0 | sparse linear terms are not a feature of this problem |
| `gamma` | 0.0 | let `min_child_weight` do the pruning work |
| `n_estimators` | 1000 | with early stopping, not chosen up front |
| `early_stopping_rounds` | 50 | on validation log loss, never on training loss |
| `scale_pos_weight` | `n_neg / n_pos` | only when the positive class is below roughly 20% |

Two determinism rules: fix `random_state` per fold and record it, and record the exact booster serialisation with every model. A `winProbability` that cannot be traced to a specific booster version and seed is not auditable.

## Splitting: the boundary that actually decides the score

Sports data is a time series with a clustered structure. Random splits leak and the leakage is invisible in the score.

- **Split chronologically, never randomly.** A random `train_test_split` on in-game rows puts observations from minute 47 into training and minute 46 of the same fixture into test. The model then appears to predict from game state when it has memorised the outcome.
- **Group by fixture.** Every row belonging to one fixture, at every observation time, must sit in exactly one of train, validation or test. Use a group-aware split keyed on the fixture identifier. In-game rows from one game are near-duplicates; splitting them apart inflates test scores substantially.
- **Purge and embargo.** The label of a fixture is only known at the fixture end, so any observation from a fixture whose end lies within the label horizon of a training observation is contaminated. Purge training rows within the label horizon of the validation start, and embargo validation rows immediately after the training window. For in-game data the label horizon is the whole fixture, so purging at fixture granularity is the minimum; a default embargo of one full fixture duration is applied.
- **Walk forward, do not hold out once.** The default evaluation is expanding-window walk-forward: train on fixtures 1..*k*, validate on *k+1*, advance, and report the mean validation metric across folds. A single holdout gives one noisy number from one market regime. Walk-forward across at least five folds is the default; regime change is exactly what a single split hides.
- **Scale and parameters are fitted on training folds only.** The covariance of the features, the imputation values, the prior base rate, the de-vig scaling factor and every hyperparameter are learned on the training window and then applied unchanged to validation and test.
- **Report the fold count and the per-fold spread.** A mean log loss of 0.61 with folds spanning 0.58 to 0.68 is a different object from a mean of 0.61 with folds spanning 0.60 to 0.62. The spread is the uncertainty.

## Calibration

A gradient-boosted classifier with a logistic objective is usually well ordered and often miscalibrated in the tails. Ordering (does a 0.7 bucket beat a 0.3 bucket) is not the same as calibration (does a 0.7 bucket actually win 70% of the time), and only calibration feeds a Kelly stake.

The reliability diagram is the primary artifact: bucket predictions into deciles, plot observed frequency against predicted probability, and inspect the diagonal. A model that is 0.08 low in the 0.5–0.6 bucket produces a systematically over-sized stake in exactly the range where most volume sits.

Three corrections, in the order they should be attempted:

1. **Platt scaling.** Fit `p' = σ(A·logit(p) + B)` on the validation set. Two parameters, almost no overfitting risk, and it fixes both a slope error and an intercept error. This is the default.
2. **Beta calibration.** `p' = I(a·p + b; α, β)` with the regularised incomplete beta function. Handles the near-0 and near-1 regions that Platt scaling compresses. Use when the reliability diagram shows curvature that Platt cannot remove.
3. **Isotonic regression.** A step function fit on validation data, the most flexible option and the one most able to overfit. Use only with a large validation set, and never fit it on the test set.

Refit the calibrator on validation data only, and re-verify on test. A calibrator fitted on the evaluation set converts an honest estimate into a leaked one.

Acceptance thresholds, all defaults and all operator-overridable: mean absolute calibration error at or below 0.05 across deciles; log loss at or below 0.62 against a 0.693 no-skill baseline on a balanced base rate; Brier score at or below 0.24 against a 0.25 no-skill baseline; and no single decile off the diagonal by more than 0.10.

## Metrics that matter for a probabilistic forecast

| Metric | Formula | Reads as | Default gate |
| --- | --- | --- | --- |
| Log loss | `−(1/N) Σ [ y·ln p + (1−y)·ln(1−p) ]` | proper scoring rule; punishes confident error hardest | ≤ 0.62 |
| Brier score | `(1/N) Σ (p − y)²` | mean squared probability error; decomposable into reliability and resolution | ≤ 0.24 |
| Brier decomposition | `BS = REL − RES + UNC` | separates miscalibration from lack of discrimination | REL ≤ 0.05 |
| Calibration error | mean `|p̄_bucket − ȳ_bucket|` | average distance from the diagonal | ≤ 0.05 |
| Log loss baseline | entropy of the base rate, `−[q ln q + (1−q) ln(1−q)]` | 0.693 at q = 0.5; the number to beat | always report |
| AUC | area under the ROC curve | ordering quality only; says nothing about calibration | secondary |
| Brier skill score | `1 − BS_model / BS_baseline` | 0 is worthless, 1 is perfect | > 0.04 |
| Probability movement MAE | mean `|p_t − p_{t+1}|` over consecutive observations | stability of the in-game signal | secondary |

Two reporting rules. Always print the no-skill baseline beside the score; a log loss of 0.61 is meaningless without the 0.693 it beats. And never report accuracy on a probability model: a model that always predicts the base-rate class scores the highest accuracy and has zero information content. ROC-AUC is likewise insufficient on its own, because a perfectly ordered and perfectly miscalibrated model has excellent AUC and terrible expected value.

For the scheduled in-game Skill, `delta` is the operational movement signal and `movements` counts games with `|delta| > 0.01`; the practitioner should read that 0.01 as a noise floor derived from the validation distribution, not as a constant. Establish it by measuring the distribution of `|p_t − p_{t+1}|` on held-out fixtures and setting the floor at a chosen percentile, default the 90th.

## Implied probability, the vig, and the fair price

A decimal price *o* is a gross payout multiplier: a stake *s* returns *o·s* on a win and 0 on a loss. The break-even probability is therefore

```
impliedProbability = 1 / o
```

which is exactly the field `sports-matchup-odds-explainer` reports, and exactly the value `sports-bankroll-co-pilot` uses for `impliedProbability`. A price of 2.00 implies 0.50, 1.91 implies 0.5236, and 1.25 implies 0.80.

The sum of implied probabilities across a mutually exclusive market is the overround. For a two-sided market,

```
totalImplied = 1/o_A + 1/o_B
vig          = totalImplied − 1
```

and `sports-matchup-odds-explainer` reports `odds.vigPercent` as `(totalImplied − 1) × 100`. A typical two-way market prices at 1.91 / 1.91, so `totalImplied = 1.0471` and the vig is 4.71%. Three-way markets add `1/o_draw` to the same sum.

Removing the vig is de-vigging, or making the book fair. The method the Skill applies is proportional (multiplicative) normalisation:

```
p_fair,i = p_raw,i / totalImplied
```

The reported `fairOdds` field is the same operation expressed in price space, `odds / totalImplied`, and the two are consistent: `fairOdds × totalImplied = odds`. Proportional normalisation is proportional to how much the book prices each outcome, so it silently assumes the book distributes the vig in proportion to its confidence.

Alternative treatments, none of which the Skill currently applies, and each of which shifts the edge by tens of basis points at typical vigs:

- **Additive.** `p_fair,i = p_raw,i − (totalImplied − 1)/n`. Assumes the vig is spread evenly. Biases toward longshots relative to the proportional method.
- **Shin.** Solves for the insider-trading parameter *z* implied by the observed overround, then `p_fair,i = (√(z² + 4(1−z)·p_raw,i²/(1−z)) − z) / (2(1−z))`. Corrects for the well-documented favourite–longshot bias, in which longshots are systematically overbet and their raw implied probabilities sit above their true probabilities.
- **Power.** Fits a single exponent so that `Σ o_i^(1−k) = n` and rescales accordingly. A useful compromise between proportional and Shin.

Pick one method, apply it identically to training data and to production, and record which one was used. Changing the de-vig method silently invalidates a trained model whose strongest feature is the market prior.

### Edge and expected value

Edge is the difference between the model's probability and the market's, in probability space:

```
edge = p_model − 1/o
```

which is what `sports-bankroll-co-pilot` reports as `edge`, and which flips the recommendation to `APPROVE` when positive. Expected value per unit staked, derived cleanly rather than assumed, is

```
EV = p·(o − 1) − (1 − p) = p·o − 1 = o · edge
```

so `EV = stake × o × edge`. A model at 0.55 against a price of 2.00 has `edge = 0.05` and returns `EV = 0.10` per unit staked, a 5% return on turnover. The minimum acceptable edge is therefore the smallest `p` such that `o·edge` covers the cost of the wager, which at a 2.00 price is a 5% model-versus-market disagreement.

One honest limitation of the current explainer: it computes `expectedValue.evA` and `evB` by evaluating the supplied price against the *market's own* implied probability. Since `1/o × o × s = s`, that expression returns exactly zero for every market by construction. The figure reflects the vig being spent, not a mispricing. A genuine expected value requires the model's `winProbability`, which is what `sports-bankroll-co-pilot` computes and what feeds the `edge` and `expectedLoss` fields. Never quote an expected value from the odds explainer as evidence of a value bet; it is not one.

## Practical limits

- **Sample size bounds everything.** The standard error of a win rate from *n* uncorrelated observations is `√(p(1−p)/n)`. At p = 0.55 and n = 100 that is 0.0497 — a 5-point standard error on a market that is itself spread over 2 points. Below roughly 500 observations a pre-game probability estimate carries less information about the true probability than the closing line does. Say so rather than quoting the point estimate.
- **Correlated fixtures are not independent observations.** A team playing back-to-back, and a market repricing after a single result, both violate independence. Effective sample size is materially below nominal sample size; the walk-forward fold spread is the honest measure.
- **In-game models degrade fast.** The further the observation sits from the final state, the less the score differential and the clock actually constrain the outcome. Report a stratified log loss by remaining time; a single aggregate number hides the collapse.
- **Bookmaker limits are part of the model.** A price the model likes is not a price available at the modelled size. Sharpness of the line, maximum stake and the timing of the best available quote are all inputs to whether an edge is realisable.
- **Calibration drifts with regime.** A calibrator fitted on one season is not valid on the next. Refit per walk-forward fold and re-gate on the calibration error, not just the log loss.

## Configuring this

Every coefficient, threshold and window in this document is a shipped default. `sports-ingame-predictive-modeling-scheduled` reads its scope from its own persisted configuration — `sports`, `teams`, `matchIds`, an optional `dateRange` and a `cadence` — and refuses to run when none of `matchIds`, `teams` or `sports` is set, because an unscoped live model is precisely what the scope schema exists to prevent. `sports-matchup-odds-explainer` and `sports-line-alert-dispatcher` read `oddsProvider`, `requestTimeoutMs`, and the `monitorInterval` and `maxAlertsPerHour` pair from their own configuration. An operator replacing the shipped heuristic with a trained booster overrides `modelVersion` and the feature window through the same persisted Skill configuration, and changes the noise floor behind the 0.01 movement threshold, the clamp bounds, and the log-loss, Brier and calibration-error gates. None of these numbers are hard-coded policy: they are the values the current build ships with.
