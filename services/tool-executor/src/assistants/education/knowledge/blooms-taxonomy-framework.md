# Bloom's Taxonomy Framework for Lesson and Assessment Design

This handbook is the cognitive-level reference for the Lesson & Assessment Drafting skill and the Personalised Learning Plan skill. It records the six-level revised taxonomy the assistant reasons in, the verb sets it uses to draft objectives and stems, and the assessment-construction rules the drafting code actually applies — including the question mix, point weights, and Bloom-level laddering that determine what a generated quiz measures. Use it when reviewing a draft for level coverage, and use the laddering table when deciding whether a question is testing the right thing.

## The 1956 original and the 2001 revision

The original taxonomy by Bloom and colleagues ran knowledge, comprehension, application, analysis, synthesis, and evaluation, in that order, with evaluation at the apex. The 2001 revision by Anderson and Krathwohl reordered the top two levels and renamed comprehension to understanding: knowledge became remember, and synthesis became create with evaluation immediately beneath it.

The revision is what the assistant implements, in this order:

`Remember → Understand → Apply → Analyze → Evaluate → Create`

The reorder matters for assessment design. A question that asks a learner to justify a decision is an *evaluate* item, not a *create* item, and a question that asks them to design a solution is a *create* item. Under the old ordering these would be scored the other way round, and the distinction drives how much scaffolding a task needs.

The original cognitive-process model further argues the ladder is not a strict hierarchy in every case: apply and create can be cognitively equivalent depending on the task, and creative work often requires analysis and evaluation as well as production. Treat the levels as a planning vocabulary rather than a difficulty curve.

## Level reference

| Level | Learner can | Representative verbs | Typical assessment evidence |
| --- | --- | --- | --- |
| Remember | Retrieve relevant knowledge | define, list, identify, recall, name, state | Terminology checks, label a diagram |
| Understand | Construct meaning from information | explain, describe, summarize, interpret, classify, compare | Explanation in own words, categorisation, summary |
| Apply | Carry out or use a procedure | solve, demonstrate, use, illustrate, construct, execute | Worked application in a new context |
| Analyze | Break down into parts and relate them | analyze, differentiate, organize, attribute, deconstruct, examine | Cause and effect, structure identification, comparison of cases |
| Evaluate | Justify a judgment or decision | evaluate, critique, justify, defend, assess, rank | Argument with evidence, critique a method, rank options |
| Create | Produce a new or original product | design, construct, produce, invent, formulate, generate | Design, plan, compose, prototype |

The assistant's `bloomsVerbs` map supplies six verbs per level, and the first verb in each set is the one used when it auto-generates an objective: "Define …", "Explain …", "Solve …", "Analyze …", "Evaluate …", "Design …". Because the generated objective is `"<verb> <topic> (<level>)"`, the topic field is doing a lot of work. A vague topic produces a vague objective, so supply a specific one.

## The two dimensions

The revised taxonomy is better understood as a matrix than a ladder. The process dimension is the six levels above; the knowledge dimension has four facets:

| Knowledge facet | What it covers | Example for fractions |
| --- | --- | --- |
| Factual | The basic elements and their properties | Definition of a fraction, numerator, denominator |
| Conceptual | Interrelationships among basic elements | Why equivalent fractions have the same value |
| Procedural | How to do something | Steps for dividing fractions |
| Metacognitive | Knowledge of one's own strategy and cognition | Which strategy to choose and why, self-monitoring for errors |

A complete objective names both. "Define a fraction" is factual-remember. "Choose an efficient strategy for adding fractions with unlike denominators and explain why it works" is procedural-apply with a metacognitive layer. Objectives that only ever name one facet produce assessments that only ever measure one.

## Objectives and level coverage

When no `objectives` are supplied, the drafting skill generates one objective at each of the first three levels: Remember, Understand, and Apply. That default is a reasonable lesson-arc opening and a poor exam blueprint. For a summative assessment, specify objectives explicitly across the intended range.

A workable coverage rule for a single lesson: the majority of items at the target level, roughly a third below it to establish the prerequisite, and a small numbers above it to extend. The `difficulty` select of `easy`, `medium`, `hard`, or `mixed` maps loosely onto that distribution, and `mixed` is the right default for anything formative.

One objective per lesson is the usual authored norm and three is the workable upper bound for a single lesson. Above three, the objectives stop being assessment targets and become a topic list.

## Question mix, points, and level laddering

The quiz builder distributes `questionCount` items across five types by fixed proportions, then tops up with short-answer items if rounding left the set short:

| Type | Share of the set | Default points |
| --- | --- | --- |
| `multiple-choice` | 40 percent | 2 |
| `true-false` | 20 percent | 2 |
| `short-answer` | 20 percent | 5 |
| `essay` | 10 percent | 10 |
| `matching` | 10 percent | 2 |

Because the proportions are fixed rather than configured, a 10-question quiz lands as 4 multiple-choice, 2 true-false, 2 short-answer, 1 essay, and 1 matching. If you need a different distribution, author the items yourself and use the draft for structure rather than for the item bank.

Bloom level is assigned by position, not by content: item *n* is placed at level `floor(n / 2)`, clamped to the top level. On a 10-item quiz that puts items 1–2 at Remember, 3–4 at Understand, 5–6 at Apply, 7–8 at Analyze, 9–10 at Evaluate, with Create unrepresented until the set exceeds twelve items. This is a deliberate scaffold from recall to judgement, and it is the one part of the generated assessment most worth checking: the stem templates are topic-generic, so the level label and the stem can disagree. A "multiple-choice" item at Evaluate level is almost always really an Apply item.

