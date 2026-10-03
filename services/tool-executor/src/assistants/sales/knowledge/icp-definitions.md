# ICP Definitions

This handbook defines the Ideal Customer Profile signals the B2B Sales & Pipeline Intelligence Assistant scores a lead against. It covers the demographic, firmographic, engagement, and behavioral signal tables the Lead & Deal Advisory rubric reads, the point value of each signal, and how a signal is matched from free-text fields. Use it to define an ICP, to weight a signal for a specific market, or to explain why a lead scored the way it did.

## Demographic signals

Demographic scoring reads the lead's title and industry.

**Title seniority** — matched from the normalized title text:

| Seniority | Points | Match rule |
|---|---|---|
| C-level | 20 | `c`, `chief`, `ceo`, `cto`, `cfo`, `cmo` as a word |
| VP | 18 | `vice president`, `vp`, `svp`, `evp` |
| Director | 15 | contains `director` |
| Manager | 10 | contains `manager` or `head of` |
| Individual | 5 | `individual` or `contributor` |
| Unknown | 0 | no match |

**Industry** — matched from the normalized industry string:

| Industry | Points | Match rule |
|---|---|---|
| Tech | 15 | `tech`, `software`, `saas` |
| Finance | 15 | `financ`, `bank`, `insur` |
| Healthcare | 14 | `health`, `medic`, `clinic` |
| Manufacturing | 12 | `manufactur`, `industrial` |
| Retail | 10 | `retail`, `commerce` |
| Other | 5 | fallback |

## Firmographic signals

Firmographic scoring reads company size and annual revenue.

**Company size:**

| Size tier | Points | Match rule |
|---|---|---|
| Enterprise | 20 | contains `enterprise` |
| Mid-market | 15 | contains `mid` |
| SMB | 10 | contains `smb` or `small` |
| Unknown | 0 | no match |

**Annual revenue** — scored by band, on the numeric value supplied:

| Revenue (USD) | Points |
|---|---|
| ≤ 10 | 2 |
| ≤ 100 | 5 |
| ≤ 1,000 | 10 |
| > 1,000 | 15 |

Revenue is scored only when a numeric `annualRevenue` is supplied; an absent value scores 0 and is listed as unassessed.

## Engagement signals

Engagement signals are boolean flags inside the lead's `engagement` object. Each recognized flag set to `true` adds its points; unrecognized keys are reported as ignored rather than silently dropped.

| Signal | Points |
|---|---|
| `demoBooked` | 25 |
| `contentDownloaded` | 15 |
| `emailClicked` | 10 |
| `linkClicked` | 10 |
| `webinarAttended` | 10 |
| `emailOpened` | 5 |

## Behavioral signals

Behavioral signals are read from the lead's `behavioral` object:

| Signal | Rule | Points |
|---|---|---|
| `pageVisits7d` | per visit, capped | +2 each, max 10 |
| `productPageVisits` | per visit, capped | +3 each, max 15 |
| `pricingVisited` | boolean | +15 |
| `competitorVisited` | boolean | −10 |
| `daysSinceLastEngagement` | decay per day, capped | −0.5 per day, max −10 |

The competitor visit is a negative signal; recency decays the score the longer it has been since the last engagement. Visit arrays are clamped so a single lead cannot saturate a dimension through volume alone.

## Defining an ICP with these signals

An ICP is expressed as the weight and threshold configuration, not as prose. To define an ICP:

1. Set the four dimension weights to reflect which signals matter (they must sum to 1.0).
2. Set `threshold` and `hotThreshold` to the qualification and hot bars for the segment.
3. Supply lead records with the demographic, firmographic, engagement, and behavioral fields the segment is defined by.
4. Read the per-signal rationale and the coverage summary to confirm the ICP is being measured, not assumed.

## Signal matching from free text

Demographic and firmographic signals are matched from normalized free-text fields, not exact enums:

- Titles and industries are lowercased and split on non-alphanumerics before matching.
- Seniority is matched on whole words where it matters: `c`, `chief`, `ceo`, `cto`, `cfo`, `cmo` as standalone words, so "chief" is not matched inside "kitchen".
- VP matches `vice president`, `vp`, `svp`, and `evp`; director matches any title containing `director`.
- Industry matches are substring tests on the normalized string: `financ` catches both "finance" and "financial".
- Company size matches `enterprise`, `mid`, and `smb`/`small` as substrings.

An unmatched field falls back to `unknown` (0 points for size and seniority) or `other` (5 points for industry), and the matched key is reported so a surprising score can be audited.

## Coverage reporting

Every scored lead reports what was and was not assessed:

- `matchedSignals` — the seniority, industry, and company-size keys that matched, plus the engagement flags that were set.
- `unassessedInputs` — the fields absent on this lead (for example `annualRevenue`, `engagement`, or `site activity`).
- A set-level coverage summary reports which fields were absent across how many leads.

A lead with no engagement signals reports "No recognized engagement signals were set"; unrecognized engagement keys are reported as ignored rather than silently dropped. This is what makes a partially scored lead set distinguishable from a fully scored one.

## Worked ICP example

Consider two leads:

- **Lead A** — a VP of Engineering (18) in tech (15) = 33 demographic; an enterprise company (20) with revenue 500 (10) = 30 firmographic; a demo booked (25) and a webinar attended (10) = 35 engagement; a pricing visit (15) and 3 product page visits (9) = 24 behavioral.
- **Lead B** — an individual contributor (5) in retail (10) = 15 demographic; an SMB (10) with revenue 5 (2) = 12 firmographic; an email opened (5) = 5 engagement; 10 page visits (10, capped) and a competitor visit (−10) = 0 behavioral.

Lead A's normalized total is well above the hot bar; Lead B's is near the cold floor. The difference is driven by seniority, firmographics, and the demo-booked signal, which alone is worth 25 engagement points.

## Configuring this

The point values, the revenue bands, the caps, and the decay rate are defaults. Operators redefine an ICP through the `weights` input, set the qualification bars with `threshold` and `hotThreshold`, and supply lead records carrying the `title`, `industry`, `companySize`, `annualRevenue`, `engagement`, and `behavioral` fields above. The dimension maxima (35 / 35 / 75 / 40) are fixed by the rubric and are reported alongside every score so a normalized score can be read against its own scale.
