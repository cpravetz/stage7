# DORA Metrics and Delivery Health

The four metrics behind `cto-team-delivery-health-evaluator`, how the evaluator computes each one, and what it does with team capacity and sprint velocity. This is the reference for the `doraAssessment`, `teamCapacity`, and `sprintVelocity` blocks in its output — and, just as importantly, for the places where those blocks are weaker than the names suggest.

## The four key metrics

| Metric | Direction | Definition | Evaluator's source field |
| --- | --- | --- | --- |
| Deployment frequency | Higher is better | How often code reaches production | `metrics.deployments.length` |
| Lead time for changes | Lower is better | Time from commit to production | mean of `deployments[].leadTimeDays` |
| Change failure rate | Lower is better | Share of deployments causing a failure | `deployments.filter(d => d.failed).length / deployments.length` |
| Time to restore service | Lower is better | Time from failure to restored service | `metrics.dora.mttr` or `metrics.dora.timeToRestore` |

The first two are flow; the second two are stability. They are a system, not a scorecard — pushing deployment frequency up while change failure rate rises is not progress, it is moving the risk somewhere it will show up later. The research DORA published after its earlier work made this explicit: no metric is good or bad on its own, and optimising one at the expense of another is the failure mode the framework was designed to prevent.

Deployment frequency is a count over whatever period the data covers, and the evaluator counts deployments in the supplied window without dividing by its length. Weekly and monthly figures are therefore not comparable — which is exactly why the `period` input (`week`, `month`, `quarter`) has to stay fixed for a series to mean anything.

## Performance bands

DORA's original work grouped teams into performance levels by the combination of all four:

| Cluster | Deployment frequency | Lead time | Change failure rate | Time to restore |
| --- | --- | --- | --- | --- |
| Elite | On-demand, several per day | Less than a day | 0–15% | Under an hour |
| High | Between daily and weekly | Between one day and one week | 16–30% | Under a day |
| Medium | Between weekly and monthly | Between one week and one month | 31–45% | Under a week |
| Low | Less often than monthly | Over a month | Above 45% | Over a week |

These are the commonly cited bands. Treat them as orientation rather than targets — the right value depends on your change risk profile, your review capacity, and your regulatory regime. A payments provider moving weekly is not performing badly by the standards of its industry.

## Evaluator thresholds

The evaluator does not implement the four-cluster table. It compares each metric against a single threshold and emits `elite` or `limited`:

| Metric | Threshold key | Default | Passes when |
| --- | --- | --- | --- |
| Deployment frequency | `deploymentFrequencyThreshold` | 1 (deployments per week) | `value >= threshold` |
| Lead time | `leadTimeThresholdDays` | 7 | `value <= threshold` |
| Change failure rate | `changeFailureRateThreshold` | 0.15 | `value <= threshold` |
| Time to restore | `mttrThresholdHours` | 24 | `value <= threshold` |

Defaults worth naming explicitly: **one deployment per week, a seven-day lead time, a 15% change failure rate, and 24 hours to restore.** Those are the numbers in the compiled evaluator and they are the numbers a report will quote when nothing is configured. The change failure rate default matches the elite band; the 24-hour restore default matches the low band. If that combination is not deliberate, configure it rather than inheriting it.

Each entry reports `{ value, threshold, status }`. Change failure rate is rendered as a percentage in the report body; the underlying value is a decimal rounded to four places.

## Capacity

Each entry in `metrics.teamMembers` becomes a row with `name`, `role`, `capacity`, `availableHours`, and `status`. Capacity falls back from `member.capacity` to `member.utilization`, and `availableHours` is that figure times 40:

| Capacity | `status` |
| --- | --- |
| `> 0.85` | overloaded |
| `> 0.7` | at-capacity |
| otherwise | available |

Totals across the team report `totalCapacity` and `avgCapacity`. This is nominal availability, not delivered work — it is a planning input, not a performance measure, and it should never be read as one. A team at 100% availability has no slack, and a team reporting 0.6 may be describing a reporting habit rather than a workload.

## Velocity

Each entry in `metrics.sprints` becomes `{ sprint, plannedPoints, completedPoints, velocity }` with:

```
velocity = completedPoints / max(plannedPoints, 1)
```

`plannedPoints` falls back from `plannedPoints` to `plan`, and `completedPoints` from `completedPoints` to `actual`. The average across sprints is `sprintVelocity.averageVelocity`, and `trend` compares the last sprint's velocity with the first: `improving`, `declining`, `stable`, or `insufficient-data` when fewer than two sprints are present.

Two readings of that ratio, and they must not be mixed:

- **As a completion ratio** (completed ÷ planned) it says how reliably the team hits its commitments. A ratio below 1 sustained across sprints is a planning problem.
- **As absolute throughput** it says nothing at all — a team with twice the size produces a ratio near 1 in both cases. Story points are not comparable across teams and were never intended to be.

Velocity trends are also noisy over two sprints and are heavily confounded by scope change. Use the absolute completed points per sprint for trend and the ratio for forecast accuracy. Keeping both in the same output is what allows that distinction to be made.

## The multi-metric trap

