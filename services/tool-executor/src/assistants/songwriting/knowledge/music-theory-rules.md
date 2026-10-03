# Music Theory Rules

This document defines the music theory constants, chord progression conventions, key and meter defaults, and role definitions the songwriting co-creation engine uses when generating structured song drafts. All values below are defaults in the shipped code; the operator overrides genre, mood, structure, and section count through the `musicalCoCreation` skill input schema.

## Genre Defaults

Each genre entry defines a default key, time meter, tempo feel label, two chord progressions in Roman-numeral notation, and the default `linesPerSection`.

| Genre key | Default key | Meter | Tempo feel | Progression set A | Progression set B | `linesPerSection` |
|---|---|---|---|---|---|---|
| `pop` | C major | 4/4 | mid-tempo | I V vi IV | vi IV I V | 4 |
| `rock` | E minor | 4/4 | driving | i VII VI VII | i III VII i | 4 |
| `country` | G major | 4/4 | steady | I IV V I | I V vi IV | 4 |
| `folk` | D major | 4/4 | unhurried | I V vi IV | I iii vi IV | 4 |
| `edm` | A minor | 4/4 | build | i VI III VII | i VII VI VII | 4 |
| `rnb` | F major | 4/4 | slow | ii V Imaj7 vi | Imaj7 vi ii V | 4 |
| `hiphop` | B minor | 4/4 | steady 90 | i VII VI VII | i VI III VII | 4 |

Any genre string not in this table falls back to the `pop` row. The operator can pass a different `key`, `meter`, or `tempo` through the dispatch config, but those fields are not part of the co-creation input schema — they are recorded on the draft artifact only when supplied externally.

## Chord Progression Notation

Progressions are expressed in Roman numerals relative to the key. The engine stores them as arrays of string symbols; it does not invert or substitute chords at generation time. A progression is selected per section by advancing a cursor (`music.progressions[index % progressions.length]`).

Common numerals used by the shipped genres:

| Symbol | Function |
|---|---|
| I, IV, V, vi | Major-key diatonic |
| i, III, VII | Natural minor / modal |
| ii | Supertonic minor (major-key) |
| Imaj7 | Major seventh variant (rnb) |
| VI, III | Submediant / mediant in minor contexts |

## Section Roles

The `roleOf` function assigns a string role to every section name. The `ROLE_PURPOSE` table describes the narrative-musical function of each role.

| Role key | Purpose statement |
|---|---|
| `chorus` | The hook. States the central promise in the most repeatable form; every chorus sings these exact words |
| `verse` | Narration. Moves the story forward and earns the emotional turn the chorus pays off |
| `bridge` | Contrast. Changes angle or texture so the return to the chorus lands as a release |
| `intro` | Establishes the key, tempo and mood before the first line lands |
| `outro` | Lets the last chord ring out and closes the loop opened by the intro |

## Structure Templates

The `STRUCTURES` object maps the `structure` input field to an ordered section-name template. Each name starts with a lowercase role prefix that `roleOf` matches with `startsWith`.

| Structure label | Template sequence |
|---|---|
| `standard` | verse 1 → chorus → verse 2 → chorus → bridge → chorus |
| `verse-chorus` | verse 1 → chorus → verse 2 → chorus → bridge → chorus |
| `aaba` | verse 1 → verse 2 → bridge → verse 3 |
| `simple` | verse 1 → chorus → verse 2 → chorus |
| `rap` | intro → verse 1 → chorus → verse 2 → chorus → verse 3 → outro |

`sectionCount` (min 2, max 12) is applied after template selection. When the count exceeds the template length, additional `verse N` sections are spliced in before the final template element. The operator controls `sectionCount` through the `sectionCount` input field.

## Rhyme Families and Theme Vocabulary

Co-creation draws rhyme words from the `THEMES` bank, keyed by the `theme` input field. Each theme contains:

- `nouns` — noun phrases with embedded determiners so templates never need to guess at articles
- `verbs` — past-tense or participle verb phrases
- `places` — location phrases
- `times` — time phrases
- `rhyme` — five rhyme families, each an array of five words that share a rhyme sound

Recognised theme keys (any other key falls back to `love`):

`love`, `loss`, `triumph`, `journey`, `rebellion`, `nostalgia`

## Song Asset Dispatch

