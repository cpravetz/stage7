# RICE, WSJF, and Initiative Prioritization

How the product assistant ranks competing work before anything is scheduled. The `create-roadmap` skill scores every goal with two formulas — RICE and WSJF — blends them, then topologically sorts the initiatives that serve those goals and places them against quarterly capacity. This handbook explains the arithmetic behind those fields, the defaults the skill applies when a value is missing, and the judgement calls the arithmetic cannot make for you.

## RICE

RICE was popularized by Intercom's product team. Reach, Impact, Confidence, and Effort are multiplied and divided:

```
RICE = (Reach x Impact x Confidence) / Effort
```

- **Reach** — how many users/accounts/events the work touches in the scoring period. The skill takes it as a raw count on the goal (`reach`, in the same unit your telemetry reports).
- **Impact** — the effect per user. The skill's input schema declares the scale as 0.25–3; a common anchor set is 3 = massive, 2 = high, 1 = medium, 0.5 = low, 0.25 = minimal.
- **Confidence** — your honesty about the other three. The skill accepts 0–1 and clamps it to that range. Common anchors: 100% = rock solid data, 80% = solid data or strong precedent, 50% = plausible, 20% = speculative.
- **Effort** — person-months in the original formulation, **person-weeks** in this assistant. Keep the unit consistent across the whole goal list or the ranking is meaningless.

When a goal omits a value, `create-roadmap` derives it from `priority` rather than defaulting everything to the same number:

| `priority` | Reach | Impact | Confidence (default) | Effort (default) |
| --- | --- | --- | --- | --- |
| `high` | 80 | 3 | 0.8 | 5 |
| `medium` | 40 | 2 | 0.8 | 5 |
| `low` | 15 | 0.5 | 0.8 | 5 |

Those fallbacks are a floor, not a recommendation. They exist so a half-filled goal list still produces a ranked output; a roadmap built entirely on them is a priority-sorted list wearing a scoring costume. Supply real reach from telemetry and real effort from the team before anyone commits to the order.

The skill rounds the result to four decimal places and reports it as `rice` on each goal, alongside the component values (`reach`, `impact`, `confidence`, `effort`) so a reviewer can dispute the inputs rather than the arithmetic.

## WSJF

WSJF — Weighted Shortest Job First, from SAFe — is built for teams that are capacity-constrained rather than reach-driven. It divides **Cost of Delay** by **Job Size**:

```
Cost of Delay = (Business Value + Time Criticality + Risk Reduction) / Job Duration
WSJF          = Cost of Delay / Job Size
```

This assistant uses the condensed single-metric form:

```
WSJF = ((Reach x Impact) + (Confidence x 10)) / Effort
```

- `Reach x Impact` stands in for business value, estimated from the same goal fields.
- `Confidence x 10` is a risk-reduction and time-criticality term: a low-confidence idea is treated as riskier to delay, which lifts its score.
- `Effort` is the same person-week figure used for RICE, so the two scores are directly comparable.

Result is rounded to four decimals and stored as `wsjf`.

## RICE vs. WSJF

| | RICE | WSJF |
| --- | --- | --- |
| Origin | Intercom | SAFe |
| Question it answers | "How much value per unit of cost?" | "Which job should we pull next given a fixed queue?" |
| Effort unit | Person-weeks (here); person-months originally | Person-weeks |
| Weak spot | Confidence is a self-assessment and gets rubber-stamped high | Blind to reach: two jobs of equal value rank identically regardless of audience size |
| Best for | Discovery-stage roadmaps, wide candidate lists | Release trains with a hard capacity ceiling |
| Penalty for bad inputs | Reach and impact inflate silently | Job size estimates are notoriously optimistic |

The skill does not pick one. It computes both, then sorts on the **blend**:

```
score = round((rice + wsjf) x 100) / 100
```

Ranking is descending on `score`. Goals are returned in that order, and each carries an `okrId` linking it to the generated OKR. `metrics.averageRice` reports the mean RICE across all scored goals so you can tell at a glance whether the list is dominated by large-reach or small-reach work.

The blend is a deliberate tiebreaker, not a known-good formula. It doubles the weight of reach and impact and, because WSJF's `confidence x 10` term is additive rather than multiplicative, it rewards high-confidence goals less aggressively than RICE does. If your portfolio has a specific shape — a regulatory deadline, a platform migration that everything else waits on — override the ordering deliberately and record why.

## Where these frameworks stop

- **ICE** (Impact, Confidence, Ease) is a 1–10 score per factor, multiplied. Faster to fill in, much easier to fudge. Useful for a fifteen-minute triage, not for a quarterly commitment.
- **MoSCoW** buckets rather than ranks: **Must have**, **Should have**, **Could have**, **Won't have**. Useful as a commitment negotiation device after ranking is done. Its weakness is that everything in the Must column is equally binding, which is exactly how scope inflation survives a planning meeting.
- **Kano** classifies features by the shape of the satisfaction curve: basic (absence is dissatisfaction), performance (more is better), excitement (absence is neutral, presence delights). Use it to protect the basics while arguing for the exciters; do not use it to rank, because it produces no ordering within a class.
- **Cost of Opportunity** — expected value lost by not doing the alternative. Most frameworks ignore it entirely. It is the number that settles "should we fix this or build the new thing", and it is the one most often missing from a roadmap.

## Scheduling the ranked goals

Scoring picks the order; scheduling is mechanical and lives in the same skill.

