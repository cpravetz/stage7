# Contract Review Playbooks

A contract review is a repeatable reading, not a judgement call about whether a deal feels fair. This handbook defines the clause vocabulary the Legal workflow recognises, states the position this practice takes on each clause family, and gives the worked example so that the same contract always produces the same findings. Nothing here is legal advice; it is the house position a reviewer applies and then escalates from.

## The clause families

Every finding this practice raises falls into one of these families. A clause is assessed against the position below, and the delta between the contract's wording and the position is what gets reported.

| Family | What it governs | Who it binds | Escalation trigger |
| --- | --- | --- | --- |
| Term and renewal | Duration, auto-renewal, notice periods | Both | Auto-renewal longer than 30 days' notice |
| Termination | For cause, for convenience, cure periods | Both | Either side may terminate without cause |
| Liability | Cap, exclusions of indirect loss | Both | Cap uncapped, or consequential loss expressly recoverable |
| Indemnity | Scope, defence control, survival | Both | One-way indemnity against a low-risk supplier |
| IP and ownership | Assignment, licence, work made for hire | Both | Assignment without further consent or compensation |
| Confidentiality | Definition, permitted use, duration | Both | Perpetual, or no survival carve-out on termination |
| Data protection | Roles, sub-processors, breach notice | Controller | Breach notice longer than 72 hours |
| Warranties | Scope, disclaimers, remedy | Supplier | Warranty on a delivered system removed entirely |
| Payment | Terms, indexation, set-off | Customer | Payment terms above 60 days for a small supplier |
| Regulatory | Compliance covenants, audit rights | Both | Covenant without a remedy for breach |
| Change control | Scope change mechanics, pricing | Both | Unilateral pricing change without notice |
| Exit | Assistance on termination, data return | Vendor | No transition assistance obligation |

## Positions

**Term and renewal.** Auto-renewal is acceptable; silence is not. Where a contract renews automatically, the notice window should be at least 30 days and should be recorded with the date it falls due in the register, because a missed window is the single most common source of unwanted spend in a contract portfolio.

**Termination.** Termination for cause should carry a cure period proportionate to the breach. Termination for convenience should be mutual or, if one-way, should carry an exit fee that declines over the term. Asymmetric termination is a finding even when the term is short.

**Liability.** The cap should be a multiple of fees paid over a stated period, commonly 12 months, and should not fall below insurance limits the supplier is obliged to carry. Exclusion of indirect and consequential loss is expected. A liability cap that does not exist is not a permission to sue without limit; it is an unallocated risk, and it is reported as one.

**Indemnity.** Indemnities should be mutual where both parties take comparable risk, and the indemnifying party should control the defence, with the indemnified party retaining the right to participate. A supplier indemnity should survive termination; survival periods are stated in years, not "indefinitely".

**IP and ownership.** Pre-existing IP stays with the party that created it and is licensed, not assigned. Work made for hire applies only where the jurisdiction recognises it for software. Assignment of all rights, including the supplier's background IP, is a finding.

**Confidentiality.** Definitions should be specific enough to exclude information the receiving party already holds or develops independently. Duration should be stated; five years is standard for commercial information, perpetual only for trade secrets. Confidentiality obligations should survive termination.

**Data protection.** Roles — controller, processor, sub-processor — must be stated, not implied. Sub-processor changes should require notice with an objection right. Breach notification must be within the statutory window: 72 hours for personal data under GDPR, and no slower than the equivalent window wherever the applicable regime is faster.

**Warranties.** A delivered system carries a warranty for a stated period with a defined remedy ladder: repair, replace, refund. Disclaimers of implied warranties are common and acceptable only alongside an express warranty that replaces them. Removing the express warranty is a finding.

**Payment.** Terms should reflect the supplier's size and the risk of delivery. Above 60 days from a small supplier is a liquidity finding that belongs in commercial negotiation, not in the legal review. Indexation should be a published index, not a discretionary adjustment.

**Regulatory.** Every compliance covenant should carry a remedy. A covenant with no remedy, no audit right, and no termination trigger is an undertaking, not a clause.

**Change control.** Scope changes should be priced in advance, in writing, with a defined acceptance step. Unilateral price adjustment without notice is a finding.

**Exit.** Exit obligations matter most at the moment they are least wanted. Data return in a usable format, transition assistance for a defined period, and assistance with migration are all expected where the vendor holds operational dependency.

## Reviewing in order

Read in a fixed order, because the order is where the risk concentrates:

1. **Parties and term.** Establish who is bound, for how long, and when the next decision date falls.
2. **Liability and indemnity.** The largest financial exposure, and the clause most often negotiated late.
3. **Data protection.** Only if the contract processes personal data.
4. **IP and confidentiality.**
5. **Payment and change control.**
6. **Exit.**

Report findings as clause family, quoted wording, the position, the delta, and the remedy sought. A finding without a quoted clause cannot be acted on by the other side.

## Definition discipline

Contract review fails in one predictable way: two reviewers use different definitions of the same clause. Fix these first:

- "Confidential information" means the contract's definition, not the reviewer's intuition.
- "Material breach" is assessed against the contract's own threshold where one exists.
- A finding names the clause family and quotes the wording; a general impression is not a finding.
- The register records the review date and the notice date falling due, so auto-renewal windows are not lost.
- Sweep scope is read from configuration, never from the caller's input. `contractSources` is required for a reason: a sweep that could be pointed anywhere by its input is a sweep that will be pointed somewhere careless.

## Configuring this

Every threshold in this document is a default a lawyer overrides. The scheduled contract risk sweep reads `contractSources`, the required array of store keys it sweeps — the Skill refuses to run without it, because an unbounded sweep reviews every contract on hand. `tagFilters` restricts the sweep to contracts carrying named tags, and `cadence` records the schedule the run belongs to. The compliance tracking Skill takes `policySetId` for the control set being evaluated, `sources` for where evidence is read from, `scanWindow` for the period covered, and `notifyOn` for who hears about findings; with no `policySetId` it reconciles scope only and reports that it evaluated no controls. The matter document ops tool reads its endpoint from `MATTER_DOCUMENT_OPS_ENDPOINT` and never drafts an operative clause on its own. Where a counterparty's paper differs from the positions above, the counterparty's paper governs the assessment and the divergence is what gets reported.