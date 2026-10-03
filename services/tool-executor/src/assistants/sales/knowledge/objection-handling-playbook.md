# Objection Handling Playbook

This handbook defines how the B2B Sales & Pipeline Intelligence Assistant drafts outreach and handles objections. It covers the built-in outreach templates, the sequence design rules, the variable-completeness rule that prevents invented copy, the objection categories the assistant coaches against, and the LAER structure it applies to a raised objection. Use it to draft a sequence, to log an objection, or to rehearse a response before a live call.

## Built-in outreach templates

Outreach Drafting renders three templates, each with subject-line variants and a body. Every variable a template needs must be supplied; a template that needs an unsupplied variable is skipped and reported, never filled with invented text.

| Template | Required variables | Purpose |
|---|---|---|
| `cold` | firstName, company, industry, myCompany, valueProp, myName | First contact |
| `followup` | firstName, valueProp, myName | After no reply |
| `nurture` | firstName, topic, company, myName | Value-led touch |

Subject variants are deduplicated, and any subject whose placeholders were not all supplied is dropped. A `subject` override replaces the first step's subject; a `customTemplate` is rendered only when it is free of unresolved `{variable}` placeholders.

## Sequence design

A sequence is an ordered list of template keys drafted as a multi-step cadence. Each step carries its step number, template, rendered subject and body, channel, and `delayHours` — the cumulative hours after the first step, computed as `stepIndex × sequenceDelay`. The default delay between steps is 48 hours. Channels are `email`, `linkedin`, and `sms`. Nothing is ever sent; a draft is produced for the operator to review and send.

## The nothing-invented rule

Two rules drive outreach drafting:

1. Nothing is invented. A variable the caller did not supply is never replaced with filler; the template that depends on it is dropped and the report names the missing variable.
2. Every line of the rendered draft traces back to a supplied value. A subject or paragraph that would otherwise read as filler is removed rather than emitted.

The draft report lists the supplied variables, the unused variables, the skipped templates with their missing variables, and any unknown template keys, so the operator can see exactly what was and was not used.

## Objection categories

Objections raised during discovery or a proposal are grouped into six categories:

- **Price** — the cost is outside the buyer's budget or expectation.
- **Timing** — the buyer is not ready to act now.
- **Authority** — the contact is not the economic buyer or decision owner.
- **Need** — the buyer does not see the problem as worth solving.
- **Competition** — a rival, or the status quo, is preferred.
- **Trust** — the buyer doubts the vendor's ability or fit.

An objection is logged as a pipeline `activity` through Pipeline Ops, typed against the associated `leadId` or `opportunityId`, so it is tracked rather than lost.

## The LAER response structure

The assistant coaches a response to a raised objection through LAER:

1. **Listen** — acknowledge the objection fully before responding.
2. **Acknowledge** — validate the concern; do not argue with it.
3. **Explore** — ask a clarifying question to find the real constraint behind the stated one.
4. **Respond** — address the root constraint with evidence, a reframe, or a concession.

For a price objection, for example, the response reframes around the Metrics dimension of MEDDPICC — the quantified outcome the buyer is measured on — rather than defending the number directly.

## Template details

Each template ships with subject-line variants and a body. The variants are rendered from the same variables as the body, deduplicated, and any variant whose placeholders were not all supplied is dropped.

**Cold outreach** — subject variants: "Quick question about {industry}", "{firstName}, {company} and {myCompany}?", "Curious about the {industry} stack". Body: a greeting, a line noting the recipient's industry and the sender's value proposition, a 15-minute ask, and a sign-off.

**Follow-up** — subject variants: "Following up on {topic}", "Quick follow-up", "Checking in, {firstName}". Body: a greeting, a reference to the earlier value proposition, an offer of a quick call, and a sign-off.

**Nurture** — subject variants: "Resource on {topic}", "{firstName}, thought this might be useful", "A short read on {industry}". Body: a greeting, a shared resource on the topic relevant to the recipient's company, an offer to answer questions, and a sign-off.

## The rendering engine

Outreach is rendered by substituting `{variable}` tokens with supplied values:

- A token with a supplied value is replaced.
- A token without a value is left in place, which marks the template as incomplete.
- A body or subject that still contains a `{` after rendering is incomplete and is not emitted.
- Subject variants are deduplicated after rendering, so two patterns that render identically appear once.

The first step uses the `subject` override when supplied, otherwise the first usable subject variant. Each subsequent step's `delayHours` is its index times the sequence delay.

## Custom templates

A `customTemplate` is a body authored with `{variable}` placeholders. It is rendered only when it is free of unresolved placeholders:

- If any `{variable}` remains after rendering, the custom template is rejected and the unresolved variables are named.
- If it renders cleanly and a `subject` override is supplied, that subject is used.
- If it renders cleanly with no override, the primary template's subject variants supply the subject; if none can be derived, the custom template is rejected.

A rejected custom template does not stop the built-in steps; it is reported as skipped with its unresolved variables.

## Objection categories with response patterns

Each category has a default response posture:

- **Price** — reframe around the Metrics dimension: the quantified outcome the buyer is measured on, and the cost of the status quo.
- **Timing** — explore the constraint; a pilot or a phased start can bridge a timing gap.
- **Authority** — identify the economic buyer through the Decision Process dimension; ask who else is involved.
- **Need** — deepen the Identify Pain dimension; quantify the pain in the buyer's own terms.
- **Competition** — differentiate on the Decision Criteria the buyer actually uses, not on features alone.
- **Trust** — offer evidence: references, case outcomes, or a trial that lets the buyer verify.

## The LAER flow in practice

Applied to a live objection, LAER runs as a conversation, not a script:

1. **Listen** — let the buyer finish; do not interrupt or reload a prepared answer.
2. **Acknowledge** — name the concern back to the buyer, so they know it was heard.
3. **Explore** — ask one clarifying question to find the constraint behind the stated objection.
4. **Respond** — address the root constraint with evidence, a reframe, or a concession.

A response that skips Explore answers the stated objection and misses the real one; a price objection that is really a trust objection is not solved with a discount.

## Logging an objection

An objection raised during a conversation is logged as a pipeline `activity` through Pipeline Ops:

- Set `entity` to `activity` and supply the `entityId`.
- Associate it with the `leadId` or `opportunityId` it belongs to.
- Record the objection category, the buyer's words, and the response given.
- Type the meeting as `discovery`, `demo`, `proposal`, `followup`, or `negotiation` as appropriate.

Logging the objection keeps it tracked across the deal, so a later conversation does not re-litigate one already answered.

## Configuring this

The template set, the subject variants, the 48-hour default delay, and the channel set are defaults. Operators choose the `template` or `sequence`, set `sequenceDelay`, select the `channel`, and supply the `recipient` and `variables` each chosen template requires. The default delay between sequence steps is tuned through the Outreach Drafting skill's persisted configuration. A draft is never sent automatically; the operator reviews and sends it.
