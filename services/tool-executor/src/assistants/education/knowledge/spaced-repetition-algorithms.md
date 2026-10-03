# Spaced Repetition and Scheduling Algorithms

This handbook is the retention reference for the Education & Curriculum Design Assistant: how practice is distributed over time, which scheduler the assistant assumes, and how those schedules translate into the pacing, intervention, and monitoring decisions the Personalised Learning Plan skill emits. It exists because the scheduling assumptions are implicit everywhere else in the assistant and a reviewer needs to see them. Nothing here substitutes for the learner's own judgement about a subject they are about to be examined on.

## The underlying effects

Three findings drive every algorithm in this space, and each is a design constraint rather than a preference:

- **The forgetting curve.** Retention after unlearning decays roughly exponentially with elapsed time, with a half-life on the order of days for new material. Reviews flatten that curve; without them the decay continues.
- **The testing effect.** Retrieval from memory strengthens memory more than re-exposure does. This is why a flashcard review beats a re-read, and why a closed-book attempt is scheduled in preference to a re-read session.
- **Spacing effect.** The same study time spread across three sessions beats the same time in one session for long-term retention, and the advantage is largest for material learned well. Massed practice produces good short-term scores and poor long-term ones, which is the failure mode a term-long course is most exposed to.

A fourth effect, **desirable difficulty**, qualifies the second: retrieval that feels effortful is more durable than retrieval that feels fluent. This is why a fast, familiar practice run produces less retention than a slower, effortful one, and why a learner reporting that a technique "doesn't stick" is usually describing a well-functioning session.

## The forgetting curve in numbers

The useful approximation is exponential decay in retention:

```
R(t) = e^(-t / S)
```

where `R(t)` is the probability of recall after `t` days and `S` is the memory stability in days. A newly learned item with `S = 1` sits at about 37 percent recall after one day and about 5 percent after three. Every scheduling algorithm in this space is, directly or indirectly, a way of pushing `S` upward before `t` catches up.

Desired retention `D` is the target probability, and given a target `D` the maximum interval for a stability value is:

```
t_max = S × ln(1 / D)
```

For `S = 1` and `D = 0.90` that is 0.105 days, which is why a brand-new item must be reviewed the same day. For `S = 30` the same target gives 3.16 days, and for `S = 365` it gives 38.4 days. Growth in stability, not growth in review count, is what makes a mature deck cheap.

## SM-2: the reference scheduler

SuperMemo 2 remains the baseline that most systems are descendants of. Each item carries an easiness factor `EF`, initially 2.5, and a repetition count.

On each review the learner grades the item:

| Grade | Meaning | Effect |
| --- | --- | --- |
| 0 | Complete blackout | Reset repetitions to 0, interval to 1 day |
| 1 | Incorrect, but the correct answer was recalled before looking | Reset repetitions to 0, interval to 1 day |
| 2 | Incorrect, and the correct answer was not recalled | Reset repetitions to 0, interval to 6 days |
| 3 | Correct with serious difficulty | Interval to `round(interval × EF)` |
| 4 | Correct with hesitation | Interval to `round(interval × EF)` |
| 5 | Correct and immediate | Interval to `round(interval × EF) × 1.3` |

The easiness factor updates as `EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))`, floored at 1.3. An easy item's easiness rises toward 3.0 and its intervals stretch; a persistently hard item's falls toward 1.3 and its intervals compress. The first repetition interval is 1 day and the second is 6 days; from the third repetition onward the interval is `previous interval × EF`.

Worked example, starting at `EF = 2.5` and interval 1 day: graded 5, interval becomes 2 days and `EF` rises to 2.6. Graded 4 twice more gives 5 days then 13 days. Graded 2 at that point resets the item to a 6-day interval. The schedule collapses exactly when the learner has lost the item, which is the mechanism working as intended.

