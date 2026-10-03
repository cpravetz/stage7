# Prosody & Stress Metrics

This document specifies the exact syllable-estimation formula, rhyme-detection algorithm, meter-consistency computation, and threshold logic implemented by the `lyricProsodyEvaluator` skill. All numeric thresholds are defaults and configurable via the skill's `targetMeter` input parameter.

## Syllable Estimation

The `estimateSyllables` function applies the following steps to each word:

1. Lower-case the word and strip every character except `[a-z']`.
2. If the result is empty, return `0`.
3. Count contiguous vowel groups with `/[aeiouy]+/g`.
4. If the count of groups is `0`, return `1` (every non-empty word has at least one syllable).
5. If the word ends in a silent `e` (ends with `e`, does not end with `le`, and group count > 1), subtract one.
6. Return `max(1, count)`.

This heuristic overcounts for some diphthongs and undercounts for words ending in `-le`, but it is the only syllable model available to the evaluator.

### Applied to co-creation

The `musicalCoCreation` engine uses a near-identical `syllables` function. Its regex for stripping trailing `e` is `/^(?:[^laeiouy]es|[^laeiouy]e)$/` — this also removes trailing `es` before subtracting.

## Section-Label Detection

Lines matching `SECTION_LABEL` are treated as structural markers and excluded from all lyric metrics:

```
/^\s*[\[(]?\s*(intro|verse|pre|chorus|refrain|hook|bridge|breakdown|drop|outro|interlude|instrumental|tag|coda|post)\b[^\])\n]*[\])]?\s*:?\s*$/i
```

Recognised labels (case-insensitive): `intro`, `verse`, `pre`, `chorus`, `refrain`, `hook`, `bridge`, `breakdown`, `drop`, `outro`, `interlude`, `instrumental`, `tag`, `coda`, `post`.

`SECTION_BOUNDARY` (`/\b(chorus|refrain|hook|bridge|tag|outro|intro)\b/i`) is used separately to detect refrain lines and to exclude verbatim repetitions from the rhyme-pair detector.

## Rhyme Detection

Rhyme pairs are computed with a last-three-character (`-3`) key on the final word of each lyric line:

```
rhymeKey(line):
  lastWord = last whitespace-delimited token, lowercased, stripped of [a-z]
  if lastWord.length >= 3: return lastWord.slice(-3)
  else: return lastWord
```

Two lines form a rhyme `pair` when:

- Both keys are at least 3 characters long
- The keys are identical
- Neither line matches `SECTION_BOUNDARY` (chorus / hook / bridge lines are not paired against themselves)
- The two lines are not verbatim duplicates (case-insensitive)

Detected pairs are recorded with `type: 'full'` and the shared `rhyme` key.

### Rhyme key in co-creation

The co-creation engine uses a shorter last-two-character key (`-2`) for per-couplet rhyme-scheme letters. It maps keys to sequential letters A–H and reports the scheme as a space-separated string (e.g. `A A B B`).

## Meter Metrics

All meter metrics are computed over `lyricLines` only — section labels are excluded.

| Metric name | Formula |
|---|---|
| `syllables` (per line) | sum of `estimateSyllables(word)` for every word on the line |
| `deltaFromTarget` (per line) | `syllables - targetMeter` |
| `averageSyllablesPerLine` | `mean(syllableCounts)` rounded to one decimal place |
| `meterVariance` | `mean((count - targetMeter)^2)` |
| `meterDeviation` | `sqrt(meterVariance)` rounded to two decimal places |
| `withinTarget` | count of lines where `|count - targetMeter| <= 2` |
| `meterConsistency` | `withinTarget / totalLyricLines` — a proportion in the range 0–1 |

### Meter threshold

```
if meterConsistency < 0.5:
  recommendation = "Only X% of lines sit within two syllables of the Y-syllable target."
```

When `meterConsistency` is below `0.5`, fewer than half the lines land in the ±2 syllable band around `targetMeter`.

## Line Length Spread Warning

```
if (longest.syllables - shortest.syllables) > targetMeter:
  recommendation = "Line lengths range from N to M syllables..."
```

A spread wider than `targetMeter` itself is flagged.

## Theme Vocabulary (Recurring Words)

The evaluator builds `themeWords` from words longer than 3 characters that appear more than once across all lyric lines, sorted by descending frequency, limited to the top 8. This is surfaced as "RECURRING VOCABULARY" in the report.

## Refrain Detection

Lines matching `SECTION_BOUNDARY` (case-insensitive) are collected as `refrainLines`. Duplicates are removed (`indexOf` check). These are reported separately as "HOOK / REFRAIN LINES" and are excluded from rhyme-pair counting.

## End-Syllable Pairing (Co-creation)

The co-creation engine records `endSyllables` per line as the syllable count of the last two words:

```
endSyllables(line) = [estimateSyllables(lastWord), estimateSyllables(secondToLastWord)]
```

This array is included in the `lineMetrics` for each section but is not used for scoring in the current evaluator.

## Rhyme-Scheme Computation (Co-creation)

The `schemeFor` function assigns letters to lines within a section based on the last two characters of each line's final word:

```
rhymeKey2(word) = last 2 alphanumeric characters of lowercased word
```

Distinct keys receive sequential letters A–H, cycling modulo 8. The resulting sequence is returned as a space-separated string.

## Section Count Thresholds

| Rule | Threshold | Effect |
|---|---|---|
| Minimum lyric lines for meaningful evaluation | 4 | Below 4, meter and rhyme are not assessed |
| Meter consistency advisory | `< 0.5` | Recommendation issued |
| Rhyme pair floor | `0` pairs across all lines | Recommendation issued (slant rhyme suggested) |
| Theme word floor | `0` words repeated | Recommendation issued |

## Configuring this

The `targetMeter` field (default `8`, range 1–20) is the only operator-configurable threshold in the prosody evaluator. It is set per-call through the skill input schema. The ±2 syllable tolerance (`withinTarget` band) and the `< 0.5` consistency threshold are not currently exposed as separate parameters — changing `targetMeter` changes the center of the band but not the band width or the consistency floor. To modify those thresholds the operator must change the handler code directly.
