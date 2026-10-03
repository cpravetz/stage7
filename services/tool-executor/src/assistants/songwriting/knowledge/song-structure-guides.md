# Song Structure Guides

This document defines the five supported song structure templates, the role purpose for each section type, section-count extension logic, and beat-sheet layout conventions used by the `musicalCoCreation` skill. All counts and templates are the shipped defaults; the operator overrides structure and section count through the skill input schema.

## Supported Structure Templates

The `structure` input field selects one of five templates. Each template is an ordered array of section name strings. Section names are lowercased and matched by `roleOf` using `startsWith`.

| `structure` value | Section sequence (default length) |
|---|---|
| `standard` | verse 1 → chorus → verse 2 → chorus → bridge → chorus (6) |
| `verse-chorus` | verse 1 → chorus → verse 2 → chorus → bridge → chorus (6) |
| `aaba` | verse 1 → verse 2 → bridge → verse 3 (4) |
| `simple` | verse 1 → chorus → verse 2 → chorus (4) |
| `rap` | intro → verse 1 → chorus → verse 2 → chorus → verse 3 → outro (7) |

## Section-Count Extension

`sectionCount` defaults to the template length, and is clamped to the range 2–12. When the operator requests more sections than the template provides, additional `verse N` sections are inserted before the final template element:

```
while sectionNames.length < sectionCount:
  nextVerseNumber = count(existing verses) + 1
  splice sectionNames at position (length - 1) with "verse " + nextVerseNumber
```

For example, requesting 8 sections on the `standard` template (6) inserts two extra verses between the bridge and the final chorus, yielding: verse 1 → chorus → verse 2 → chorus → bridge → verse 3 → verse 4 → chorus.

## Section Roles and Purposes

The `roleOf` function assigns a role string. The `ROLE_PURPOSE` object maps each role to a one-sentence craft description used in the beat sheet and on each section object.

| Role | `ROLE_PURPOSE` text |
|---|---|
| `chorus` | The hook. States the central promise in the most repeatable form in the song; every chorus sings these exact words. |
| `verse` | Narration. Moves the story forward and earns the emotional turn the chorus pays off. |
| `bridge` | Contrast. Changes angle or texture so the return to the chorus lands as a release. |
| `intro` | Establishes the key, tempo and mood before the first line lands. |
| `outro` | Lets the last chord ring out and closes the loop opened by the intro. |

## Transition Conventions

Each section object carries a `transition` string describing how the section enters:

| Condition | Transition text |
|---|---|
| First section in the song | `Open cold on the first downbeat, no count-in.` |
| Section role is `chorus` | `Lift the final bar and cut straight into the next section.` |
| All other sections | `Two-bar lift into the next section.` |

## Rhyme Scheme Per Section

The `schemeFor` function assigns rhyme letters A–H (cycling modulo 8) based on the last two characters of each line's final word. Lines sharing the same end-sound receive the same letter. The scheme is output as a space-separated string (e.g. `A A B B`) and stored in `section.rhymeScheme` and `section.endWords`.

## Verse-Line Uniqueness

Verse sections are constructed from template pools (`VERSE_A`, `VERSE_B`) filled from the theme bank. The `uniqueLine` helper retries up to 12 attempts to find a line not already in `usedLines`; on exhaustion it appends `again` or `still` to create a variant. This ensures that verse 1 and verse 2 never echo each other word-for-word. The resulting boolean `draft.verseLinesAreDistinct` is `true` when `distinctVerseLines >= totalVerseLines`.

## Chorus Constraint

The chorus is constructed once from `CHORUS_SETS` and then repeated verbatim in every chorus section. The engine enforces this by copying `chorusLines.slice()` into each chorus role rather than regenerating. Refrains are not scored for rhyme against themselves; the rhyme detector explicitly skips verbatim duplicates and SECTION_BOUNDARY-matching lines.

## Beat Sheet Layout

The beat sheet is a flat list of objects with these fields:

| Field | Value |
|---|---|
| `order` | 1-based section index |
| `section` | section name as generated |
| `role` | `chorus`, `verse`, `bridge`, `intro`, or `outro` |
| `musicalFocus` | the `ROLE_PURPOSE` text for the role |
| `chordProgression` | section progression joined with ` - ` |
| `lineCount` | number of lyric lines in the section |
| `rhymeScheme` | space-separated rhyme letters |

The formatted song output joins beat-sheet rows as:

```
<order>. <SECTION> [<role>] <progression> - <musicalFocus>
```

