# Executive Coaching Frameworks

This handbook defines the coaching and assessment frameworks the Executive & Leadership Advisory Assistant applies. It covers the focus areas of the Leadership Advisory skill, the competency, emotional-intelligence, and presence models it structures, the communication-analysis dimensions it scores, and the developmental taxonomy it uses for learning objectives. Use it so an assessment, a coaching plan, or a communication read-out is built on a recognized framework rather than on invented scores.

## Leadership Advisory focus areas

The Leadership Advisory skill selects its mode through `focusArea`:

- `coaching` — a structured coaching plan.
- `decision-framework` — a structured strategic decision.
- `leadership-assessment` — a competency assessment.
- `eq-assessment` — an emotional-intelligence assessment.
- `presence-analyzer` — an executive-presence read.
- `communication-analyzer` — an analysis of written or spoken text.
- `communication-coach` — coaching on a draft message.

Every branch structures the material the caller supplies and nothing more. Assessments return `null` ratings instead of invented scores, the coaching plan leaves per-session focus and outcomes unset for the executive to complete, and the only numbers the skill computes are word and sentence counts derived from supplied text.

## Leadership competency model

The default competency set, accepted as a custom list through `competencies`:

1. Strategic Thinking
2. Emotional Intelligence
3. Communication
4. Decision Making
5. Team Building
6. Change Management

Each competency is assessed on a 1–10 self-rating and a 1–10 target rating, both supplied by the executive, with evidence recorded as specific examples demonstrating the competency. The assistant does not estimate a rating; it reports `selfRating: null` and `targetRating: null` until evidence is supplied.

## Emotional intelligence model

The EQ assessment uses the five-dimension Goleman model, accepted as a custom list through `dimensions`:

1. Self-Awareness
2. Self-Regulation
3. Motivation
4. Empathy
5. Social Skill

Each dimension takes a 1–10 score or a validated-instrument score, plus a behavioral descriptor. Scores must be supplied or obtained from a validated EQ instrument; the assistant estimates none.

## Executive presence model

The presence analyzer rates sessions against six factors:

- Body Language
- Vocal Tone
- Engagement
- Clarity
- Authority
- Authenticity

Presence analysis requires observational data — session recordings, transcripts, or observer notes. Each factor takes a 1–10 rating with specific behavioral observations. With no session data, the assistant reports the framework and no rating.

## Communication analysis

The communication analyzer scores text against six dimensions: Clarity, Conciseness, Tone, Persuasiveness, Structure, and Empathy. From the supplied text it derives only these metrics:

- `wordCount` — words in the text.
- `sentenceCount` — sentences, split on `.`, `!`, `?`.
- `avgWordsPerSentence` — `wordCount / sentenceCount`, rounded.
- `paragraphCount` — non-empty paragraphs separated by blank lines.

Dimension ratings (1–10 with examples from the text) require human judgment and are left unset. The communication coach applies a length heuristic: under 50 words is flagged as needing more context, over 200 words as a candidate for condensing, and the range between as appropriate.

## Developmental taxonomy

Learning objectives across coaching and development plans are written against Bloom's taxonomy — remembering, understanding, applying, analyzing, evaluating, creating — so that a development action names the cognitive level it targets rather than a vague "improve." A coaching plan defaults to the topics Self-awareness, Decision-making, Communication, Strategic thinking, and Team leadership, over a default of 4 sessions, each with focus, preparation, and outcome left for the executive to define.

## Coaching plan output

The `coaching` focus area produces a plan with this structure:

- A header: role, level, and the count of sessions planned.
- One block per session: the topic, with `focus`, `preparation`, and `desired outcome` each left unset for the executive to define.
- A summary of the strengths to leverage, the development gaps to address, and the goals.

The plan defaults to the topics Self-awareness, Decision-making, Communication, Strategic thinking, and Team leadership, over a default of 4 sessions, taking the first `sessionCount` topics. Per-session focus, preparation, and outcomes are deliberately unset: they are the executive's to define, and the assistant does not invent them.

## Decision-framework output

The `decision-framework` focus area produces:

- The decision, the options (each with a label and description), and the evaluation criteria.
- A fixed next-step sequence: define criteria with weights, score each option against each criterion, calculate weighted scores, identify risks and mitigation for the top option, and define the decision deadline and its reversibility.
- An explicit `scored: false` and `recommendation: null`.

The framework structures the decision; it does not score it, because scoring requires a human judgment the skill cannot make. An option is never preferred automatically.

## Assessment outputs

Each assessment returns a structured skeleton with the ratings left null:

- `leadership-assessment` — each competency with `selfRating: null`, `targetRating: null`, and an empty `evidence` array.
- `eq-assessment` — each dimension with `score: null` and `descriptor: null`.
- `presence-analyzer` — the six presence factors with an empty `ratings` object.
- `communication-analyzer` — the six communication dimensions with an empty `ratings` object, plus the derived text metrics.
- `communication-coach` — the message, its metrics, the coaching suggestions, and `rewrittenMessage: null`.

## Presence analysis output

The presence analyzer accepts sessions as objects with `topic` and `description`. When sessions are supplied, it lists them and then reports each presence factor as "not assessed (supply observation notes per session)". When none are supplied, it reports the framework and no rating. In both cases the six factors are the same; the difference is whether session data accompanies them.

## Communication coach quick checks

The communication coach applies a fixed set of quick checks to a draft message:

- **Opening** — does the first sentence state the purpose?
- **Audience** — is the language appropriate for the intended audience?
- **Tone** — is the tone constructive and professional?
- **Call to action** — is the desired response clear?
- **Length** — under 50 words flags "consider adding context"; over 200 words flags "consider condensing"; the range between is "appropriate length".

The default coaching suggestions are: review clarity, check tone, strengthen the opening, and verify audience alignment. The coach does not rewrite the message; `rewrittenMessage` is null until the executive supplies a rewrite.

## Applying Bloom's taxonomy

When a development or coaching action names a learning objective, write it against a Bloom level so the action states the cognitive depth it targets:

- **Remembering** — recall the framework or model.
- **Understanding** — explain it in the executive's own context.
- **Applying** — use it in a real meeting or decision.
- **Analyzing** — break down a past decision into its components.
- **Evaluating** — judge alternatives against criteria.
- **Creating** — produce a new plan or artifact.

A vague "improve communication" becomes, for example, "apply the structure dimension in the next board memo" — an applying-level objective with an observable test.

## Configuring this

The competency set, the EQ dimensions, the presence factors, the communication dimensions, and the Bloom's-taxonomy framing are defaults. Operators supply their own `competencies`, `dimensions`, `topics`, and `sessionCount`, and provide the 1–10 ratings, evidence, and behavioral descriptors that the assistant refuses to invent. The workspace path for persisted advisory records is set through the skill's persisted configuration, which defaults to the executive workspace.