The `leadSheetDemoDispatcher` skill accepts three `format` values:

| Format | Output |
|---|---|
| `lead-sheet` | Column-aligned chord symbols above lyric lines |
| `demo-metadata` | key, tempoBpm, duration (m:ss), section and line counts |
| `registration` | writer and publisher names, rights note |

Dispatch requires `dryRun: false` and `confirmation: true`. In dry-run mode the artifact is staged at `ctx.store.getFilePath('lead-sheets')` and nothing leaves the system. An `endpointUrl` in the skill's dispatch config (`SONGWRITER_HOME`) is required before any live send can proceed. The `apiKey` credential is injected via vault reference and never echoed in output.

## Verse-Line Uniqueness Constraint

The co-creation engine enforces distinct verse lines across all verse sections by tracking `usedLines` as a map. A line that has already been emitted is retried up to 12 times; the 13th attempt falls back to appending `again` or `still` to the candidate line. This constraint is surfaced as `verseLinesAreDistinct` on the draft object.

## Rhyme Bank Slot Syntax

Verse, bridge, and chorus templates use five slot tokens resolved from the theme bank at fill time:

| Slot | Replaced with |
|---|---|
| `{{n}}` | A noun phrase from the theme bank (carries its own determiner — "the heart", "the ashes") |
| `{{v}}` | A verb phrase from the theme bank (past tense or participle — "waited", "let go") |
| `{{p}}` | A place phrase from the theme bank (location with implied article — "the front steps") |
| `{{t}}` | A time phrase from the theme bank ("the morning", "the slow morning") |
| `{{r}}` | The rhyme word for the current couplet |

Because determiners are embedded in the noun, place, and time slots, templates never produce ungrammatical strings like "the an open window."

## Genre Vocabulary Files

The songwriter ships two vocabulary JSON files that the co-creation engine does not currently read at runtime. They exist as seed data for future model-grounded generation and for operator reference:

- `genre-vocabularies.json` — maps genre keys (`pop`, `rock`, `hip-hop`, `country`, `r-and-b`, `electronic`) to `vocabulary` arrays, `themes`, `structure` templates, `syllableTarget` ranges, and `commonPhrases`.
- `mood-vocabularies.json` — maps mood keys (`happy`, `sad`, `energetic`, `melancholic`, `romantic`, `angry`) to `words`, `phrases`, and a `tone` label.

The `syllableTarget` arrays in `genre-vocabularies.json` differ from the hard-coded `linesPerSection: 4` and `targetMeter: 8` defaults in the skill handler. When the operator wants genre-specific syllable targets, they should pass `targetMeter` explicitly at call time rather than rely on this file.

## Mood Label Handling

The `mood` input field (default: `hopeful`) is recorded on the draft artifact but does not constrain the generated vocabulary in the current implementation. The `GENRE_MUSIC` table has a `tempo` feel label that encodes some mood information (e.g., `slow` for rnb, `driving` for rock, `build` for edm). To steer mood precisely, the operator should also set `theme` to one of the six recognised keys.

## Beat Sheet Detail

Each section object in the output contains a `beatSheet` entry with these fields:

| Field | Value |
|---|---|
| `order` | 1-based section index |
| `section` | section name as generated |
| `role` | `chorus`, `verse`, `bridge`, `intro`, or `outro` |
| `musicalFocus` | the `ROLE_PURPOSE` text for the role |
| `chordProgression` | section progression joined with ` - ` |
| `lineCount` | number of lyric lines in the section |
| `rhymeScheme` | space-separated rhyme letters |

## Chord Vocabulary

The engine collects unique chord symbols across all sections into `chordVocabulary`, preserving insertion order. This array is printed in the draft header:

```
Chord vocabulary: C, G, Am, F
```

For keys with major seventh variants (rnb), `Imaj7` appears as a single symbol in the vocabulary list.

## Configuring this

Genre default rows, key and tempo values, progression arrays, and structure templates are hard-coded in the `musicalCoCreation` handler. The operator changes them by passing `genre`, `mood`, `structure`, `sectionCount`, and `theme` through the skill's input schema. For dispatch behaviour the operator edits the skill's persisted dispatch config (endpoint URL, provider, default format, and `confirmBeforeSend`). `dryRun` and `confirmation` fields on individual calls override the persisted default for a single run only.
