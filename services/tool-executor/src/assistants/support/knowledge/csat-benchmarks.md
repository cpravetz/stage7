# CSAT Benchmarks and Satisfaction Measurement

How the support assistant interprets customer satisfaction, which scores it actually produces, and what a good or bad number means in a given queue. `support-sentiment-analysis` scores the tone of a message, `response-drafting-user` and `response-drafting-notifier` draft replies, and `analytics-planning` runs the scheduled satisfaction review. None of them compute CSAT for you; this handbook defines the measure, the segments that must be cut, and the reading rules that keep a score from being quoted out of context.

## The measures

| Measure | Question | Scale | Cadence | Owner |
| --- | --- | --- | --- | --- |
| CSAT | How satisfied were you with this interaction? | 1–5 or 0–10 | Per resolved contact, immediately on close | Support |
| CES | How easy was it to get your issue resolved? | 1–7 | Per resolved contact | Support |
| NPS | How likely are you to recommend us? | -100 to +100 | Periodic, relationship-level | Product / Marketing |
| FCR | Was this resolved on first contact? | percent of contacts | Per contact | Support Ops |
| TTR | How long from open to resolution? | duration | Per contact | Support Ops |
| Reopen rate | Contacts reopened within 7 days of resolution | percent of resolutions | Per resolution | Support Ops |
| Churn / retention | Did the relationship survive the period? | percent | Monthly or quarterly | Customer Success |

CSAT measures a specific resolved interaction. NPS measures the relationship. They correlate and they are not substitutes: a team can run a 95% CSAT on a base that is quietly churning, and an NPS can be propped up by a segment that has never filed a ticket.

## CSAT specifically

The two standard forms:

- **5-point**: `CSAT = (4s + 5s) / total responses`. Top-two-box. Commonly the easier of the two to move, and the easier to inflate.
- **10-point (NPS-style)**: report as a 0–10 average. The 9–10 promoters and 0–6 detractors split naturally out of it.

- **Response rate** — `CSAT responses / resolved contacts`. A CSAT computed on a 4% response rate describes the 4%. This is the number most often left out of the slide, and it is the one that decides whether the rest of the figure means anything.
- **Segment everything.** CSAT by tier, by channel, by issue category, by first-contact versus repeat, by tenure, by plan, and by whether an escalation occurred. Overall CSAT is an average of averages and hides the queue that is failing.

## Commonly-cited ranges

Roughly, across B2B and B2C support operations, a CSAT of 80–90% on a 5-point top-two-box scale is a reasonable operating target, with 90%+ regarded as strong and below 70% as a problem that needs an owner rather than a dashboard. CES of 4.0+ on a 1–7 scale is a commonly cited target. First-contact resolution above 70% is frequently treated as the practical ceiling, because beyond that the remaining cases are structurally hard. These are conventions, not research findings, and they are meaningless without the response rate, the segment, and the scoring scale attached.

**Rule:** never quote a CSAT target or a benchmark without the scale, the response rate, and the segment. "We score 92%" on a 5-point top-two-box over a 3% response rate on tier-1 email is not a good result.

## The assistant's own scores

Two of the support skills produce satisfaction-adjacent numbers, and both should be read as placeholders until the underlying store is populated with real records.

| Skill | Field | Value | What it actually is |
| --- | --- | --- | --- |
| `support-sentiment-analysis` | `sentiment` | `positive` / `negative` / `neutral` | Derived from a character-count heuristic on the message text, not from a language model |
| `support-sentiment-analysis` | `confidence` | 0.75 | A fixed constant, not a calibrated probability |
| `support-sentiment-analysis` | `score` | -1, 0, or 1 | Bounded ordinal label only; do not average it |
| `support-sentiment-analysis` | `source` | `ticket` / `chat` / `email` / `survey` / `review` | Where the text came from; sentiment norms differ sharply by source |
| `support-issue-analysis` | `rootCause` | "Requires investigation" until classified | Placeholder; classification is a human judgement today |
| `support-issue-analysis` | `category` | `general` by default | Replace with a real taxonomy before segmenting anything |
| `support-issue-analysis` | `confidence` / `urgency` | 0.5 / `medium` | Defaults, not measurements |
| `response-drafting-user` | `confidence` | 0.8 | Confidence in the draft, not customer satisfaction |
| `analytics-planning` | `stats` | `sum`, `avg`, `min`, `max`, `count` | Computed over the `value` field of rows in the `analytics` store |