- **Dependency order** — initiatives are topologically sorted by Kahn's algorithm. Nodes with zero indegree are emitted first; anything left with a positive indegree after the queue drains (a dependency cycle) is appended rather than dropped.
- **Capacity** — `capacity` is team size and is treated as effort units available per quarter, with the same number for every quarter. `timeHorizon` is clamped to 1–12 and defaults to 4.
- **Packing** — each initiative in sorted order goes into the earliest quarter whose `available` capacity covers its `effort` (minimum 0.5 person-weeks). If nothing fits, it lands in the final quarter and consumes 30% of its effort against that quarter, which is how an unschedulable backlog shows up as an overcapacity conflict rather than silently vanishing.
- **Milestones** — `ceil(effort / 3)` milestones per initiative, each with `milestone_<initId>_<n>`, a `completionCriteria` of "Deliverable reviewed and accepted by stakeholders", and a `targetDate` derived from the assigned quarter plus three months per milestone.
- **Risk level** — from the initiative's own `risk` input: `> 0.6` = high, `> 0.3` = medium, otherwise low. Only high-risk initiatives become entries in `riskAssessment.risks`.

## Risks the schedule surfaces

- **Overcapacity** — a quarter where `used > capacity`, reported as a `resource_conflict` with `severity: high`. A `risk_capacity` entry with probability 0.7 is added whenever any conflict exists.
- **Shared dependencies in the same quarter** — two initiatives sharing a dependency and landing together become a `resource_conflict` at `severity: medium`. This is the common signal that a chain was scheduled in parallel by accident.
- **Deep dependency chains** — if the longest path in the dependency graph is depth 3 or greater, a `dependency_chain` risk is added at probability 0.5. Critical path is taken as everything at depth 2 or deeper.
- **Theme allocation** — themes are spread across the scheduled work with the first theme marked `primary`, the rest `supporting`, and a `balanceScore` reflecting distance from the centre of the theme list.

## Where reach comes from

RICE is only as good as its Reach estimate, and Reach is the input teams fabricate most often. Three defensible sources, in order of preference:

- **Measured counts** — accounts or users in the affected cohort over the scoring period. Use the same unit for every candidate in the list or the ranking is meaningless.
- **Segment size from a warehouse query** — the count of accounts matching the audience filter, run against the same table every quarter so the series is comparable.
- **Telemetry funnels** — the number of users who reached the step before the gap. Understates reach by the drop-off at the previous step, which is usually the conservative direction.

Do not use "all users" for reach. It is the most common way a list gets ranked by nothing more than how large the company thinks it is.

## A worked comparison

Four candidates over a quarter, all scored on the same inputs:

| Candidate | Reach | Impact | Confidence | Effort | RICE | WSJF | Blended | Rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Checkout retry | 8000 | 2 | 0.8 | 6 | 2133.33 | 2135.33 | 4268.66 | 1 |
| Search rewrite | 40000 | 0.5 | 0.5 | 20 | 500.00 | 502.50 | 1002.50 | 2 |
| Admin audit log | 300 | 3 | 0.9 | 8 | 101.25 | 114.75 | 216.00 | 3 |
| Mobile redesign | 25000 | 1 | 0.3 | 30 | 250.00 | 285.00 | 535.00 | 4 |

Read the table, not the ranking. The checkout retry wins on both formulas because it is cheap, confident, and reaches real volume. The mobile redesign has four times the reach of the checkout retry and still lands last — its low confidence and large effort are doing exactly what they should. If the business genuinely needs the mobile work this quarter, that is a portfolio decision made above the scoring layer, and the reason belongs in the roadmap next to the number.

The two formulas disagree rarely, because they share three of four inputs. Where they diverge, it is almost always the `confidence x 10` term pulling WSJF upward for low-confidence items. That divergence is the signal worth a conversation.

## Scoring mistakes

- **Confidence creep.** Every candidate ends up at 0.8 because 0.8 feels honest. Confidence is only useful if some candidates score below 0.6.
- **Effort optimism.** Estimates from the team that wants the work run 30–50% under reality in most organizations. Re-estimate anything that survives to the top of the list.
- **Impact inflation.** If every candidate is a 3, the impact column is decoration.
- **Unit drift.** Reach in users on one row and accounts on the next. The ranking is then a function of your bookkeeping.
- **Scoring a list you already decided.** Reversing-engineering scores to reach a predetermined answer produces a roadmap nobody trusts a quarter later.
- **Ignoring cost of opportunity.** The 25000-user redesign may beat the checkout retry on option value alone; RICE has no term for it.

## Jobs to be Done as the input

JTBD reframes a candidate as the progress a customer is hiring the product to make. It is the best available corrective to impact inflation, because "so that [benefit]" stops being a wish and starts being an observed struggle.

- **Functional job** — "when I need to reconcile two records, I want to see them side by side, so I can spot the discrepancy without exporting anything."
- **Emotional job** — "so I can stop worrying that I am missing something."
- **Social job** — "so my team trusts my numbers without checking them."

Write the job before the story. A candidate whose job cannot be stated in the customer's words has not been understood, and scoring it will produce a confident, useless number.

## Configuring this

Every number above is a default applied when the caller omits the value: reach 80/40/15 by priority, impact 3/2/0.5, confidence 0.8, effort 5 person-weeks, capacity 5 per quarter, `timeHorizon` 4 clamped to 1–12, risk bands at 0.6 and 0.3, dependency-depth risk at 3, critical path at 2, and the `rice + wsjf` blend. An operator overrides them by persisting the assistant's configuration for the `create-roadmap` skill — the runtime merges each skill's `configSchema` defaults with saved values — or by passing explicit values in the run input, which always win. The practical sequence is: set the team's real quarterly capacity and the person-week convention once in persisted configuration, then supply per-goal reach, impact, confidence, and effort in the request so the ranking rests on evidence rather than on the priority field.
