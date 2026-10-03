# Board Communication Templates

This handbook defines the executive communication formats the Speech & Communication Co-Pilot drafts. It covers the four formats, the tone, length, channel, priority, and urgency settings, and the required structure of each draft. Use it so a board memo, a stakeholder note, or a crisis statement follows a consistent, reviewable shape before anyone approves it for release.

## Formats

The Co-Pilot selects its output through `format`:

- `speech` — a speech or keynote.
- `board-comm` — a board communication.
- `stakeholder-message` — a message to a stakeholder audience.
- `crisis-statement` — a crisis or sensitive communication.

Every draft requires at least one of `occasion`, `audience`, or `keyMessages`; with none of the three the skill reports an input-required failure rather than producing empty copy.

## Tone, length, channel, priority, urgency

| Setting | Options | Default |
|---|---|---|
| `tone` | executive, inspirational, authoritative, conversational, empathetic-authoritative, visionary | executive |
| `length` | short, medium, long | medium |
| `format` | speech, board-comm, stakeholder-message, crisis-statement | speech |
| `channel` | email, slack, letter, video-script, linkedin | email |
| `priority` | standard, urgent, confidential | standard |
| `urgency` | immediate, within-hour, today, this-week | immediate |

Speech length maps to word targets: short is 300–500 words, medium is 600–1000, long is 1200–2000. Key messages are capped at 3–5.

## Speech structure

1. Opening (hook + purpose) — 1–2 paragraphs.
2. Key Message 1 (and 2, 3 as supplied) — each with supporting story or data.
3. Transition to close — a bridge to the call to action.
4. Closing (call-to-action + vision) — 1–2 paragraphs.

Speaker notes mark the opening and close for rehearsal aloud, pauses and emphasis, and timing against the word target. Tone adds guidance: inspirational drafts use anaphora, triads, and contrast; authoritative drafts lead with conclusions and definitive language; conversational drafts use inclusive language and invite dialogue.

## Board communication structure

1. Executive summary (2–3 sentences) — the bottom line up front.
2. Context / background — why this matters now.
3. Analysis / options — key data, tradeoffs, recommendation.
4. Decision requested — the specific ask of the board.
5. Risks & mitigation — the top three risks.
6. Appendix — supporting data, available on request.

The draft carries `subject`, `audience`, `tone`, and `priority`, and lists any compliance constraints verbatim.

## Stakeholder message structure

- Subject line — clear and specific, under 50 characters for email.
- Opening — acknowledge context, state purpose in 1–2 sentences.
- Body — each key message expanded with context, data, or story.
- Call to action — the specific next step for the recipient.
- Closing — a professional sign-off appropriate to the tone.

## Crisis statement structure

1. Acknowledgment — what happened, direct and factual.
2. Impact — who is affected and how.
3. Action — what is being done right now.
4. Commitment — what will be done, by when.
5. Contact — how affected parties can reach the organization.

Crisis principles applied to every statement: be first, be right, be credible; express genuine empathy before facts; avoid speculation and state only confirmed information; and commit to transparency with a timeline for updates. With no legal constraints supplied, the draft flags that legal review is required before release.

## Draft output shape

Every format produces the same output contract: a structured result carrying the settings used (`format`, `occasion`, `audience`, `tone`, and the format-specific fields), the rendered `draft` body, and a persisted record. The draft body is plain text with a header block (occasion, audience, tone, and the format-specific settings), the key messages, any constraints, the context, and the sectioned draft structure.

## Tone guidance

The tone selection changes both the language and the structure of the draft:

- **executive** — measured, precise, board-appropriate; the default.
- **inspirational** — uses rhetorical devices: anaphora, triads, and contrast.
- **authoritative** — leads with conclusions and uses definitive language.
- **conversational** — uses inclusive language (we, our) and invites dialogue.
- **empathetic-authoritative** — pairs directness with empathy; the crisis default.
- **visionary** — forward-looking, framed around the long-term outcome.

For speeches, the tone adds specific speaker notes; for board communications, it shapes the executive summary's voice.

## Stakeholder channel guidance

The stakeholder-message format adapts to its `channel`:

- **email** — subject line under 50 characters; a direct opening and a clear call to action.
- **slack** — concise; the subject line is a short channel-appropriate headline.
- **letter** — formal; a professional sign-off appropriate to the tone.
- **video-script** — spoken lines with the structure of a spoken address.
- **linkedin** — a public-post register; concise and shareable.

The channel is recorded on the draft so the operator can confirm the register matches where it will be sent.

## Crisis escalation

The crisis-statement format carries an `urgency` setting that governs the response posture:

- **immediate** — acknowledge now; a first statement goes out before all facts are known.
- **within-hour** — a first statement within the hour, then a scheduled update.
- **today** — a statement today with a commitment to a timeline for updates.
- **this-week** — a considered statement this week, with interim holding language.

With no legal constraints supplied, the draft flags that legal review is required before release. A crisis statement is never sent without human approval, and it states only confirmed information.

## Review and approval workflow

Every draft passes through the same gate before release:

1. Review the key messages against the intent.
2. Confirm the tone and the register match the audience and channel.
3. Check the constraints and compliance section is complete.
4. Confirm any decision requested is stated explicitly.
5. Approve for send; the assistant does not send on its own.

The safety boundary on every output is explicit: drafts are for review and editing, and are not to be sent without human approval.

## Configuring this

The tone, length, channel, priority, and urgency option sets, the word targets, and the section orders are defaults. Operators set `tone`, `length`, `format`, `channel`, `priority`, and `urgency` per draft, supply `keyMessages` (3–5) and any `constraints`, and provide the `subject` and `occasion` the draft fills in. The workspace path for persisted drafts is set through the skill's persisted configuration, which defaults to the executive workspace. Every draft is advisory and is sent only after human approval.
