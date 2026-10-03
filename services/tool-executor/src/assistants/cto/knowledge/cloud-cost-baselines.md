# Cloud Cost Baselines and Unit Economics

How `cto-cloud-spend-infrastructure-optimizer` turns billing and utilization rows into rightsizing recommendations, and how to read them without acting on the number. The skill takes `billingRows` of `{ service, spend, utilization }`, produces a per-service recommendation, and reports `totalProjectedSavings`. Every assumption behind that estimate is a default, and the defaults are deliberately conservative. This handbook documents the arithmetic, the action bands, the baselines worth measuring first, and the traps that make a projected saving evaporate on contact with the invoice.

## What the evaluator computes

For each supplied row:

```
projectedSavings = spend x clamp((1 - utilization) x 0.45, 0, 0.35)
```

| Component | Value | Meaning |
| --- | --- | --- |
| Headroom | `1 - utilization` | Fraction of provisioned capacity not being used |
| Recovery rate | `0.45` | Share of headroom assumed convertible to removed spend |
| Cap | `0.35` | No service is ever projected to save more than 35% |
| Floor | `0` | A fully-utilized service projects zero savings |

`totalProjectedSavings` is the sum across rows. The report renders it with a dollar sign; the underlying values carry no currency, so pin one before the number leaves your team.

Read the ceiling on the formula: 35% of spend, ever. That cap is the single most important line in the estimator. A service at 5% utilization projects a saving, but never more than a third of what you spend on it — because real platforms have floors: baseline licences, minimum replicas, egress, control planes, and the fixed cost of the humans who run it. The cap encodes that. A report claiming a 60% saving from a rightsizing exercise is not this estimator's output.

## Action bands

| Utilization | `action` | What it usually means |
| --- | --- | --- |
| `< 0.30` | rightsizing or shutdown review | Genuinely oversized, or genuinely idle |
| `< 0.60` | reserved capacity review | Steady but not committed; commitments and autoscaling fit here |
| `>= 0.60` | monitor | Little headroom to recover; look at price and architecture instead |

The bands are drawn at 0.3 and 0.6, and each row records `{ service, currentSpend, utilization, projectedSavings, action }`. A service at 0.95 utilization and a service at 0.59 utilization are both labelled "monitor"-adjacent, but the first is a capacity risk and the second is a savings opportunity — the band alone does not tell you which, and the report does not distinguish them.

## The assumptions behind the 0.45

Before you accept a projected saving, know what has to be true:

- **Utilization is measured over a representative period.** Averages hide everything interesting. Sustained use matters; a service that spikes at month-end and idles the rest of the time is not 30% utilized, it is a batch job.
- **Utilisation maps to spend linearly.** It often does not. Reserved, committed-use, and spot pricing all break the relationship between idle time and invoice.
- **Nothing is re-created on demand.** Lowering capacity raises the chance of throttling, eviction, cold starts, and latency regression. The saving is real; so is the risk, and this estimator does not price the risk.
- **The workloads are independent.** A saving on one service that pushes load onto another is not a saving.
- **The measurement is current.** Billing rows for a closed month describe a system that has since changed.

## Baselines worth measuring first

Run these before any rightsizing exercise. Every one of them is a percentage of total spend, and the percentages are the commonly cited planning ranges, not measured facts about your account.

| Baseline | Share of spend commonly examined | What you are looking for |
| --- | --- | --- |
| Commitment coverage | 60–80% of steady-state compute | The gap between on-demand and committed. The cheapest savings in cloud, and the one that needs the least engineering. |
| Utilised vs provisioned | 30–50% | Aggregate provisioned-versus-used across the estate. The headline number a rightsizing exercise is trying to move. |
| Idle and orphaned resources | 5–15% | Unattached volumes, stopped instances, idle load balancers, forgotten staging environments, snapshots past their retention. Usually found in the first week and never argued about. |
| Storage class and lifecycle | 10–20% of storage | Cold data on hot tiers, no lifecycle policy, over-retention. |
| Egress and inter-zone | Highly variable | Cross-AZ chatter between services that never needed to be separate calls. |
| Observability spend | 5–15% | Cardinality explosions and retention set to "forever". |
| Gravitator-style lift-and-shift waste | Varies | A fixed monthly cost per environment that nobody has revisited since the migration. |

Compute the per-service unit cost before optimising anything. Unit cost — cost per request, per transaction, per active tenant, per job — is what turns a percentage saving into a capacity plan, because it is the number that stays flat when you grow. A service that costs a fixed monthly amount is a service whose unit cost improves as you grow for free.

## Cost attribution

- **Tag everything.** Untagged spend is unattributable spend, and unattributable spend is never reduced. Cost allocation is a prerequisite, not a follow-up.
- **Shared costs need an allocation rule** agreed in advance: per-request, per-tenant, or by environment. "We will work it out later" means the biggest line item stays unowned.
- **Chargeback and showback are different tools.** Showback informs; chargeback changes behaviour and requires defensible numbers.
- **Price is an architecture signal.** A line item that is a large share of spend is usually a design decision made years ago — an oversized cluster, an unbounded queue, a chatty service boundary.

## Levers, roughly in order of payoff

1. **Commit to what you already run steadily.** One- and three-year commitments on the steady-state baseline. Lowest effort, lowest risk, largest share of the available saving.
2. **Delete the idle.** Orphaned storage, stopped instances, unused load balancers, expired certificates, forgotten environments.
3. **Rightsize what is genuinely oversized.** Downsize instances, lower storage classes, add lifecycle policies.
4. **Fix the architecture.** Replace the cross-AZ chatter, stop the unbounded fan-out, cache what is being recomputed.
5. **Renegotiate at volume.** Worth doing once the estate is clean; worth less before.

