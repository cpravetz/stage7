# Executive Compensation Benchmarks

This handbook governs how the Career & Executive Search Advisor frames compensation for senior and executive candidates. It covers the compensation battlecard the Interview & Negotiation Prep skill produces, the target-compensation signal carried on ranked roles, the pay-band normalization used across discovery, and the negotiation structure the assistant coaches candidates through. Treat the figures here as defaults and commonly-cited planning ranges, not as authoritative survey data; the operator configures the bands the candidate actually negotiates against.

## Where compensation comes from

The Resume & Market Positioning Advisor reads the top ranked roles and carries the first role's `estimatedCompensation` (or `compensation`) as the `targetComp` recommendation. Discovery normalizes pay from three sources:

- Structured pay metadata — Greenhouse salary metadata entries whose name matches `salary`, `compensation`, or `pay range`.
- Compensation components — Ashby `compensation.summaryComponents` where `compensationType` is `Salary`, read as `{minValue, maxValue, currencyCode}`.
- Free-text ranges — Lever `salaryRange` and any ad copy, parsed into `{min, max, currency, raw}`.

A listing with no readable pay carries `salary: null`. That is unknown, not zero, so it never drags the salary axis down on a role the candidate cannot yet price.

## Pay-band normalization

Free-text pay strings are normalized before they are compared:

- Extract every numeric value; treat a trailing `k` or `K` as thousands.
- `min` is the lowest value, `max` the highest; a single figure sets both.
- Currency is detected from symbols (`$`, `€`, `£`) or ISO codes (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `INR`).
- The raw string is truncated to 200 characters for display.

The salary axis then scores overlap against the candidate's configured target range:

```
overlap     = max(0, min(listingMax, targetMax) − max(listingMin, targetMin))
salaryScore = min(1, overlap / (targetMax − targetMin))
```

A band that sits entirely inside the target range scores 1.0; a band that misses it entirely scores 0.

## Commonly-cited executive ranges

The ranges below are planning defaults an operator can anchor to a market, not survey findings. They are illustrative starting points for a negotiation conversation and are expected to be replaced by role-specific, region-specific data.

| Level | Illustrative base range (USD) | Typical variable component |
|---|---|---|
| Director | 150,000 – 220,000 | 15–30% target bonus |
| VP | 200,000 – 320,000 | 20–40% target bonus |
| C-suite | 280,000 – 500,000+ | 30–60% target bonus, equity |

Total-compensation conversations for executive roles commonly separate base salary, annual bonus, and long-term equity; the assistant coaches candidates to negotiate the full package rather than base alone.

## The negotiation battlecard

Interview & Negotiation Prep generates a company-specific briefing with two parts: a list of interview questions and a compensation negotiation script. The negotiation guidance is prompted to cover market-rate context, what to negotiate beyond base salary, and key tactics. The briefing records which tool produced each part (`delegatedTo`) and whether it came from a delegated tool or a direct model call (`sourceNote`), so a thin answer can be traced to its source.

## Negotiation coaching structure

Coaching for an executive candidate walks, in order:

1. Anchor on the market read — the `targetComp` carried from the top ranked role, and the candidate's own floor.
2. Price the full package — base, bonus target, equity, and sign-on, not base in isolation.
3. Negotiate beyond salary — title, scope, reporting line, equity vesting, remote arrangement, and review timing.
4. Prepare the leverage — competing offers, internal-band evidence, and the cost of a wrong hire at this level.
5. Rehearse the ask — a specific number or range, stated with the reasoning behind it.

## Total compensation components

Executive compensation is rarely a single number. The assistant coaches candidates to price the full package, whose components are:

- **Base salary** — the fixed annual cash component.
- **Annual bonus** — a target percentage of base, paid against performance.
- **Long-term equity** — stock options, RSUs, or restricted stock, usually vesting over a multi-year schedule.
- **Sign-on bonus** — a one-time payment, often used to bridge forfeited compensation.
- **Benefits and perquisites** — retirement matching, health coverage, and executive perquisites.

A common planning default is to treat the target bonus as a percentage of base (often cited in the 15–60% range for executive roles depending on level) and to value equity at its grant-date fair value rather than its headline share count. These are planning conventions, not survey findings.

## How targetComp is derived

The Resume & Market Positioning Advisor derives its `targetComp` recommendation mechanically:

1. Take the ranked roles from Fit Ranking.
2. Read the first role's `estimatedCompensation`, falling back to `compensation`.
3. Carry that value as the `targetComp` recommendation.

Because the recommendation is the top role's own pay band, it reflects the market the candidate is already searching, not a generic benchmark. A search dominated by one band will produce a narrow recommendation; widening the search widens the read.

## The negotiation conversation

The Interview & Negotiation Prep skill generates a company-specific briefing in two parts:

- A list of interview questions for the role and company.
- A compensation negotiation script covering market-rate context, what to negotiate beyond base salary, and key tactics.

The briefing records which tool produced each part (`delegatedTo`) and whether it came from a delegated tool or a direct model call (`sourceNote`), so a thin answer can be traced to its source. Each topic is resolved from a delegated tool first, and a direct model call runs only when the delegation yields nothing usable.

## Negotiation coaching structure

Coaching for an executive candidate walks, in order:

1. Anchor on the market read — the `targetComp` carried from the top ranked role, and the candidate's own floor.
2. Price the full package — base, bonus target, equity, and sign-on, not base in isolation.
3. Negotiate beyond salary — title, scope, reporting line, equity vesting, remote arrangement, and review timing.
4. Prepare the leverage — competing offers, internal-band evidence, and the cost of a wrong hire at this level.
5. Rehearse the ask — a specific number or range, stated with the reasoning behind it.

## Benchmarking sources and their limits

A market read is only as good as the listings behind it. Keep in mind:

- The read is built from the roles Fit Ranking found, so it covers only the boards that answered. A partial discovery produces a partial read, and the assistant reports that rather than a clean market view.
- Listings with no readable pay (`salary: null`) are excluded from the comp signal, not scored as zero.
- Pay bands in postings are often ranges, not the actual offer; the overlap score measures fit against the range, not the eventual number.
- Currency is normalized, but cost-of-live and regional adjustments are not applied; a USD band and a EUR band are compared numerically only after currency detection.

## Confidentiality and data handling

Compensation data is sensitive. The assistant stores the candidate's target range and the listings it read in the candidate's own workspace, and it does not transmit a candidate's compensation expectations to any external source. The battlecard is generated per company and per role, and it is a coaching artifact for the candidate, not a disclosure to an employer.

## Escalation and follow-up

When a candidate's target range and the market read disagree, the coaching priority is to reconcile them before negotiating:

- If the market read is below the candidate's floor, widen the search to higher-band roles before adjusting the floor.
- If the market read is above the candidate's floor, the candidate has room to anchor higher.
- If the top role carries no readable pay, the read is thin; run discovery against more companies before treating the recommendation as a market.

The battlecard skill is deadline-bounded: it resolves each topic within its configured budget and emits a structured result rather than hanging, so a slow model call degrades to a partial briefing instead of a failed run.

## Configuring this

The pay bands, the overlap formula, and the coaching order are defaults. Operators set the candidate's actual target range through `minSalary` and `maxSalary` on Profile Intake and Job Discovery, which drive the salary axis and the overlap score. The compensation battlecard itself is produced by the Interview & Negotiation Prep skill, which takes `company` and `targetRole` and delegates to the interview-prep and advisory tools; its per-topic deadlines are tuned through the skill's configuration (`skillBudgetMs`, `delegatedTimeoutMs`, `brainFallbackTimeoutMs`).
