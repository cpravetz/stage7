# Editorial Style Guide

This document specifies the prose style rules the content drafting and adaptation tool applies when planning briefs and measuring source text. The guide does not describe how to write creative fiction or marketing copy; it defines the structural and readability conventions the tool can verify computationally. All parameters are defaults and operator-configurable.

## Tone Presets

The drafting tool accepts one of eight tone labels. The label drives sentence-complexity guidance in the brief; it does not change the word budget.

| Tone label | Intended register |
|---|---|
| `professional` | Credential-led, precise, third-person or authoritative first-person |
| `conversational` | Direct second-person, contractions accepted, short sentences |
| `authoritative` | Declarative, evidence-first, minimal hedging |
| `friendly` | Warm, inclusive, plain vocabulary |
| `witty` | Playful word choice, short punch lines, restraint on jargon |
| `empathetic` | Acknowledges reader difficulty, validates before directing |
| `technical` | Domain terminology, dense but well-structured with headings |
| `persuasive` | Benefit-first ordering, active verbs, urgency signals |

## Sentence and Readability Rules

The drafting tool computes `avgWordsPerSentence` and `FleschReadingEase` over any supplied `sourceContent`. These are the thresholds used in adaptation briefs:

| Rule | Default | Advisory when |
|---|---|---|
| Longest sentence | 30 words or fewer | `longestSentenceWords > 30` |
| Average sentence (social) | 15–20 words | inferred from `length` label and content type |
| Flesch reading ease minimum | `>= 50` for general web | source `fleschReadingEase < 50` |

When the source reads below 50 and the target format is web-oriented, the adaptation brief instructs the writer to shorten sentences before applying the length change.

## Heading and Structure Conventions

- Headings are detected with `/^#{1,6}\s+.+$/gm` over the source text. Their count appears in the brief as `headingCount`.
- Source headings are re-mapped onto the target section plan when `task` is `adapt` or `repurpose`. If the source has zero headings, the brief adds the full target section plan from scratch.
- The section plan always comes from the **target format**, not the source format. Re-mapping instructions are explicit: "Re-map the N existing headings onto the M target sections."

## Keyword Placement Rules

- The **primary** keyword appears in the title (or H1 equivalent) and within the first 100 words of the body.
- Secondary keywords are placed in one H2 heading and one body mention each; they are never used in the title.
- Keyword density is measured as `(occurrences / wordCount) × 100` and defaults to `1.0%` as a target. The tool reports actual density; it does not enforce it by rewriting.

## Content Type Constraints

| Field | Constraint |
|---|---|
| `subject` (email) | 40–60 characters recommended |
| `preheader` (email) | 40–130 characters |
| `metaDescription` / `seoDescription` | 50–160 characters |
| `title` / `seoTitle` | 10–70 characters |
| `slug` | lowercase-hyphenated, max 75 characters |

## Audience and Intent Labels

The editorial calendar and drafting tools accept these search-intent labels as the `intent` field. They shape keyword placement advice and tone selection in the brief; they are not used for categorization elsewhere.

| Intent label | Brief signal |
|---|---|
| `informational` | Define the problem before proposing solutions; use FAQ-style sections |
| `commercial` | Compare options, name differentiators, include proof points |
| `transactional` | Lead with the action, minimize preamble, single CTA |
| `navigational` | Anchor to the brand or product name, provide direct links |

## Adaptation Rules

When the drafting tool receives `task: adapt` or `task: repurpose`, the brief includes concrete transformation steps in this order:

1. Apply the scale factor (cut or expand) to reach the target word count.
2. Re-map existing headings onto the target section plan.
3. Place or adjust keywords according to primary/secondary rules.
4. Translate **after** the length change if `targetLanguage` is supplied, so the word budget survives translation.

The source is measured before any step runs. `FleschReadingEase`, `avgWordsPerSentence`, and `longestSentenceWords` are reported and used to decide whether sentence shortening should precede or follow the length change.