- **Deployment frequency is not productivity.** It counts deploys, including deploys of configuration, dependency bumps, and reverts.
- **Lead time is not cycle time.** Cycle time is per work item; lead time for changes is per change, and the two diverge the moment a release batches several commits.
- **A low change failure rate can mean a high change failure *count*.** Forty deployments at a 5% failure rate has two failures; five deployments at 0% has none. Always read the two together.
- **Time to restore is a system property, not an agent property.** Detect, decide, deploy, and verify. Improving it usually means better automation, not faster typing.
- **No metric here measures customer value.** All four measure the delivery system. A team can be elite on all four and build nothing anyone wants.

## A worked reading

One team, one month, against the shipped defaults (1 deploy/week, 7-day lead time, 15% change failure rate, 24-hour restore):

| Metric | Value | Threshold | Status |
| --- | --- | --- | --- |
| Deployment frequency | 12 | >= 1 | elite |
| Lead time | 4.2 days | <= 7 | elite |
| Change failure rate | 18.75% | <= 15% | limited |
| Time to restore | 31 hours | <= 24 | limited |

Read as a system: this team ships often and quickly, and roughly one deploy in five causes a failure which then takes over a day to recover from. That is the unstable half of the framework, not the slow half. The correct response is to slow down and improve the safety rails — smaller batches, more automated verification, feature flags, better rollback — not to celebrate twelve deploys. If the response had been "ship more often", the change failure rate would rise and the team would be further from every DORA cluster than it is now.

Note also that 12 deployments over a month is `2.4` per week, comfortably clearing a threshold expressed as "deployments per week". The evaluator counts rather than rates, so this comparison only holds because `period` stayed at `month`. Change it and the number silently changes meaning.

## Leading and lagging

Each of the four sits at a different point in the cycle, and that determines how quickly it responds to an intervention:

| Metric | Position | Responds to |
| --- | --- | --- |
| Deployment frequency | Leading | Batch size, review queue length, release automation |
| Lead time | Leading | Queue time in review, test duration, batch size |
| Change failure rate | Lagging | Test coverage, review depth, change size |
| Time to restore | Lagging | Rollout automation, observability, runbooks, on-call staffing |

A team fixing test coverage moves the change failure rate and time to restore weeks or months later. Judge the intervention on the leading metrics in the meantime, or it will be judged as a failure before it has had a chance to work. The flip side: leading metrics are easy to game, so never report them without the lagging pair beside them.

## Sizing the error budget

The availability target is a budget you spend, not a number you hit.

| Availability target | Monthly downtime allowance | Per day |
| --- | --- | --- |
| 99% | about 7 hours 12 minutes | about 14 minutes |
| 99.9% | about 43 minutes | about 1.4 minutes |
| 99.95% | about 22 minutes | about 43 seconds |
| 99.99% | about 4 minutes | about 8.6 seconds |

Budget policy is the useful part: when the budget is unspent, release velocity rises and deploys get smaller; when it is exhausted, features freeze and only reliability work ships. This is the mechanism that stops a team optimising deployment frequency into instability, and it is why the change failure rate is worth more attention than its simplicity suggests.

## Where the evaluator does not compute

Being explicit about this matters more than the numbers:

- **Per-team or per-service DORA.** One row of `deployments` produces one set of four numbers. There is no partitioning.
- **Trend or history.** Each run is a point estimate over its window. Nothing is compared against the previous run.
- **P50 or P95 lead time.** Only the mean of `leadTimeDays`, which hides a long tail completely.
- **Change lead time (the DORA fourth metric as recently redefined).** The `leadTimeDays` field is taken as given.
- **Per-deployment history or offending commits.** No linkage from a failed deploy back to the change.
- **Error budgets and burn rate.** No SLO data is consumed at all.
- **Anything without `team-metrics`.** `cto-team-delivery-health-evaluator` delegates to `cto-infrastructure-query` with `provider: team-metrics`, and without that provider wired it returns `success: false` with a not-connected error rather than a zeroed report. A report showing DORA metrics is evidence the provider answered, and a failure is never a zero score.

## Interpreting the output

The rendered report gives, per metric, the value, the threshold, and the status, then per-member capacity, then per-sprint velocity and the trend line. Read it in that order and hold three questions:

1. Which threshold is being missed — is it the threshold or the delivery system that moved?
2. What is the denominator? Ten deployments in a week is a different statement from ten in a quarter.
3. What does the configuration say? An unmet threshold against a configured target is a performance conversation; an unmet default is a configuration conversation.

## Configuring this

`deploymentFrequencyThreshold` (1 per week), `leadTimeThresholdDays` (7), `changeFailureRateThreshold` (0.15), and `mttrThresholdHours` (24) are the evaluator's defaults, declared in its `configSchema` and overridable in the assistant's persisted configuration, where they are merged with saved values and passed through to the readiness path. The `period` selector (`week`, `month`, `quarter`) and the `systems` list are per-run inputs and are the operator's real lever on comparability. Set the four thresholds to your own agreed targets rather than the elite/low hybrid they ship with, fix one `period` per series so deployment counts stay comparable, and treat a `limited` status as the start of an investigation rather than a verdict on the team.