Two structural weaknesses of SM-2 follow from that design. Grades 4 and 5 produce identical intervals, so the model cannot distinguish easy from instant. And because the interval never accounts for elapsed time since the last review, a review missed by three weeks still multiplies the old interval rather than rescaling from the actual retention achieved.

## FSRS: the modern replacement

Free Spaced Repetition Scheduler replaces the two-parameter SM-2 model with a per-deck model fitted from the learner's own review history. It models three quantities per memory state: stability, the number of days until retention falls to 90 percent; difficulty, the intrinsic hardness of the item; and retrievability, the current probability of recall.

The scheduler targets a desired retention — conventionally 0.90 — and chooses the interval that hits it, then adjusts stability upward or downward based on the actual review outcome. Twenty-two parameters govern the model by default; with enough review history for a deck, individual item difficulty and stability parameters can be fitted per item.

Practical consequences for a course deployment: FSRS beats SM-2 on the metric that matters, retention at a fixed review load, but it needs review history to fit. A new deck falls back to a default model, which is closer to SM-2 than to a fitted scheduler. Higher target retention means more reviews and better recall; 0.85 suits a large syllabus, 0.90 suits a smaller one or a language, 0.95 is expensive and rarely justified outside short exam windows.

Deck-level parameters should be optimised on the learner's own review log, and re-optimised after a few hundred reviews. Optimising on a class cohort's aggregate log produces a single schedule that is wrong for both ends of the ability range.

## Leitner and other box systems

The Leitner system sorts items into numbered boxes and moves them up a box on a correct answer and back down on an incorrect one, reviewing box 1 daily and higher boxes at widening intervals. It is easy to explain to learners and easy to implement, and it has two structural weaknesses: interval steps are chosen by hand rather than fitted, and the move-on rule is identical for every item regardless of its difficulty. It remains a reasonable choice for a classroom with no scheduler software.

Anki's default settings follow SM-2 while offering FSRS as an alternative. SuperMemo itself uses a later algorithm than SM-2, and its "hard" and "easy" grades apply different multipliers that SM-2 does not. Any of these is defensible; mixing two schedulers across cohorts in the same course is not, because the resulting review loads will differ and the comparison becomes meaningless.

## Interleaving and blocking

Most study is blocked: all the type A problems, then all the type B problems. Interleaving mixes them. Interleaved practice feels harder and produces worse immediate performance while producing better delayed performance and better ability to tell the categories apart. This is desirable difficulty again, and it is the single change with the clearest evidence and the highest learner resistance.

The practical recommendation for a course is: teach blocked, then interleave. Learners need a successful blocked run to build the initial representation of a concept; they need interleaved practice to consolidate discrimination between concepts. Switching straight to interleaving before the concept exists produces failure that is attributed to the method rather than to the prerequisite.

## Intervals in practice

A first-year course with a single term and a final exam usually schedules in three passes:

1. **Introduction and near-transfer practice during instruction.** Short intervals, low difficulty items, high volume. The goal here is stability, not elegance.
2. **Retrieval practice at expanding intervals through the term.** Items move into the multi-month range as they mature.
3. **Consolidation in the last three to four weeks.** Intervals shorten, sessions become mixed and cumulative, and new items are not introduced.

Mixed is the operative word in pass three. The failure mode to avoid is continuing to add new material during revision, which converts the final fortnight into an unbounded queue and produces the "I got through everything once" state that does not survive the exam.

## Leaches and item repair

An item that fails repeatedly is a **leech**, conventionally four to eight failures. The correct response is to fix or retire the item, not to keep scheduling it. Persistent failure usually means the item is ambiguous, too complex, or split into two items. A leech that keeps recurring also suppresses performance statistics for the whole deck, so diagnose the item before diagnosing the learner.

Item maturity states are worth naming, because they change what a scheduler should do. Young items are past a few reviews with low stability and need short intervals and prompt review. Mature items have high stability and need long intervals. Re-learning applies after a lapse and is often handled separately in order to avoid a single hard item dominating the daily queue.

## Mapping schedules to the assistant's decisions

