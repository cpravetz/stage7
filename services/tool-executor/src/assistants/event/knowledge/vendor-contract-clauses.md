# Vendor Contract Clauses and Negotiation Standards

Event vendor paper is where an event's cost and risk actually settle. The BEO says what is being bought; the contract says what happens when it arrives late, breaks, cancels, overcharges, injures a guest or cannot be delivered. This handbook is the clause-by-clause reference for vendor agreements — catering, venue, AV and production, rentals, security, staffing, transport and décor — with the market-position defaults we work to and the red flags that should stop a signature.

## Scope and how the pieces relate

Three documents govern a vendor engagement and they do different jobs:

| Document | Answers | Governed by |
| --- | --- | --- |
| BEO / scope sheet | What is being bought, at what price, for which dates | The countersigned BEO |
| Vendor agreement | The terms: payment, cancellation, liability, IP, termination | The contract |
| Purchase order / invoice | What has been billed and paid | Accounting |

Terms, cancellation and liability never live in the BEO. If they do, the BEO is being used as a contract and its revision control is being asked to carry legal weight it was not designed for.

## Clause taxonomy

The vendor workflow's contract records carry `scope`, `deliverables`, `timeline`, `payment schedule`, `cancellation` and `liability`. Those six fields map onto the clause groups below. Anything not covered in the contract is either an implied obligation nobody tested, or a gap.

| Clause group | What to check | Market-position default | Red flag |
| --- | --- | --- | --- |
| Scope of services | Itemised deliverables, quantities, substitutions, exclusions | Itemised, with an exclusions list | "As required", "as needed", open scope |
| Deliverables & acceptance | Named deliverable, format, acceptance criteria, acceptance window | Written acceptance criteria and a sign-off step | Deliverable defined only as an outcome |
| Timeline | Milestones, load-in, on-site hours, standby, teardown | Dated milestone schedule with named dependencies | No load-in window, no standby rules |
| Payment terms | Invoice trigger, due days, deposit, retainage, late fees, currency | Net 30 from a correct invoice; deposit 20–50% | Pay-on-delivery only; no late terms |
| Cancellation | Both directions, notice, kill fee ladder, force majeure carve-out | Symmetric ladder (see below) | One-sided: vendor may cancel, planner may not |
| Force majeure | Definition, notice, mitigation duty, termination right after prolonged event | Includes supply chain and staffing failure; long-stop termination | Broad enough to excuse ordinary late delivery |
| Insurance | Required types, limits, additional insured, certificate timing, expiry | COI before access; limits scaled to exposure | Certificates collected after the event |
| Indemnification | Who indemnifies whom, for what, and the defence/costs split | Each party indemnifies for its own fault | One-way indemnity covering all loss |
| Limitation of liability | Cap basis, carve-outs, consequential damages exclusion | Cap at fees paid in a defined period | Unlimited or uncapped consequential damages |
| IP & publicity | Ownership of photos, video, recordings, logo use, name and likeness | Organiser owns event capture; vendor may not publish without consent | Vendor owns all images including your guests |
| Confidentiality | Scope, duration, permitted disclosures, return of materials | Mutual, survives 2–3 years | One-way, or survives indefinitely |
| Termination | Notice, cure period, termination for convenience and for cause | 30-day convenience, 10-day cure for material breach | Termination only for insolvency |
| Change control | How scope changes are priced and authorised | Written change order before work | Verbal changes billed after the fact |
| Compliance | Law, permits, licences, insurance, site rules, data protection | Vendor responsible for its own compliance | Organiser carries the compliance burden |
| Dispute resolution & governing law | Forum, arbitration or court, venue, escalation, survival | Escalation then mediation, defined forum | Foreign forum with no realistic path to enforcement |
| Non-solicit / exclusivity | Duration, scope, carve-outs for general advertising | Narrow, time-limited, with general-solicitation carve-out | Broad non-compete that a planner cannot honour |

## Scope, deliverables and acceptance

Scope is the clause that prevents the most expensive conversation. Every vendor statement should be convertible to a line item with a quantity and a price.

- **Itemise, and itemise the exclusions too.** "Exclusively as specified in Exhibit A; all items not listed are excluded."
- **Define the deliverable.** "Speakers" is not a deliverable; "two line-array speakers, two wireless handheld mics, one lectern mic, cabling to FOH, and a tech on site for the full programme" is.
- **Name the acceptance test** and who signs it. Equipment works and is sound-checked; food is served at temperature; staffing is present per the roster.
- **Define substitution rules** in writing. A caterer's right to substitute is routine; the client's right to approve the substitute is the part to insist on.
- **Define what happens to rejected deliverables**: re-performance, credit, or termination.

## Timeline, standby and access

