# SEO & Content Strategy Frameworks

This document defines the evaluation model, metric conventions, and structural templates used by the content strategy and SEO evaluator when ranking content performance records. All numbers are defaults; the operator overrides them through the content assistant's persisted configuration or the skill input schema.

## Relative Engagement Index

The evaluator works only on the set of records supplied or returned by a connected analytics tool. It never queries search volume or ranking data from outside that set. Each record is scored across up to three metrics:

| Metric field name | Formula | Source field |
|---|---|---|
| `ctr` | `(clicks / impressions) × 100` when both are supplied, otherwise `null` | `impressions`, `clicks` |
| `conversionRate` | `(conversions / clicks) × 100` when both are supplied, otherwise `null` | `clicks`, `conversions` |
| `keywordMatch` | supplied directly or taken from the fallback `keywordMatch` input parameter (0–100) | `keywordMatch` |

A metric is excluded from scoring when the operator did not supply its input fields, rather than being treated as zero. Excluded metrics are listed under `missingMetrics` on each record.

The `index` field is computed by scaling each available metric against the maximum value in the set:

```
scales[name] = (value / maxima[name]) × 100
index       = mean(scales)   rounded to one decimal place (range 0–100)
```

### Verdict thresholds

| Index range | Verdict label | Recommended action |
|---|---|---|
| `index >= 75` | `strongest in this set` | Expand distribution; add internal links and reuse the angle on adjacent topics |
| `50 <= index < 75` | `mid-pack in this set` | Test a new title and meta description |
| `index < 50` | `weakest in this set` | Verify the page matches its target search intent before rewriting |
| `index === null` | `not scorable` | Supply impressions, clicks, or conversions |

## Editorial Word Budgets and Section Plans

The drafting and adaptation tool (`content-drafting-adaptation`) applies these word-budget conventions when producing a brief. Each `length` value is a label, not a literal count; the operator changes the counts via the WORD_BUDGETS table in the skill.

| Content type | short | medium | long |
|---|---|---|---|
| `blog` | 600 | 1100 | 2000 |
| `case-study` | 500 | 1100 | 2000 |
| `newsletter` | 400 | 800 | 1400 |
| `whitepaper` | 1200 | 2500 | 5000 |
| `script` | 400 | 900 | 1600 |
| `video` | 250 | 500 | 900 |
| `email` | 150 | 300 | 500 |
| `social` | 90 | 180 | 300 |

### Section plans by content type

| Content type | Section order |
|---|---|
| `blog` | Hook and promise → Context and stakes → Main argument → Supporting evidence → Counterpoint or caveat → Conclusion and next step |
| `case-study` | Customer and problem → What was attempted → Outcome with numbers → Why it worked → What to copy |
| `newsletter` | Subject line → Opening → Primary story → Secondary items → Single call to action |
| `whitepaper` | Executive summary → Problem definition → Method → Findings → Recommendations → Limitations |
| `script` | Opening beat → Setup → Escalation → Turning point → Resolution |
| `video` | Hook (0–3 s) → Intro (3–10 s) → Segment 1 → Segment 2 → Segment 3 → Recap → Call to action |
| `email` | Subject line → Preheader → Opening → Value → Proof → Call to action |
| `social` | Hook → Value → Proof → Call to action |

## Flesch Reading Ease

Computed over supplied text using:

```
Flesch = 206.835 − 1.015 × (wordCount / sentenceCount) − 84.6 × (syllableCount / wordCount)
```

Readability bands used by the drafting tool:

| Score range | Band label |
|---|---|
| `>= 60` | plain |
| `50–59` | fairly easy |
| `30–49` | difficult |
| `< 30` | very difficult |

## Keyword Density Target

The drafting tool defaults to `1.0%` density for the primary keyword. The target occurrence count is:

```
useCount = max(1, round(targetWords × 1.0 / 100))
```

- Primary keyword: title, H1, and within the first 100 words.
- Secondary keywords: one H2 heading and one body mention each.

## Editorial Calendar

The editorial calendar skill (`editorial-calendar-article-copilot`) derives placement dates when no `deadline` is supplied:

```
dueDate = startDate + index × cadenceDays
```

Default `cadenceDays` is 7. Topic rows require `title`; they are rejected if they lack a parseable `deadline` or if `startDate` and `deadline` are both absent.

## Publishing Pre-Flight

The governed publishing skill (`governed-publishing-cms-dispatcher`) runs these SEO-convention length checks. These are industry conventions, not measurements of the destination CMS.

| Field | Convention | Advisory when |
|---|---|---|
| `title` | 10–70 characters | outside that range |
| `seoTitle` | 10–70 characters | outside that range |
| `seoDescription` | 50–160 characters | outside that range |
| `slug` | lowercase-hyphenated, under 75 characters | fails `^[a-z0-9]+(-[a-z0-9]+)*$` or length > 75 |

Slug is derived from `title` by replacing non-alphanumeric runs with hyphens and stripping leading/trailing hyphens when no `slug` is supplied.

Dispatch requires `dryRun: false` and `confirmation: true` simultaneously; otherwise the run stops at the approval gate and reports `confirmation-required`.

## Editorial Calendar Placement Rules

The `editorial-calendar-article-copilot` skill derives calendar dates when no `deadline` is supplied. The formula is:

```
dueDate = startDate + index × cadenceDays
```

Default `cadenceDays` is 7. A topic row is rejected if it has no `title`, if its `deadline` string is not parseable as a date, or if both `startDate` and `deadline` are absent. The `dueBasis` field on each row records whether the date came from a `supplied deadline` or from the derived formula.

### Brief generation delegation

The calendar skill delegates each placed topic to `content-drafting-adaptation` with `task: 'draft'`. The delegated call receives `contentType`, `topic`, `targetPlatform`, `targetAudience`, `tone`, `length`, and `keywords`. If delegation fails, the topic is marked `status: 'failed'` and its `error` field records the failure reason. The final report distinguishes `drafted`, `failed`, and `skipped` counts and always states how many of the scheduled topics actually received a brief.

## Publishing Pre-Flight

The governed publishing skill (`governed-publishing-cms-dispatcher`) runs SEO-convention length checks before any dispatch. These are industry conventions, not measurements of the destination CMS.

| Field | Convention | Advisory when |
|---|---|---|
| `title` | 10–70 characters | outside that range |
| `seoTitle` | 10–70 characters | outside that range |
| `seoDescription` | 50–160 characters | outside that range |
| `slug` | lowercase-hyphenated, under 75 characters | fails `/^[a-z0-9]+(-[a-z0-9]+)*$/` or length > 75 |

The slug is derived from `title` when not supplied: lowercased, non-alphanumeric runs replaced with hyphens, leading/trailing hyphens stripped. Live dispatch requires `dryRun: false` and `confirmation: true` simultaneously. The approval gate is the single most important guard in the publishing pipeline — without both flags, no payload leaves the system and the run reports `confirmation-required`.

## Configuring this

The threshold values above (index bands, word budgets, Flesch bands, keyword density, length conventions, cadence) are the shipped defaults. The operator overrides them per skill: `content-strategy-seo-evaluator` reads `keywordMatch` as a fallback from its input schema, `editorial-calendar-article-copilot` accepts `startDate` and `cadenceDays`, `content-drafting-adaptation` exposes `length` and `contentType` selectors, and `governed-publishing-cms-dispatcher` reads `dryRun` and `confirmation` from its input schema. Persisted assistant-level configuration takes precedence over skill defaults when both are provided.