The rule that follows: **a stored `confidence` from these skills is a drafting or triage aid and must never be presented as a satisfaction signal.** Sentiment from one message is not CSAT; CSAT is from a person answering a question about a resolved interaction.

## What actually moves CSAT

In rough order of leverage, and consistent across most post-mortem work:

1. **First-contact resolution.** A solved-on-first-contact contact scores high; a solved-on-third contact often scores on the fix, not the score.
2. **Time to first response.** The strongest single lever on perception, disproportionate to its cost.
3. **Tone on escalation.** When a contact reaches tier 2, satisfaction is decided by how the handoff felt. This is where `response-drafting`'s `tone` input — `professional`, `friendly`, `empathetic`, `technical`, defaulting to `empathetic` — earns its place.
4. **Self-service success.** A resolved contact from the knowledge base scores higher than the same issue resolved by an agent, and costs less.
5. **Agent tenure and familiarity.** Not controllable at short range; controllable through knowledge base quality.
6. **Reopens.** A reopen is a near-certain score of 1, and it also poisons TTR and FCR simultaneously.

## Measurement hygiene

- **Ask once, at close, about the resolution** — not about the agent's friendliness and not about the product in general. The question determines the answer.
- **Keep the scale fixed.** Changing from 5-point to 10-point breaks the series permanently.
- **Separate the two audiences.** End users and administrators filing from the same tool have different expectations and different baselines.
- **Do not survey the unhappy twice.** Re-survey after remediation is a separate measure (recovery CSAT), not a correction to the original.
- **Watch for response bias.** The people who answer are systematically different from the people who do not. Track response rate by segment and reweight if the gap is wide.
- **Report the denominator.** CSAT without a response count is a number someone chose to publish.
- **Give every dissenter a path.** An unanswered 1 out of 5 is a missed recovery and an unused root-cause signal.

## Queue-level reading guide

| Signal | Likely reading | First thing to check |
| --- | --- | --- |
| CSAT down, FCR flat | Escalations got harder, not the front line | Tier mix and recent category changes |
| CSAT down, FCR down | Process or product change | Deploy timeline against the drop date |
| CSAT flat, TTR rising | Customers accept the wait but the load is building | Queue depth and staffing |
| CSAT down, response rate up | The newly-answering population is unhappy | Response-rate shift by segment |
| CSAT up, reopen rate up | Agents are closing tickets to score well | Resolution quality and 7-day reopen |
| High CSAT, low ticket volume | Maybe the easy problems are the only ones arriving | Deflection or intake friction |

## Working the numbers

A worked example, because the arithmetic is where most CSAT reporting goes wrong.

A queue resolves 1,000 contacts in a month. 120 customers answer the survey: 30 give 5, 60 give 4, 18 give 3, 8 give 2, 4 give 1.

| Measure | Value |
| --- | --- |
| Response rate | 120 / 1000 = **12%** |
| CSAT (top-two-box) | (60 + 30) / 120 = **75.0%** |
| Mean score | (5x30 + 4x60 + 3x18 + 2x8 + 1x4) / 120 = **3.77** |
| Mean score on respondents only | 3.77 |
| Implied score on the 880 non-respondents | unknown — this is the 88% the figure says nothing about |

75% against a typical 80–90% target looks like a miss. Now consider the same month split by tier:

| Segment | Responses | CSAT | Response rate |
| --- | --- | --- | --- |
| Tier 1 email | 70 | 86% | 9% |
| Tier 2 chat | 35 | 69% | 18% |
| Billing | 15 | 53% | 4% |