- Dated milestones with dependencies named, so a slip is attributable.
- **Load-in and load-out windows** with vehicle and dock constraints.
- **Standby**: whether the vendor is paid while idle waiting on the client, and from when. This is a common and legitimate charge; it should be agreed, not discovered on the invoice.
- **Overtime** rates stated hourly, with the person who can authorise them named.

## Payment terms and schedule

Defaults that work in an ordinary commercial relationship:

| Element | Market-position default | Notes |
| --- | --- | --- |
| Invoice trigger | On delivery, or on the acceptance sign-off where one exists | Never on order placement |
| Payment terms | Net 30 from receipt of a correct invoice | Net 15 where the vendor is a small supplier |
| Deposit | 20–50% on signature; balance on completion | Higher for custom build or rentals |
| Retainage | 5–10% held until acceptance or snag list closed | For build, production and installation scope |
| Late payment | Interest at a stated rate, plus recovery of collection costs | Must be mutual to be enforceable in many places |
| Disputed invoices | Pay the undisputed portion, query the rest in writing | Never withhold the whole invoice |
| Tax | Quote states whether tax is included | Quotation currency must be unambiguous |

Payment runs through the vendor workflow's `paymentData`, carrying `amount`, `date`, `method`, `invoice` reference and `purpose`, against configured payment providers. The approval workflow in configuration decides who may release a payment and at what threshold; that control matters more than the payment terms.

**Never release a deposit against an unsigned draft.** Release it against a countersigned agreement plus a confirmed purchase order.

## Cancellation and kill-fee schedules

Cancellation clauses should be symmetric and graduated. The planner wants to cancel cheaply, and the vendor wants to be paid for work it cannot reuse; both positions are legitimate, and the ladder is where they meet.

An illustrative graded structure — adjust to the engagement:

| Notice period | Typical cancellation cost |
| --- | --- |
| More than 30 days out | Deposit refunded, less any non-recoverable third-party cost |
| 15–30 days | 50% of contracted value |
| 7–15 days | 75% of contracted value |
| Fewer than 7 days | 100% of contracted value |
| Within the standby window | 100% plus standby hours |

Rules that should hold whatever the ladder says:

- **Symmetry.** If the planner must pay a ladder fee, the vendor must be bound by an equivalent obligation if it withdraws.
- **A long-stop termination right** if force majeure persists past the event date plus an agreed period.
- **Mitigation duty.** Both parties must attempt to re-schedule or re-source before charging the full fee.
- **Act of God carve-out** defined narrowly, so ordinary supplier failure is not force majeure.
- **Postponement** treated explicitly and separately from cancellation; a rescheduled date is not a cancelled one.

## Insurance and indemnity

Collect before access, not after:

| Cover | Why it is required | Note |
| --- | --- | --- |
| General liability / public liability | Third-party injury or property damage | Limits scaled to guest count and activity |
| Additional insured status | Venue and organiser named on the policy | The certificate must actually show it |
| Workers' compensation / employer's liability | Vendor's staff are not the organiser's | Confirm the vendor carries it |
| Auto liability | Any vendor vehicle or delivery | Includes couriers and drivers working the event |
| Equipment / property | Rigging, staging, AV, décor in transit or on site | Often a rider, not standard |
| Umbrella / excess | Catastrophic layer | Common venue requirement |
| Liquor liability | Where alcohol is served under licence | Jurisdiction-specific |

**Indemnity** should follow fault. Each party indemnifies the other for loss caused by its own negligence, breach or wilful misconduct. Its commercially demanding variants — broad indemnities with no fault requirement, one-way indemnities, or indemnities that cover the indemnified party's own negligence — should be pushed back on and, if conceded, paired with a matching limitation of liability.

Certificates expire. Track expiry dates and re-collect before the event, not on the day.

## Limitation of liability

The clause most often missing from event vendor paper, and the one that decides who is exposed when something goes wrong.

- **Cap**: total liability capped at a multiple of fees paid under the agreement, or at an agreed figure.
- **Cap basis matters**: fees paid in the 12 months preceding the claim, total contract value, or a fixed amount. Total contract value is a weaker protection than fees paid.
- **Consequential damages exclusion**: excludes loss of profit, revenue, goodwill and indirect loss. Asymmetric carve-outs (losses recoverable under indemnity but excluded from the cap) undermine the whole clause.
- **Carve-outs from the cap**: bodily injury, death, personal injury, fraud, wilful misconduct, breach of confidentiality, and IP infringement are commonly uncapped. Agree them explicitly rather than letting them appear by default.
- **Insurance alignment**: the cap and the insurance limits should be in the same order of magnitude. A cap far above required cover is decoration.

## IP, publicity and confidentiality

- **Event capture**: the organiser normally owns photographs and recordings produced at its own event. Say so.
- **Vendor portfolio rights**: allow the vendor to use the images only with prior written consent, and no guest identification without a release.
- **Model and property releases**: secure releases for commercial shoots; this is a run-of-show item, not a paperwork item.
- **Confidentiality** should be mutual, cover both parties' commercial information, permit disclosure to advisers and to those who need to know, and survive for a defined period — commonly two to three years, with trade secrets protected longer.