The estimated `timeLimit` is `questionCount × 1.5` minutes, rounded up. That assumes about 90 seconds per item, which is optimistic for essay items and generous for true-false. Treat it as a floor for short sets and a placeholder for anything with essays.

## Item-writing quality

The generated stems are structures, not items. The rules that make an authored item worth marking:

- **One unambiguous answer.** If two options can be defended, the item is broken regardless of how well the distractors read.
- **Distractors that are attractive.** A distractor is only useful if a learner who does not understand the concept will actually select it. Plausible errors beat obvious ones.
- **Homogeneous stems.** Keep all options the same length, grammar, and register, and avoid "all of the above" except where it is the intended answer.
- **No negatives.** A double negative reliably measures careful reading rather than the concept.
- **Don't exceed the vocabulary in the objectives.** An item testing an unfamiliar term measures reading, not the target.
- **Vary the item type for the same objective.** Four formulations of one question produce four guesses at the answer format, not four independent checks.

For constructed-response items, the companion requirement is a scoring rubric with the criteria named in the question stem. An essay worth ten points with no rubric is scored on plausibility.

## Lesson plan phase structure

The lesson-plan builder allocates a supplied `duration` across five phases by fixed proportion, each with a floor so a short lesson does not collapse:

| Phase | Share | Floor | Purpose |
| --- | --- | --- | --- |
| Warm-up / Hook | 10 percent | 5 min | Activate prior knowledge, pose an essential question |
| Direct Instruction | 25 percent | 10 min | Model, think aloud, guided examples |
| Guided Practice | 35 percent | 15 min | Scaffolded practice with feedback |
| Independent Practice | 20 percent | 15 min | Application with differentiation |
| Closure / Exit Ticket | 10 percent | 5 min | Check understanding, preview next lesson |

The floors sum to 50 minutes, so any duration under 50 minutes is silently expanded. Set the duration honestly or the plan will overrun the period.

Differentiation is generated in two columns by default. Support: sentence frames, visual aids, peer pairing, chunked instructions. Extension: challenge problems, real-world application, peer teaching, creative synthesis. The closure and exit-ticket pairing is the formative assessment point; the exit ticket is where a Bloom-level-2 or level-3 check belongs.

## Activities and products

Eight activity templates are available, each with an ordered step sequence: `discussion` (Socratic Seminar), `group-work` (Jigsaw), `lab` (Inquiry Lab), `project-based` (Mini-PBL), `game` (Review Game), `simulation` (Role-Play), `writing` (Structured Writing), and `digital-creation` (Multimedia Project). An activity's duration is set to 60–80 percent of the lesson duration, leaving the remainder for framing and closure.

Each template also emits support and extension differentiation, so a single activity template is expected to be differentiated rather than supplemented. Content drafts follow a six-section structure: key vocabulary, concept explanation, worked examples, scaffolded practice, real-world connection, and self-check. The readability target is emitted as a Lexile estimate of grade × 100 + 200, which is a planning heuristic rather than a measured score; run an actual readability check on the finished text.

## Standards alignment

The `standards` input accepts codes in the usual dotted form, and alignment should be written at the same level of claim as the objective. A standard code plus a restated objective is alignment; a standard code plus an activity title is a label. The check that works: for each standard listed, there is at least one objective that names the behaviour in the standard's own terms, and at least one assessment item that requires that behaviour.

Unaligned listings are worse than no listing, because they create the appearance of coverage and will survive into a programme review unexamined.

## Multimedia and accessibility

Multimedia plans list the requested media types with a purpose and an integration point, and the integration points are the warm-up hook, a direct-instruction supplement, a station rotation, and a homework flip. Video and simulation are the highest-value choices for conceptual and procedural objectives; audio is primarily an accessibility and differentiation asset.

The accessibility list is fixed: closed captions, transcripts, audio descriptions, and keyboard navigation. These are not optional extras in a public or federally funded educational setting, and the resource manager's `accessibilityStandard` select of `WCAG-2.1-AA` or `Section-508` is the standard the repository configuration should name.

## Higher order, and the limits of the generated draft

Anderson and Krathwohl's terms still apply: lower-order items are Remember and Understand, higher-order are Analyze, Evaluate, and Create. Apply sits between and is usually treated as higher-order for the purposes of alignment review.

The drafting skill produces structure, not finished assessment content. Stems are topic-inserted templates, the answer key is marked as living in a separate teacher version, and every generated draft is flagged for teacher review, including the scheduled sweep's placeholder outlines which carry an explicit `requiresTeacherReview` marker. Treat every generated item as a starting point a teacher must read, verify against the objectives, and remove if the level label and the stem do not agree.

## Configuring this

The 60-minute default duration, the 10-question default, the `medium` difficulty default, the phase proportions and floors, the question-type mix, the point weights, the level laddering rule, and the time-limit multiplier are all defaults held in the skill's own drafting logic. The caller overrides the tractable ones per request: `duration`, `questionCount`, `difficulty`, `quizType`, `activityType`, `contentFormat`, `standards`, and `objectives`. The phase proportions, the question-type mix, and the laddering rule are not exposed as configuration, so a school with its own blueprint should author objectives and item specifications directly and use the skill for lesson structure. The resource taxonomy, accessibility standard, and file constraints live in the resource manager's persisted configuration.