## Platform-Specific Notes

| Platform | Brief guidance |
|---|---|
| `linkedin` | Hook in the first two lines; paragraph breaks every 1–3 sentences |
| `twitter` | 280-character limit; lead with the claim |
| `instagram` | Short caption with line breaks; CTA in the final line |
| `youtube` | Title + description plan; opening hook in the first 3 seconds |
| `tiktok` | Hook in the first 3 seconds; on-screen text plan |
| `blog` | H1 / H2 structure; keyword in title, H1, and first 100 words |
| `newsletter` | Subject line + preheader treated as separate fields; single CTA |
| `medium` / `substack` | Long-form structure; estimated reading time implicit in word budget |

## What the Tool Does Not Do

The drafting tool has no language model behind it. It computes a section plan, a word budget, and a keyword placement plan, but it does not write prose. The assistant model is responsible for writing copy from the brief. The brief explicitly states this limitation under "What this brief is not."

## Word Budget Reference by Length and Type

The `WORD_BUDGETS` table in `content-drafting-adaptation` maps `contentType` × `length` to a target word count. These values are editorial conventions, not measurements of any platform. The operator sees them in every draft brief under "Section plan."

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

The `length` input field accepts `short`, `medium`, or `long`. When omitted, it defaults to `medium`. Word budgets are not minimums or maximums; they are the target the section-plan divider splits evenly across sections.

## Source Measurement Fields

When `sourceContent` is supplied (for `adapt` and `repurpose` tasks), the `measure` function returns the following fields, all computed from the text the operator pasted:

| Field | Computation |
|---|---|
| `wordCount` | `/[A-Za-z0-9'’-]+/g` matches |
| `sentenceCount` | Split on `[.!?]+` followed by whitespace or end-of-string; empty segments excluded |
| `paragraphCount` | Split on blank lines (`/\n\s*\n/`); empty segments excluded |
| `headingCount` | `/^#{1,6}\s+.+$/gm` matches |
| `avgWordsPerSentence` | `round(wordCount / sentenceCount * 10) / 10` |
| `fleschReadingEase` | `round((206.835 - 1.015 * wps - 84.6 * (syllables/wordCount)) * 10) / 10` |
| `readabilityBand` | Derived from Flesch score (see table below) |
| `longestSentenceWords` | Word count of the longest sentence by character length |

The `syllable` counter inside `measure` uses the regex `/^(?:[^laeiouy]es|[^laeiouy]e)$/` to detect trailing silent-e words and subtract one. This differs slightly from the prosody evaluator's syllable model; do not mix the two counts for the same lyric.

## Adaptation Direction Logic

The `compression` variable determines whether the task is a cut or an expansion:

```
compression = round((targetBudget / sourceStats.wordCount) * 100)
```

| `compression` | Direction label |
|---|---|
| `0` (no source) | Hold the source sentences at current length |
| `< 100` | Cut the source sentences to about `targetBudget` words |
| `>= 100` | Expand to about `targetBudget` words |

When `compression < 100`, the brief also reports that sentence shortening should happen before length reduction if the source Flesch is below 50.

## Content Scope Statement

Every draft or adaptation brief closes with a "What this brief is not" block containing three statements:

1. The measured figures come from the source text supplied.
2. The target budgets and section plans are editorial conventions, not observed data.
3. The rewritten copy itself is produced by the assistant model from this plan.

This three-statement block is injected verbatim and must not be edited or removed; it is the operator's primary disclosure that the tool did not write the prose.

## Configuring this

All numeric defaults in this document (word budgets, character limits, Flesch bands, keyword density target, longest-sentence threshold, cadence) are shipped defaults and overrideable. The operator sets them through the input schemas of `content-drafting-adaptation` (tone, length, contentType, keywords) and `editorial-calendar-article-copilot` (startDate, cadenceDays, audience, intent). Persisted assistant-level configuration applies on top of skill-level defaults when both are present.