## Termination, force majeure and change control

- **Termination for convenience**: a long notice period the planner can actually use, with payment for work performed to date.
- **Termination for cause**: material breach with a cure period — commonly 10 days, shorter where safety or payment is at issue.
- **Insolvency** termination, with the practical note that it is largely decorative against a failing counterparty. It matters for the paper trail, not the outcome.
- **Force majeure**: defined events, a notice duty, a mitigation duty, and a termination right after a long-stop period.
- **Change control**: priced change orders in writing before work. The clause should state that undocumented verbal changes are not billable — and should mean it.

## Clause comparison by vendor category

What matters most differs by category. Weight the review accordingly.

| Vendor category | Terms that decide cost | Terms that decide risk | Watch for |
| --- | --- | --- | --- |
| Venue / facility | Minimum spend, attrition, overtime and access-hour charges, exclusivity | Occupancy and safety obligations, damage liability, insurance | Minimum spend defined per day vs per event; exclusivity blocking parallel events |
| Caterer | Per-plate price, service charge, minimums, corkage | Food safety responsibility, allergen handling, substitution approval | Service charge and admin fee stacked; bar minimum uncapped |
| AV / production | Equipment list, crew hours, overtime, power and rigging | Technical failure, crew safety, damage liability | "Equipment" listed by category not model; rigging excluded |
| Rentals | Quantities, condition standard, loss and damage rates | Who owns and who replaces damaged stock | Damage charged at replacement value with no depreciation |
| Security / stewarding | Headcount, hours, posts, uniform standard | Authority to refuse entry, use of force limits, incident reporting | Unqualified supervisors; no refusal-of-service protocol |
| Medical / first aid | Coverage level, practitioner credentials | Scope of care limits, escalation to emergency services | Coverage by phone only; unqualified cover |
| Transport | Vehicle type, capacity, licensing, accessibility | Driver hours, insurance, passenger liability | Unlicensed subcontracted vehicles; no accessible vehicle |
| Décor / florals | Scope, substitutions, timing, damage to venue | Installation safety, rigging from décor | Fresh flowers causing an allergen or fragrance issue |

## Tax and reporting

Vendors paid for services are typically reported on an information return — in the US, Form 1099-NEC for non-employee compensation, with thresholds set by the tax authority and a payee identification form (W-9) collected before the first payment. Aggregate payments per payee per year, not per invoice.

- Collect the payee identification form at contract signature, not at first invoice.
- Track aggregate annual payments per vendor so year-end reporting is a query, not a project.
- Exempt entities supply their own documentation; record it so the file explains itself.
- Cross-border vendors carry withholding and treaty questions that require professional advice before, not after, the first payment.

## Red flags that stop the signature

- No limitations of liability anywhere in the agreement.
- Indemnity running only in one direction.
- Cancellation rights only in the vendor's favour.
- Payment required on signature with no acceptance or milestone.
- Scope written as a category rather than an itemised list.
- No insurance requirements, or certificates due after the event.
- Governing law and forum in a jurisdiction with no realistic enforcement path.
- Unilateral amendment rights reserved to the vendor.
- Signature block pre-dated, or the agreement circulated as an unsigned PDF with terms "deemed accepted by performance".
- Personal guarantee or joint-and-several obligation from an individual without a defined cap.

## Negotiation process

1. **Paper first.** Get the vendor's form before negotiating anything; a clause absent from their form is a clause you have to win, not one you have to move.
2. **Mark up against the table above**, weighted to the vendor's category.
3. **Trade, do not just demand.** Payment terms and notice periods are the usual currency; liability and insurance are usually not negotiable for good reason.
4. **Escalate anything safety-adjacent.** Do not accept a safety obligation traded away for price.
5. **Version discipline.** One file, one version number, one place to store it. Superseded versions are archived, never edited.
6. **Record the approvals** in the configured approval workflow before any deposit or purchase order is released.

## Configuring this

The market-position defaults above — payment terms, deposit percentages, cancellation ladder percentages, insurance limits — are starting points, and every one of them is negotiated per vendor and per engagement. The operator sets the house position through the vendor tool's persisted configuration: `defaultTerms` for payment and deposit norms, `contractTemplates` keyed by vendor type, `approvalWorkflows` for who may release a deposit or a payment, and `paymentProviders` for the processors through which funds move. Individual contracts are recorded through the `vendorData` and `contractData` inputs, with `contractId` required, and any contract that reaches the legal review path is picked up by the legal assistant's clause-risk sweep. Nothing here is legal advice; vendor terms should be reviewed by qualified counsel for the governing jurisdiction.