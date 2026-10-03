# Corporate Governance Standards

This handbook defines the governance vocabulary the Executive & Leadership Advisory Assistant uses when it structures board materials, strategic risk, and scenario analysis. It covers the risk domains the assistant assesses, the likelihood-impact scoring model, the scenario-modeling schema, and the decision framework it applies to strategic choices. Use it so that a risk register, a board memo, or a scenario comparison produced by the assistant is internally consistent and auditable.

## Risk domains

The Risk & Scenario Advisory skill assesses a default domain set, and accepts a custom set through `domains`:

- **Strategic** — market position, competitive displacement, M&A.
- **Operational** — delivery, resourcing, dependency, and continuity risk.
- **Financial** — exposure, liquidity, and reporting risk. Financial exposure is framed against recognized reporting standards (GAAP or IFRS as applicable to the entity) so that a stated impact is comparable across periods.
- **Reputational** — brand, trust, and stakeholder-confidence risk.
- **Compliance** — regulatory, legal, and policy risk.

Each risk carries `name`, `domain`, `likelihood`, `impact`, `mitigation`, and `owner`.

## Likelihood-impact scoring

Likelihood and impact are each selected from `low`, `medium`, `high`, `critical`, mapped to a 1–7 scale:

| Level | Map value |
|---|---|
| low | 1 |
| medium | 3 |
| high | 5 |
| critical | 7 |

The composite risk score is computed as:

```
score = clamp(round((likelihoodValue × impactValue) / 2.5), 1, 10)
```

A risk is flagged high-priority when its score is 7 or above. The register reports the total risks identified, the count of high-priority risks, and for each high-priority risk its likelihood, impact, score, owner, and mitigation. A risk with no supplied likelihood or impact defaults to `medium` on both axes (score 5).

## Scenario modeling

The `scenario-modeler` focus area models a set of scenarios against baseline metrics. Each scenario carries:

- `name` — the scenario label.
- `assumptions` — a free-form object of the inputs the scenario is built on.
- `probability` — a numeric likelihood the caller supplies.
- `impact` — the projected effect, or a derivation from `baseMetrics`.
- `projectedOutcome` — the modeled result, or a note that projection requires scenario-specific assumptions.
- `sensitivity` — the variables the outcome is most sensitive to.
- `response` — the planned response.

With no scenarios supplied, a single baseline scenario is emitted with probability 1 and the base metrics as the projected outcome. The assistant computes projections only from the assumptions the caller supplies; it does not invent financial forecasts.

## Decision framework

The Leadership Advisory `decision-framework` focus area structures a strategic decision without scoring it, because scoring requires human judgment the skill cannot make. The recommended sequence is:

1. Define or confirm evaluation criteria with weights.
2. Score each option against each criterion.
3. Calculate weighted scores.
4. Identify risks and mitigation for the top option.
5. Define the decision deadline and its reversibility.

The output records the decision, the options, the criteria, and an explicit `scored: false` with `recommendation: null`, so a structured framework is never mistaken for an automated recommendation.

## Governance boundaries

Every advisory output carries a safety boundary: executive advisory is for development and decision support, and does not commit organizational resources, make binding decisions, or present recommendations as settled fact without explicit approval. Risk and scenario outputs in particular are decision-support artifacts, not authorization to act.

## Risk register output

The `risk-assessment` focus area produces a register with this structure:

- A summary header: timeframe, domains assessed, total risks identified, and the count of high-priority risks.
- A high-priority section listing each risk at score 7 or above with its domain, likelihood, impact, score, owner, and mitigation.
- A full section listing every assessed risk with its likelihood, impact, score, and owner.

Each assessed risk carries `status: identified`, so a register can be filtered to risks that still need a mitigation or an owner. A risk with no supplied `mitigation` reports "To be defined"; a risk with no `owner` reports "Unassigned".

## Domain-only assessment

When no explicit `risks` are supplied but `domains` are, the skill emits one placeholder risk per domain — `<Domain> Risk` at `medium` likelihood and `medium` impact (score 5), with mitigation "To be assessed" and owner "Unassigned". This produces a skeleton register an executive fills in, rather than an empty result, and it makes clear that the domain has been acknowledged but not yet assessed.

## Scenario modeling output

The `scenario-modeler` focus area produces:

- A summary header: timeframe and the count of scenarios modeled.
- One block per scenario: assumptions (as JSON), probability, impact, projected outcome, sensitivity variables, and the planned response.

When no scenarios are supplied but `baseMetrics` are, a single baseline scenario is emitted with probability 1 and the base metrics as the projected outcome. When neither is supplied, the skill reports an input-required failure. The assistant computes projections only from the assumptions the caller supplies; it does not invent financial forecasts or probabilities.

## Governance controls

These controls apply to every governance artifact the assistant produces:

- **Human decision.** A decision framework structures a choice; it does not score options or recommend one.
- **Explicit approval.** Risk and scenario outputs are decision support, not authorization to commit resources.
- **Traceability.** Every score names the likelihood and impact that produced it, so a register can be audited.
- **Honest limits.** A metric, trend, or target the caller did not supply is reported as unavailable, never estimated.

## Worked risk-scoring example

A supply-chain disruption assessed as `high` likelihood (5) and `critical` impact (7) scores:

```
score = clamp(round((5 × 7) / 2.5), 1, 10) = clamp(round(14), 1, 10) = 10
```

A compliance gap assessed as `medium` likelihood (3) and `medium` impact (3) scores:

```
score = clamp(round((3 × 3) / 2.5), 1, 10) = clamp(round(3.6), 1, 10) = 4
```

The first is high-priority (≥ 7) and surfaces in the high-priority section; the second is tracked in the full register. The clamp keeps a critical/critical risk at 10 rather than letting the raw product run past the scale.

## Board decision rights

A board communication distinguishes the kinds of ask, and the assistant's `board-comm` draft structure reflects that:

- **Ratification** — the board approves a decision already made.
- **Approval** — the board authorizes a proposed action.
- **Advisory** — the board is asked for guidance, not a vote.
- **Information** — the board is informed, with no action requested.

The "Decision requested" section of a board memo names which of these applies, so the board knows what is being asked of it. A memo that states no decision type leaves the ask ambiguous.

## Configuring this

The domain set, the 1–7 likelihood-impact map, the composite formula, and the high-priority threshold of 7 are defaults. Operators override the domains through the `domains` input, supply their own `risks` with explicit `likelihood` and `impact` selections, and provide `scenarios` with their own `assumptions`, `probability`, and `impact` rather than relying on derived values. The workspace path for persisted risk and scenario records is set through the skill's persisted configuration, which defaults to the executive workspace.
