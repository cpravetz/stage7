# Fountain Format Specification

This document specifies the screenplay element types, syntax rules, and rendering conventions the `script-formatting-submission-manager` skill uses when parsing and re-emitting screenplay text. The skill accepts raw `standard`-format text and can emit `fountain`, `pdf`, `finaldraft`, `celtx`, or `txt`. The `fountain` target is the simplest pass-through; the `standard`/`pdf` targets apply positional layout.

## Recognised Element Types

The parser classifies every non-empty line as exactly one of:

| Element type | Detection rule |
|---|---|
| `slug` (scene heading) | Starts with `INT`, `EXT`, `EST`, `INT./EXT`, or `I/E`, followed by `.` or whitespace: `/^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i` |
| `transition` | Matches `/^(FADE (IN\|OUT\|TO)\|CUT TO\|DISSOLVE TO\|SMASH CUT TO\|MATCH CUT TO\|WIPE TO\|JUMP CUT TO)$/i` or ends with `TO:`, `CUT TO:`, or `BACK TO:` |
| `character cue` | All-caps, 2+ uppercase letters, no punctuation (`.!?`), length <= 45, not a transition; followed by a non-all-caps, non-slug, non-transition line |
| `parenthetical` | Wrapped in parentheses, `^\(.*\)$`, length <= 70 characters |
| `dialogue` | Lines after a character cue (and optional parenthetical) that are not slug, transition, or parenthetical |
| `action` | Any non-empty run not classified above |

### Character-cue extension stripping

Voice-over and off-screen extensions `(V.O.)`, `(O.S.)`, `(C.O.)` are stripped from character names before storage using:

```
stripExtension(t) = t.replace(/\((?:V\.?O\.?|O\.?S\.?|C\.?O\.?)\)/gi, '').trim()
```

The character cue stored in the element is always uppercased after stripping.

## Fountain Output Syntax

When `targetFormat === 'fountain'`:

- Scene headings are emitted as **uppercase** lines.
- Transitions are emitted as `> TRANSITION TEXT:` (the `>` cue is added; the trailing colon from the input is preserved).
- Character cues are emitted as **uppercase** lines.
- Parentheticals are emitted on their own line between the character cue and dialogue.
- Dialogue lines are emitted verbatim.
- Action blocks are emitted as continuous paragraphs.
- A blank line is inserted between elements of different types (dialogue followed by action, action followed by slug, etc.).

```
> FADE OUT.
MARCUS
(quietly)
I know what it is.
```

## Standard / PDF Output Layout

The standard renderer applies fixed column positions:

| Element | Left margin |
|---|---|
| Slug | column 0 (full width, uppercase) |
| Action | column 0, wrapped at 58 characters |
| Character cue | column 22 |
| Parenthetical | column 16 |
| Dialogue | column 10, wrapped at 35 characters |
| Transition | column 34 |

Page constants:

| Constant | Value |
|---|---|
| `WORDS_PER_PAGE` | 180 |
| `CHARS_PER_LINE` | 58 |
| `LINES_PER_PAGE` | 55 |

Estimated pages are computed as `max(1, round((wordCount / 180) * 100) / 100)`. PDF output inserts a `[[PAGE N]]` marker every 55 lines.

## Scene Heading Styles

The `sceneHeadingStyle` input field controls how slug lines are normalised:

| Style | Behaviour |
|---|---|
| `smart` | Preserves the writer's casing; guarantees `INT./EXT.` prefix and appends ` - DAY` if no time-of-day token (`DAY`, `NIGHT`, `DAWN`, `DUSK`, `MORNING`, `EVENING`, `CONTINUOUS`, `LATER`, `MOMENTS LATER`) is present |
| `master` | Uppercases the entire heading |

## Submission Requirements

Submitting a formatted script requires all three:

1. `submitTo` array is non-empty (target platforms are named)
2. `submissionEndpointUrl` is configured (either in the skill config or the call input)
3. `dryRun: false` and `confirmation: true` are both set

If `submitTo` is empty the submission is `not-requested`. If the endpoint is missing the status is `blocked-not-connected`. If `dryRun` is true the status is `dry-run`. If neither `dryRun: false` nor `confirmation: true` is set, the status is `awaiting-confirmation`.

## Format Verification Codes

The parser emits `formatChecks` with these codes:

| Code | Severity | Condition |
|---|---|---|
| `no-slug` | error | `counts.slug === 0` |
| `single-scene` | warn | `counts.slug === 1` and `counts.character > 0` |
| `no-dialogue` | warn | `counts.character === 0` and `counts.action > 0` |
| `empty-dialogue` | warn | A character cue has zero dialogue lines following it |
| `elements-resolved` | ok | Both slug and character cues are present |

## Element Counts

After parsing, `elementCounts` records:

```
{ slug, action, character, parenthetical, dialogue, transition }
```

`character` and `dialogue` are incremented together for each dialogue block. `parenthetical` is only incremented when a parenthetical element is present for that character.

## Output Artifact Structure

The formatted output object returned by the skill contains these fields:

| Field | Meaning |
|---|---|
| `id` | `sfm_` + timestamp |
| `title` | From the `title` input (default `Untitled script`) |
| `format` | Original input format (`standard`, `fountain`, etc.) |
| `targetFormat` | Output format requested |
| `pageSize` | `US Letter` or `A4` |
| `submitTo` | Array of platform names |
| `wordCount` | Total words across action and dialogue |
| `estimatedPages` | `max(1, round((wordCount / 180) * 100) / 100)` |
| `elementCounts` | `{ slug, action, character, parenthetical, dialogue, transition }` |
| `formatChecks` | Array of `{ severity, code, message }` objects |
| `submissionStatus` | One of `not-requested`, `blocked-not-connected`, `dry-run`, `awaiting-confirmation`, `submitted`, `failed` |
| `submissionMessage` | Human-readable status message |
| `submissionResponse` | `{ status: number|null, data: object|null }` from the endpoint |
| `generatedAt` | ISO 8601 timestamp |
| `storePath` | Path in `SCRIPTWRITING_HOME/formatting-submissions.json` |

The artifact is persisted to the store before any submission attempt. The `storePath` is always available regardless of whether a submission is made.

## Page Markers in PDF Output

When `targetFormat === 'pdf'`, the renderer inserts a page-break marker every `LINES_PER_PAGE` (55) lines of rendered content:

```
[[PAGE 1]]
[[PAGE 2]]
```

These markers are blank lines surrounding a `[[PAGE N]]` label. They are not present in the `fountain`, `finaldraft`, `celtx`, or `txt` output formats.

## Look-Ahead Parsing Rule

The parser uses a single non-empty look-ahead line to decide whether a character cue is followed by dialogue or by another slug/transition:

```
if isCharacterCue(trimmed) AND nextNonEmpty is NOT all-caps AND NOT slug AND NOT transition:
  classify as dialogue block
else:
  classify as action
```

This rule prevents headings and transitions from being misread as dialogue. It is the reason a parenthetical immediately following a character cue does not break the dialogue block — `isParenthetical` is checked inside the dialogue loop, not at the outer classification level.

## Configuring this

Page size (`US Letter` or `A4`), scene heading style (`smart` or `master`), target format, and submission endpoint URL are set through the skill's input schema or the persisted dispatch config. The word-per-page constant (180), chars-per-line (58), and lines-per-page (55) are hard-coded and not currently exposed as operator parameters.
