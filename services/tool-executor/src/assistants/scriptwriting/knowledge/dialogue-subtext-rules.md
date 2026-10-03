# Dialogue & Subtext Rules

This document specifies the dialogue bank structure, beat-to-dialogue mapping, pacing labels, slug generation, and cast defaults used by the `sceneBeatDialogueCopilot` skill. All templates, beat sequences, and dialogue banks are hard-coded in the handler; the operator controls the number of scenes and the topic through the skill input schema.

## Beat Skeleton

The copilot uses a 9-beat skeleton (`STAGE_PLAN`) mapped to three acts. Each beat key has a `purpose` statement, three `beats` (craft directives), an action paragraph, a dialogue bank, and a pacing label.

| Beat key | Act | `purpose` summary |
|---|---|---|
| `opening` | 1 | Establish the world and the protagonist before anything is demanded of them |
| `inciting` | 1 | Force the central problem into the open so the story cannot return to normal |
| `first-turn` | 1 | Commit the protagonist to a course of action with no easy exit |
| `rising` | 2 | Raise the stakes and let the opposition apply genuine pressure |
| `midpoint` | 2 | Reveal the truth that reframes everything the protagonist believed |
| `complication` | 2 | Complicate the plan so the obvious solution stops working |
| `crisis` | 2 | Strip away the last option the protagonist still trusted |
| `climax` | 3 | Force the decisive choice under maximum pressure |
| `resolution` | 3 | Show the new normal and close the question the opening raised |

## Beat Selection by Scene Count

The `SEQUENCE_BY_COUNT` table selects which beat keys are used for a given `sceneCount`:

| `sceneCount` | Beats used |
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
| >9 | 9-beat skeleton + `rising` beats appended to reach the count |

## Dialogue Bank

Each beat key contains a bank of 3–5 dialogue exchanges. Each exchange has:

| Field | Content |
|---|---|
| `who` | Character name (uppercase, from the cast list) |
| `parenthetical` | `null` or a parenthetical direction in parentheses |
| `line` | Spoken line text; slots `{{lead}}`, `{{second}}`, `{{third}}`, `{{object}}`, `{{place}}`, `{{subject}}` are filled at generation time |

Example exchange:

```json
{ "who": "MARCUS", "parenthetical": "(flatly)", "line": "And you will do what it tells you." }
```

Parenthetical slots in the rendered output appear on a line between the character cue and the dialogue, indented at column 16.

## Cast Defaults

When `characters` is not supplied, the engine assigns a default cast by genre:

| Genre | Cast |
|---|---|
| `comedy` | `PROTAGONIST`, `SIDEKICK` |
| all others | `PROTAGONIST`, `ANTAGONIST`, `ALLY` |

Cast slots used in dialogue and action templates:

| Slot | Role |
|---|---|
| `{{lead}}` | `cast[0]` — protagonist |
| `{{second}}` | `cast[1]` — primary opposition or ally |
| `{{third}}` | `cast[2]` — secondary character; falls back to `cast[1]` or `cast[0]` |

## Pacing Labels

The `pacingFor` function assigns a scene-level pacing label. It is not a metric — it is a genre-aware descriptor attached to each scene object in the output.

| Condition | Pacing label |
|---|---|
| Beat is `crisis` or `climax` | `climactic` |
| Genre is `thriller` or `horror`, beat is `midpoint` | `accelerating` |
| Genre is `thriller` or `horror`, any other beat | `tense` |
| Genre is `comedy`, beat is `opening` | `loose` |
| Genre is `comedy`, any other beat | `quick` |
| Genre is `documentary` | `observational` |
| Beat is in Act 2 | `building` |
| All others | `measured` |

## Slug Generation

Each scene's slug is constructed from three independent cycles:

| Component | Source |
|---|---|
| Interior/exterior prefix | `INTERIOR[index % 2]` → alternates `INT.` / `EXT.` |
| Place name | `setting` input, or `<Subject> District` derived from the topic |
| Time of day | `TIMES_OF_DAY[(index * 3 + act) % 4]` → cycles `DAY`, `NIGHT`, `DAWN`, `DUSK` |

For climax and crisis scenes, a qualifier is appended:

```
qualifier = ' - CONTINUOUS'   if index is even
qualifier = ' - LATER'        if index is odd
```

Final slug format: `INT. PLACE - DAY` or `EXT. PLACE - NIGHT - LATER`.

## Subtext Principles (Craft Conventions)

The dialogue bank encodes these subtext rules. They are craft conventions, not verified algorithmically.

1. **What is withheld is louder than what is said.** Characters state goals obliquely — the `line` field is rarely a direct admission.
2. **Parentheticals are actions, not emotions.** The copilot uses direction labels like `(flatly)`, `(after a beat)`, `(barely)`, `(leaning in)`, `(quietly)`. It avoids emotion labels such as `(sadly)` or `(angrily)`.
3. **The last line of a scene is a pivot, not a summary.** Climax and crisis exchanges end with a forced choice or a withheld fact; resolution ends with a changed status quo.
4. **Silence is a line.** The beat directives in `BEATS` explicitly call for "Hold silence long enough for `{{lead}}` to choose without reassurance" in the crisis beat.
5. **Power shifts are spoken through subtext.** Rising beats have the second character answer before the first is finished; midpoint beats have the third character reveal they knew all along.

## Render Output Format

The copilot produces two `present` blocks internally. The screenplay block (`renderScreenplay`) joins scene objects with double newlines. Within each scene:

```
<slug>

<action paragraph>

<CHARACTER>
[parenthetical]
<dialogue line>

<transition>
```

The outline block (`outlineText`) lists each scene as:

```
SCENE <number> - Act <act> - <STORY_BEAT_UPPER> - <pacing>
  <slug>
  Purpose: <purpose>
  Beats:
    1. <beat text>
    2. <beat text>
  Dialogue:
    <CHARACTER> [parenthetical]
      <line>
  <transition>
```

## Character Presence and Balance

The evaluator and market evaluator both derive character presence from scene data:

```
shareOfDialogue = characterWords / totalDialogueWords
```

No hard threshold is enforced, but the evaluator reports the ratio per character sorted by word count descending. A single character dominating all scenes is a flag the market evaluator surfaces as a craft finding.

## Configuring this

`topic`, `genre`, `audience`, `targetDuration` (minutes, default 5), `sceneCount` (1–20), `setting`, `logline`, and `characters` are set through the `sceneBeatDialogueCopilot` skill input schema. The beat sequence, dialogue banks, action templates, and pacing logic are hard-coded in the handler and require a code change to modify. Cast defaults (protagonist, sidekick vs. protagonist, antagonist, ally) are also hard-coded by genre check.