## Chorus Template Sets

Four pre-written chorus pairs are defined in `CHORUS_SETS`. The set index is `seed % CHORUS_SETS.length`. Each pair uses `{{r}}` as a placeholder for the rhyme word, resolved from the theme bank at fill time. Two rhyme words are drawn per chorus (one per line).

## Theme Bank Slot Syntax

Verse, bridge, and outro templates use four slot tokens:

| Slot | Replaced with |
|---|---|
| `{{n}}` | A noun phrase from the theme bank (carries its own determiner) |
| `{{v}}` | A verb phrase from the theme bank |
| `{{p}}` | A place phrase from the theme bank |
| `{{t}}` | A time phrase from the theme bank |
| `{{r}}` | The rhyme word for the current couplet |

## Syllable Profile

The co-creation engine records `syllableProfile` as a flat array of objects with `section`, `line` (1-based within section), `text`, and `syllables` (count from the `syllables` helper). This is the raw data feeding any downstream meter analysis.

## Verse Template Pools

Verse construction draws from two alternating template pools, `VERSE_A` (6 templates) and `VERSE_B` (6 templates). Each couplet consists of one `VERSE_A` line followed by one `VERSE_B` line. The two lines share a rhyme word from the theme bank, placed at the end of each couplet. When `linesPerSection >= 4`, a second couplet is appended with a fresh rhyme word, yielding four lines per verse section.

The cursor that selects the template index advances by one for each new verse section and resets modulo the pool length, so the verse rotation wraps after 6 verses.

## Bridge Template Pool

The bridge has its own `BRIDGE_LINES` pool of 4 templates, filled with the current bridge rhyme word. Exactly two lines are generated per bridge section. The bridge cursor (`verseCounter.bridge`) is independent of the verse cursor, so bridge lines do not repeat verse lines.

## Intro and Outro Templates

`INTRO_LINES` (2 templates) and `OUTRO_LINES` (2 templates) are selected by `seed % 2`. These lines are not rhyme-matched. The outro template uses the `{{n}}` slot; the intro templates do not use any slots.

## Formatted Song Output

The `formattedSong` string is assembled as:

```
<header: Theme | Genre | Mood | Structure | Key | Meter | Tempo | Chord vocabulary>
---
LYRICS & CHORDS ---
[UPPERCASE SECTION]
<chord line>  (chord symbols aligned with spaces)
<lyric line>
<lyric line>
...
---
BEAT SHEET ---
1. CHORUS [chorus] I - V - vi - IV - The hook. States the central promise...
```

Chord symbols for each section are aligned by `padColumns`, which right-pads each cell to the widest entry in the row and joins with two spaces.

## Draft Object Fields

The `draft` returned by `musicalCoCreation` contains these structural fields:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `song_` + timestamp |
| `title` | string | From `topic` input; defaults to `theme` when topic is empty |
| `theme` | string | Central theme passed in |
| `genre` | string | Lowercased genre |
| `mood` | string | Lowercased mood |
| `structure` | string | Template label used |
| `key` | string | Default key for the genre |
| `meter` | string | Always `4/4` in shipped genres |
| `tempoFeel` | string | Tempo label from `GENRE_MUSIC` |
| `sections` | array | Per-section objects with role, progression, lines, rhymeScheme, etc. |
| `sectionCount` | number | Actual sections generated |
| `verseCount` | number | Sections where role is `verse` |
| `chorusCount` | number | Sections where role is `chorus` |
| `totalVerseLines` | number | Sum of `lines.length` across all verse sections |
| `distinctVerseLines` | number | Count of unique verse lines |
| `verseLinesAreDistinct` | boolean | `distinctVerseLines >= totalVerseLines` |
| `chordVocabulary` | array | Unique chord symbols in insertion order |
| `syllableProfile` | array | Per-line syllable counts |
| `beatSheet` | array | One entry per section |
| `revision` | object or null | Set when `existingContent` is supplied |
| `source` | string | Always `local` |
| `createdAt` | ISO 8601 | Timestamp of generation |

## Configuring this

`structure` (one of the five template labels), `sectionCount` (2–12), `genre` (any string; falls back to pop), `mood` (any string; does not constrain the generated vocabulary), `theme` (one of the six recognised theme keys; falls back to `love`), and `seed` (integer, 0 = non-deterministic) are set per-call through the `musicalCoCreation` skill input schema. The progression arrays, key defaults, and tempo labels are hard-coded in the `GENRE_MUSIC` table inside the handler.
