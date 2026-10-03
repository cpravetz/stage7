# Narrative Arc Frameworks

This document defines the five structural beats, three-act page-proportion model, pacing thresholds, genre-length conventions, and structure-scoring logic implemented by the `narrativeArcPacingEvaluator` and `sceneBeatDialogueCopilot` skills. All numeric thresholds are defaults and configurable through the skill input schemas.

## The Five Structural Beats

The evaluator places five beats on every script. Each beat is a `beatRef` object with `label`, `sceneNumber`, `sceneSlug`, `page`, `basis` (`positional` or `detected`), and `evidence` (the opening line of the scene it lands in).

| Beat | Default basis | Detection heuristic |
|---|---|---|
| Opening image | `positional` | Scene 1 by definition |
| Inciting incident | `detected` or `positional` | Regex over scene opening line + slug: `/\b(deadline\|arrives\|arrived\|knock\|calls?\|found\|missing\|gone\|signed\|letter\|package\|signed for\|last chance\|final\|urgent\|emergency\|now\|hurry\|before it\|it is over\|we have to\|you can't\|you must)\b/i` |
| Midpoint | `positional` | Scene whose `startPage` is closest to 50% of `totalPages` |
| Climax | `detected` or `positional` | Regex over scene opening line + slug (scanned last-to-first): `/\b(do it\|go through\|final\|decide\|now\|end of it\|ends here\|last chance\|cut\|stop\|fire\|kill\|shoot\|confess\|tell her\|tell him)\b/i` |
| Resolution | `positional` | Final scene by definition |

When no explicit `ACT ONE`, `ACT TWO`, or `ACT THREE` headings appear in the script, act breaks are inferred from page position at 25% and 75% of `totalPages`. When explicit ACT headings are present, act assignment uses them and the page-proportion inference is skipped.

## Page and Runtime Conversion

| Constant | Value | Usage |
|---|---|---|
| `WORDS_PER_PAGE` | 180 | Word count to page estimate |
| `MINUTES_PER_PAGE` | 8 | Page count to runtime estimate |

```
estimatedRuntimeMinutes = totalPages × 8
targetPages             = targetDuration / 8   (when targetDuration is supplied)
targetPages             = pageTarget          (when only pageTarget is supplied, default 110)
```

## Genre Page Conventions

The `scriptwriterGenreMarketEvaluator` applies these page ranges and minimum scene counts per genre:

| Genre | Page range | Minimum scenes | Act 1 share | Act 3 share | Required beats |
|---|---|---|---|---|---|
| `drama` | 95–120 | 8 | 25–32% | 18–28% | inciting incident, midpoint, climax |
| `thriller` | 95–115 | 10 | 20–28% | 22–32% | inciting incident, midpoint, climax |
| `horror` | 85–110 | 9 | 20–28% | 22–32% | inciting incident, climax |
| `comedy` | 85–110 | 10 | 22–30% | 22–32% | inciting incident, midpoint, climax |
| `sci-fi` | 100–125 | 10 | 22–30% | 20–30% | inciting incident, midpoint, climax |
| `documentary` | 60–100 | 5 | 20–32% | 18–30% | inciting incident, resolution |

`structuralReadiness` is computed as the share of findings (excluding the informational genre-note finding) that pass. `ok` weighs `1`, `info` weighs `0.5`, `warn` weighs `0`.

| Readiness score | Rating label |
|---|---|
| `>= 80%` | `ready-to-submit` |
| `55–79%` | `needs-revision` |
| `< 55%` | `not-ready` |

## Pacing Flags and Thresholds

The evaluator raises flags against every scene and across the whole script.

### Per-scene flags

| Code | Severity | Condition |
|---|---|---|
| `long-scene` | warn | `scene.pages > 3` |
| `short-scene` | info | `scene.pages < 0.4` and scene is not the last |
| `no-dialogue` | warn | `scene.characterCount === 0` |
| `monologue` | info | `scene.characterCount === 1` and `scene.pages > 1.5` |
| `unclear-slug` | warn | `scene.interiorExterior === 'unspecified'` |

### Whole-script flags

| Code | Severity | Condition |
|---|---|---|
| `exposition-heavy` | warn | `dialogueRatio < 0.25` |
| `dialogue-heavy` | info | `dialogueRatio > 0.85` |
| `too-few-scenes` | warn | `scenes.length < 3` |
| `over-length` | warn | `|totalPages - targetPages| > 2` and over |
| `under-length` | info | `|totalPages - targetPages| > 2` and under |
| `single-scene-structure` | warn | `climaxScene === scenes[0]` |
| `no-midpoint` | info | `midpointScene === climaxScene` |

## Structure Score

The `structureScore` is a 5-point boolean check, each worth 1:

1. `scenes.length >= 3`
2. No scene has `interiorExterior === 'unspecified'`
3. Zero `long-scene` flags
4. `no-dialogue` flags <= floor(scenes / 3)
5. `|totalPages - targetPages| <= 2`

Rating: `strong` (4–5), `workable` (3), `needs-revision` (0–2).

## Scene Beat Skeleton (Co-creation)

The `sceneBeatDialogueCopilot` uses a 9-beat skeleton (`STAGE_PLAN`) distributed across three acts. For shorter `sceneCount` values, beats are selected by `SEQUENCE_BY_COUNT`:

| `sceneCount` | Beat keys in order |
|---|---|
| 1 | inciting |
| 2 | inciting, climax |
| 3 | opening, midpoint, resolution |
| 4 | opening, inciting, midpoint, resolution |
| 5 | opening, inciting, rising, climax, resolution |
| 6 | opening, inciting, rising, midpoint, climax, resolution |
| 7 | opening, inciting, first-turn, rising, midpoint, climax, resolution |
| 8 | opening, inciting, first-turn, rising, midpoint, complication, climax, resolution |
| 9 | opening, inciting, first-turn, rising, midpoint, complication, crisis, climax, resolution |
| >9 | The 9-beat skeleton plus additional `rising` beats appended |

For counts not in the lookup, the function returns `full.slice(0, count)` where `full` is the 9-key `STAGE_PLAN` list. Each beat key carries a `purpose` string, a beat-lines array, an action paragraph, a dialogue bank, and a pacing label.

## Act Breakdown

Act assignment (when no explicit ACT headings exist):

```
if startPage / totalPages < 0.25  → Act 1
if startPage / totalPages < 0.75  → Act 2
otherwise                         → Act 3
```

When explicit ACT headings are detected (`/^\s*(ACT|ACT ONE|ACT TWO|ACT THREE|ACT I|ACT II|ACT III)\b/i`), act assignment is suppressed and `actBreakBasis` is recorded as `explicit-act-headings`.

## Character Presence Metric

Per-scene character word counts are summed across scenes. The evaluator reports:

| Field | Meaning |
|---|---|
| `words` | Total spoken words for the character across all scenes |
| `scenes` | Number of scenes the character appears in |
| `shareOfDialogue` | `characterWords / totalDialogueWords` |

Characters are sorted descending by `words` in the report.

## Configuring this

`targetDuration` (minutes), `pageTarget` (default 110), `format`, `genre`, `sceneCount` (1–20), and `logline` are set through the skill input schemas. Genre page ranges, minimum scene counts, and act-share targets in the market evaluator are hard-coded in `GENRE_CONVENTIONS` and require a code change to adjust. The pacing-flag thresholds (`3` pages, `0.4` pages, `0.25` and `0.85` dialogue ratio, `2` pages over/under target) are also hard-coded in the handler.