The Personalised Learning Plan skill reads `insightData` from the learner insight tool and emits adaptations in six buckets: `pacing`, `content`, `process`, `product`, `environment`, and `engagement`. The scheduling-relevant mappings are:

| Insight signal | Scheduling consequence emitted |
| --- | --- |
| `performanceLevel` of `below`, or `academic-struggle` in `riskFlags` | Slow pace with pre-teaching and chunking; guided practice weighted up |
| `progressRate` of `slow` | Mastery gate at 80 percent before advancing, with spiral review; intervention blocks and weekly progress monitoring |
| `performanceLevel` of `above` | Compressed curriculum, extension menus, independent inquiry, self-directed work |
| `motivationLevel` of `low`, or `engagementScore` below 40 | Gamified progress structure, relevance work, autonomy choices, relationship touchpoints |
| `performanceLevel` of `on-track` with no risk flags | Steady schedule at the default spacing |

The 80 percent mastery gate is the one concrete scheduling threshold in the assistant. It is a mastery-learning figure: a learner demonstrates mastery of a component before advancing, and components spiral back into later practice rather than being retired. It should not be applied to fluency or to creative work, where strict gating produces avoidance rather than learning.

The `recommendations` object is horizon-scoped — `immediate`, `shortTerm`, and `longTerm`, each carrying two process or content items and two engagement or product items — with a `monitoring` list fixed at weekly progress checks on target skills, bi-weekly engagement surveys, and monthly learning-style reassessment. Those cadences are defaults, not evidence-based constants; a course with weekly assessments should check progress weekly on the assessed skills and monthly on everything else.

## Designing the item, not just the schedule

Scheduling cannot rescue a badly formed item. A prompt that asks the learner to reproduce a paragraph verbatim produces a perfect scheduler working on worthless data. The productive-item criteria:

- One specific retrieval target per item. A card asking for three related facts retrieves three facts at once and scores them as one.
- A cue that is unambiguous without the answer present. "Define X" is a poor cue; "What does X do that Y does not?" is a good one.
- Minimum concept principle: the card should be the smallest thing worth learning, not a summary of a paragraph.
- No answers on the reverse side that give the answer away as a cue, since that turns retrieval into recognition.
- Diagrams as cues where the diagram carries the information, not as decoration.

The cost model worth stating: an item's total lifetime cost is its creation cost plus every repeat review of it. An item rated `2` every single time costs far more than it will ever return and should be rewritten, which is the practical argument for leech handling.

## On learning styles

The assistant accepts a `learningStyle` of `visual`, `auditory`, `kinesthetic`, `reading`, or `multimodal` and emits modality-specific content, process, and product suggestions. Treat this as a preference signal, not a fixed trait. The matching-studies literature on visual and auditory learning styles does not support the strong form of the claim that instruction matched to a style improves learning, and cohort-level preferences are not stable individual traits. Use the field to widen the menu of representations a learner can choose from — which is sound practice and matches the `multimodal` default — and not to narrow it to one modality or to predict ability.

The same caution applies to `engagementScore`, `progressRate`, and `motivationLevel`. They are useful as triggers for a human conversation about what is blocking the learner. They are not a diagnosis, and a low value on a quiet learner who is learning well is a false positive the teacher must be able to override.

## Configuring this

The 80 percent mastery threshold, the engagement-score cut of 40, the weekly, bi-weekly, and monthly monitoring cadences, the default learning style of `multimodal`, and the default performance and progress levels are defaults held in the adaptation logic. A deployment overrides them by supplying different `insightData` from the learner insight connector and by editing the skill's persisted configuration where the values are exposed. The scheduler parameters themselves — easiness factor bounds, desired retention, interval modifiers, and leech thresholds — are not configuration fields in the assistant and are not currently driven by these skills; a deployment that wants a specific scheduler should configure it in the platform's spaced-repetition component and let the assistant consume its scheduling output through the learner insight path.