Two different problems are hiding in the aggregate: tier 2 chat is underperforming, and the billing queue is failing badly at a response rate too low to trust. A single blended number would have produced one action item; the segment view produces two, both correct. This is the whole argument for segmentation.

**Confidence interval.** On 70 responses, a CSAT of 86% has a margin of error of roughly ±8 points. Never declare a month-on-month move of 5 points to be a real change on a segment this size. On the full 120, ±7 points. Only differences larger than the interval are signal.

## Recovery CSAT

A satisfied customer who had to complain first has told you two things: the product failed, and the service recovered. Those are separate measurements and conflating them destroys the signal.

- **Initial CSAT** — asked at close. Measures the failure.
- **Recovery CSAT** — asked after the remediation, on contacts that scored low initially. Measures the service relationship.

A healthy operation shows initial CSAT around 75% and recovery CSAT around 90%. Initial CSAT of 75% with recovery CSAT of 70% means the fix works and the handling does not — a coaching and staffing problem, not a product one. The two numbers together diagnose which.

## Connecting CSAT to the other measures

- **CSAT vs FCR** — the tightest relationship in support operations. FCR is the leading indicator, and it can be moved without waiting for a survey cycle.
- **CSAT vs TTR** — correlation is strong but non-linear. The first hour of delay does more damage than the next eight; expectation setting beats raw speed.
- **CSAT vs escalations** — expect a small satisfaction dip on escalation, which recovers if the handoff is clean. Expect a permanent drop if the customer repeats themselves.
- **CSAT vs NPS** — ticket CSAT and NPS diverge when the relationship is deeper than the support interaction. Read them as two lenses, never as substitutes.
- **CSAT vs churn** — the weakest of the four in most datasets. Churn is driven by value realised, not by a support score. Do not let a CSAT improvement be sold as a retention improvement.

## What the assistant's stores hold

For anyone computing these numbers from the assistant's persisted data, the stores and their shapes:

| Store key | Written by | Row shape |
| --- | --- | --- |
| `tickets` | `support-resolve-ticket` | `{ id, ticketId, issue, resolution, status, createdAt, source }` |
| `sentiment` | `support-sentiment-analysis` | `{ id, sentiment, score, confidence, source, createdAt }` |
| `issues` | `support-issue-analysis` | `{ id, rootCause, category, confidence, urgency, analysisType, customerInfo, createdAt }` |
| `kb` | knowledge base articles | `{ id, title, body }` |
| `templates` | response templates | `{ id, name, body }` |
| `responses` | both drafting skills | `{ ticketId, response, alternatives, confidence, suggestedActions, kbReferences, tone, template, createdAt, source }` |
| `analytics` | the analytics feed | `{ date, value }` pairs |

Two structural gaps worth stating plainly, because they bound what can be computed here:

- **No survey store.** There is no `csat` or `survey` collection written by any skill. CSAT cannot be computed from these stores today; it has to arrive from a survey platform or be added.
- **No survey id on `responses`.** A drafted reply is not a survey response and does not link to one. Any future CSAT table needs a survey identifier that reaches the drafted reply record.

The `score` on a `sentiment` row is a three-value label and `confidence` is a fixed 0.75. Aggregating either produces a number with no relationship to satisfaction. Use `sentiment` for routing and queue triage; use it never as a satisfaction proxy.

## Configuring this

The 80–90% top-two-box target, the 4.0+ CES target, the 70% FCR ceiling, the 7-day reopen window, and the segment list above are conventions for reading the numbers, not values any skill enforces. The operator-controlled settings are the `reportType` selector on `analytics-planning` (`operational`, `financial`, `quality`, `customer_satisfaction`), its `period` of `7d`, `30d`, `90d`, `YTD`, `1y`, and its `granularity` of `day`, `week`, or `month`, together with the `tone` and `includeKB` inputs on the drafting skills and the `eventTypes` and `targetChannels` selectors on the notifier. Pin your own targets, your segment taxonomy, and your survey instrument in the assistant's persisted configuration and the scheduled review cadence, and require a response-rate figure alongside every CSAT number that leaves the team.