Note the ordering. Committing to spend that you are about to delete is the most common way to lock in a cost rather than save one, so the first two levers precede the third, and the first two precede any architectural work.

## Pre-commitment checklist

- [ ] Is the workload steady enough to commit? Not a spike, not a test.
- [ ] Has it been deleted from the right-sizing list? Nothing that will be removed in the next 90 days belongs in a commitment.
- [ ] What is the exit cost if the workload shrinks or ends?
- [ ] Who owns the commitment for its full term?
- [ ] Is the utilisation data from a representative period, not a quiet fortnight?

## Reading the output honestly

`cto-cloud-spend-infrastructure-optimizer` fans each row out to `cto-infrastructure-query` with `provider: cost-optimization` and collects those results under `evaluationResults`. Where those calls fail, the failures are collected rather than swallowed and surface alongside the recommendations — a clean-looking savings total with failures behind it is a partial result, not a complete one.

Three honest caveats:

- **The projection is arithmetic, not a quote.** It is `spend x 0.45 x headroom`, capped. It does not know your discounts, your commitments, your egress, or your support plan.
- **Savings that require demand are not savings.** Rightsizing a service below its peak capacity converts a cost into an availability risk. Project the peak, not the average.
- **Total spend is a lagging indicator.** A month where spend fell because an environment was deleted is an improvement; a month where spend fell because traffic fell is a false positive. Always pair the number with a unit metric.

## A worked projection

Four services, one month, supplied as `billingRows`:

| Service | Spend | Utilization | Headroom | Raw recovery | Projected saving | Action |
| --- | --- | --- | --- | --- | --- | --- |
| payments-api | 42000 | 0.82 | 0.18 | 8.1% | 3402.00 | monitor |
| reporting-batch | 18000 | 0.22 | 0.78 | 35.1% → capped | 6300.00 | rightsizing or shutdown review |
| search-cluster | 9500 | 0.47 | 0.53 | 23.9% | 2263.20 | reserved capacity review |
| legacy-warehouse | 3100 | 0.11 | 0.89 | 40.1% → capped | 1085.00 | rightsizing or shutdown review |
| **Total** | **74600** | | | | **13050.20** | |

Total projected saving is 17.5% of spend. Three things to notice:

- **The cap binds twice.** `reporting-batch` computes 35.1% and `legacy-warehouse` computes 40.1%; both are clamped to 35%. Without the cap the reported total would be 14,467 — roughly 2,100 of projected saving that the estimator refuses to claim because you cannot remove two thirds of a running service.
- **`legacy-warehouse` is a shutdown, not a rightsizing.** At 11% utilization on 3,100 a month, the correct action is almost certainly deletion, and the saving is 100% of the line rather than 35%. The estimator will never tell you that, because it only models proportional downsizing.
- **`payments-api` at 82% has no savings and a capacity risk.** It is labelled "monitor" alongside `reporting-batch`'s band, but a service at 82% utilization that must absorb a Black Friday spike is a different conversation entirely.

Treat 13,050 as a floor estimate of the addressable pool from downsizing alone, not a forecast. The realistic figure needs the levers that the arithmetic does not model: commitments on what remains, deletion of what is not needed at all, and architecture changes on what is genuinely expensive to run.

## Unit cost

The metric that turns a percentage into a capacity plan.

```
Unit cost = total service cost / unit of business work
```

Work is anything with a denominator that grows with the business: requests, transactions, active tenants, jobs executed, documents processed. Two properties make it worth the effort to establish:

- **It stays flat when you scale efficiently.** A fixed monthly cost per environment, by contrast, improves its unit cost automatically as volume grows and hides the fact that nothing about the design improved.
- **It is comparable across environments.** Ten thousand dollars is not a large or a small number of spend; 0.4 cents per request is. Only the unit cost supports a judgement.

Keep one unit-cost metric per service, plotted over time, next to the savings figures. A saving that raises the unit cost of the customer-facing path is a cost.

## FinOps maturity

A rough self-assessment, and the order in which the practices should be adopted:

1. **Visibility** — you can attribute spend to teams and services. Nothing else works without this.
2. **Accountability** — a named owner per service who is shown their own number monthly.
3. **Consumption habits** — commitment coverage, lifecycle policies, idle-resource sweeps run on a schedule rather than remembered.
4. **Unit economics** — every service has a unit cost, and architecture decisions are made against it.
5. **Optimisation as a practice** — right-sizing is a monthly activity with a savings figure, not a one-off project with a report at the end.

Most teams are at level 1 or 2. The biggest available savings sit at levels 3 and 4, and neither is reachable without the work at 1 and 2. That is why "we need better tagging" is the correct answer to almost every cost conversation that starts at level 1.

## Configuring this

The 0.45 recovery rate, the 0.35 cap, the 0.30 and 0.60 utilization bands, and the currency rendering are the optimizer's compiled defaults. An operator overrides them in the assistant's persisted configuration for `cto-cloud-spend-infrastructure-optimizer`, and supplies `billingRows` and `context` per run; the per-service provider calls route through `cto-infrastructure-query` with `provider: cost-optimization`. Pin your real commitment-coverage target, your utilised-versus-provisioned target, and your idle-resource tolerance in the assistant configuration, keep a service-level unit-cost metric next to every saving figure, and treat any projection from the idle band (`utilization < 0.3`) as a hypothesis to verify against thirty days of data before a single resource is resized.