# US GAAP and IFRS: Recognition, Measurement and Reporting

This handbook is the reference for the Corporate Finance & FP&A Assistant when it assembles, cross-checks and reports financial figures. The Assistant's job is not to issue an accounting opinion; it is to apply the recognition and measurement rules below consistently, to surface the line items where the two frameworks diverge, and to refuse to call a set of derived totals compliant with either. `reporting-data-ops` is where most of this is exercised, through its section totals, its `net` and `netMargin`, its `basis` field and its data-quality cross-checks.

Nothing here is a substitute for the standard itself. The authoritative text is the FASB Accounting Standards Codification and the IFRS Accounting Standards as issued by the IASB, both of which are amended continuously. Cite the standard and the paragraph, and where the treatment is judgemental, say that it is.

## The two frameworks in one table

| Dimension | US GAAP | IFRS |
| --- | --- | --- |
| Philosophy | principles-based but increasingly rule-like, especially in revenue | principles-based |
| Conceptual anchor | FASB Concepts Statements | IASB Conceptual Framework (2010) |
| Fair value | pervasive in some areas, applied at instrument level | defined and used, historically more limited in scope |
| Rulebook structure | Codification, hierarchical, heavily referenced by ASC number | Standards and Interpretations, less granular |
| Who writes it | FASB, plus the SEC | IASB, plus national standard-setters who conform |
| Enforcement gate | SEC | national regulators; the SEC has equivalence designations for some issuers |
| Recent convergence | revenue (ASC 606) and leases (ASC 842) converged; long-lived assets, financial instruments and presentation have not | IFRS 15 and IFRS 16 matched their GAAP counterparts; IAS 38 and IAS 36 still diverge |

The two converged areas are where most of a day-to-day difference lives. The remaining differences are concentrated in long-lived asset accounting, financial instruments and impairment, and presentation.

## Revenue: ASC 606 and IFRS 15

Both standards use the same five-step core, and both replaced the previous transaction-specific guidance. A report that groups revenue into `revenue` and `income` sections without applying the five steps will overstate contract liabilities and understate deferred revenue, whichever framework is claimed.

1. **Identify the contract with the customer.** Enforceable rights and obligations, committed performance obligations, payment terms, commercial substance, probable collectability.
2. **Identify the performance obligations.** Each distinct good or service promised, at a granularity that lets the customer benefit separately.
3. **Determine the transaction price.** Variable consideration, significant financing components, non-cash consideration, expected price concessions.
4. **Allocate the price to the obligations.** Standalone selling price, generally estimated by adjusted market assessment, then relative allocation.
5. **Recognise revenue when, or as, the obligation is satisfied.** Over time if one of the three over-time criteria is met; otherwise at a point in time.

Points where the two genuinely differ:

- **Constraint on variable consideration.** IFRS 15 uses a "highly probable" threshold for constraining highly variable consideration such as sales-based royalties. ASC 606 uses a "possible plus a probable plus a reasonably possible" threshold for some royalty arrangements under the variable consideration constraint. A royalty that is unconstrained under one framework may be constrained under the other, and the effect is a revenue-recognition timing difference on the same economic arrangement.
- **Shipping and handling.** The default under ASC 606-10-55-18 is FOB shipping point, so control transfers when goods ship, unless the contract specifies otherwise. IFRS 15's control indicator is generally satisfied when the customer has the ability to direct the use of and obtain substantially all of the remaining benefits, which is often later than shipment for a consignment or a delivered-goods arrangement. Same contract, different period.
- **Contract costs.** Both capitalise costs of obtaining a contract that would not have been incurred had the contract not been obtained, with a practical expedient to expense them when the amortisation period is one year or less. The GAAP expedient threshold and the disclosure granularity differ slightly.
- **Principal versus agent.** Both use a three-indicator test (primary responsibility, inventory risk, discretion in establishing the price), and both require disclosure of the nature of the judgement.

Reporting consequence: a revenue section in a derived report is a *presentation* aggregate, not a recognition conclusion. Where the Assistant cannot see contract-level data, it should present the section total and say the recognition basis was not tested.

## Leases: ASC 842 and IFRS 16

Both standards eliminated the off-balance-sheet operating lease, which was the point of the project in each case. The models are similar and the presentation is not.

| Aspect | ASC 842 | IFRS 16 |
| --- | --- | --- |
| Lessee model | single model; but lessees classify as finance or operating lease | single model, no lessee classification |
| Balance sheet | right-of-use asset and lease liability for both types | right-of-use asset and lease liability for almost all leases |
| Income statement | operating leases: single straight-line operating expense. finance leases: interest plus amortisation | single straight-line expense for nearly all leases; short-term and low-value exempt |
| Remeasurement triggers | same set for both classes | same |
| Sale-and-leaseback | ASC 842-20-25-2: seller-lessee that has transferred substantially all of the asset is deemed a financial transaction unless the transfer is a sale under ASC 606 | IFRS 16, para. 99 onward; a sale exists only if substantially all of the FV is transferred |
| Lessor | sales-type, direct-financing and operating, retained | more strictly limited; most lessors are deemed to be financing lessors |
| Disclosure | tabular maturity analysis, weighted-average discount rate, weighted-average remaining term | similar tabular disclosure |

Measurement is the part that is genuinely shared:

```
Lease liability = PV of unpaid lease payments, discounted at
                  the rate implicit in the lease,
                  or the incremental borrowing rate if that rate cannot be readily determined
ROU asset       = lease liability  +  lease payments made at or before commencement
                               −  lease incentives received  −  initial direct costs  −  restoration provisions
```

Default lease term, in both frameworks: the non-cancellable period plus any extension the lessee is reasonably certain to take plus any termination option the lessee is reasonably certain to exercise. The optional-renewal judgement is the single largest source of restatement in lease accounting and the item to probe whenever a liability looks wrong.

The ASC 842 incremental borrowing rate is a rate reflecting the lessee's incremental borrowing rate for a borrowing of similar remaining lease term with similar credit characteristics; an entity may develop an adjustment using a risk-free rate for the currency and tenor plus a credit spread. IFRS 16 requires the same construct and calls it the incremental borrowing rate as well, with the difference that the "readily determinable" test for the implicit rate is applied on a similar basis.

Both frameworks exempt short-term leases (12 months or less with no purchase option) and, in substance, low-value assets. IASB has separately amended IFRS 16 to permit an election to not assess whether a lease contains an onerous non-lease component; the GAAP equivalent amendment followed. Where a report is built under the assumption that all lease costs are operating expense, that is an IFRS 16 presentation, not an ASC 842 operating-lease presentation, and the two are not comparable.

## Inventories

| | ASC 330 | IAS 2 |
| --- | --- | --- |
| Permitted cost formulas | FIFO or average cost; **LIFO prohibited** | FIFO or weighted average; **LIFO prohibited** |
| Lower of | cost and market | cost and net realisable value (NRV) |
| Market defined as | the higher of NRV and NRV less a normal profit margin | not applicable; NRV is an absolute floor |
| Write-down reversal | prohibited, subject to limited exceptions | permitted when reasons for the write-down no longer exist, capped at the original write-down |
| Inventory in a LIFO liquidation | must use the expected replacement cost of the inventory consumed | not applicable |

The write-down reversal asymmetry is the one that surprises people. Under IAS 2, a reversal is mandatory where the circumstances that caused the NRV write-down no longer exist, capped at the amount of the original write-down. Under ASC 330, reversal is prohibited. A group reporting on both bases has a real, uneliminated difference in the recovery of inventory value.

## Financial instruments and impairment

| | US GAAP | IFRS |
| --- | --- | --- |
| Standard | ASC 310-20, ASC 326 | IFRS 9 |
| Credit loss model | Current Expected Credit Losses (CECL), single-stage | Expected credit losses, three-stage: gross, net, and simplified lifetime for SICR |
| Basis of the estimate | a current, forward-looking estimate across the portfolio's contractual life | a probability-weighted, unbiased, forward-looking estimate |
| Impairment trigger | events or conditions, or updated expected losses | credit deterioration, or updated expected losses |
| Fair value option | elective, by instrument | elective, by instrument, with P&L changes |
| Equity in OCI | limited; no recycling for equity instruments designated FVOCI | recycling on disposal |
| Own-credit | excluded from fair value for financial liabilities under ASC 825-10-45 | own-credit changes in FVOCI, gain or loss to P&L |

The three-stage model in IFRS 9 and the single-stage CECL model in ASC 326 are the largest remaining reporting difference for financial institutions and for any business holding a material receivables book. They will not converge: CECL was deliberately built on a lifetime expected-loss basis from origination, which is closer to the IFRS 9 gross stage for performing assets but structurally different for credit-impaired ones.

Fair value hierarchy is common ground: ASC 820 and IFRS 13 both use three levels — Level 1 quoted prices in active markets for identical assets, Level 2 observable inputs other than Level 1, Level 3 unobservable inputs — and both require Level 3 valuations to be disclosed with a rollforward showing the change in value. Level 3 is where most of the fair-value measurement risk in a group reporting sits, and a derived report that presents a blended asset value has silently mixed levels.

Hedge accounting: ASC 815 is more prescriptive and more restrictive on non-financial-item and "under/over" hedging, and generally does not permit hedge accounting for a written option designated as a cash flow hedge. IFRS 9 relaxes both. The economics of a hedge are often the same under both; the P&L location is not.

## Long-lived assets, goodwill and impairment

| | US GAAP | IFRS |
| --- | --- | --- |
| Cost model | cost or revaluation, by asset class | cost or revaluation, by asset class; revaluation must be the whole class, not selected assets |
| Revaluation reserve | generally not required | equity, and recycled to P&L on disposal for the difference versus historical cost |
| Depreciation of an impaired asset | revised depreciable base | revised depreciable base |
| Goodwill impairment | optional annual test; reporting units, no reversal; private companies can elect a simplified test | annual test required; cash-generating units, no reversal; allocation to goodwill from 2021 reversed under IFRS 3 (amended) |
| Intangible impairment | finite-lived: single step; indefinite-lived: optional annual qualitative test | cash-generating units, single step, no reversal |
| Impairment loss allocation | goodwill first, then other assets | pro rata across all assets in the unit |

A summary table that reports "impairment" as a single line is meaningful under neither framework without stating which basis produced it.

## Presentation, cash flow and foreign currency

- **Statement of cash flows.** ASC 230 permits either the direct or the indirect method for operating activities. IAS 7 encourages the direct method, with an alternative indirect reconciliation required. Interest paid and received and taxes paid are separately disclosed as supplemental non-cash or supplemental information under both. A cash-flow report built by summing ledger lines without a reconciling indirect section is not compliant with either.
- **Classification of costs.** Both frameworks require functional or nature presentation to be used consistently, and IAS 1 is explicit that a mixed presentation is not acceptable. This is why `reporting-data-ops` keeps revenue and expense sections separate and never nets them: a mixed section is unreportable, not merely untidy.
- **Expenses as a separate statement.** IAS 1 requires a separate statement presenting profit or loss and other comprehensive income, and permits expenses to be presented in the notes or in that statement. ASC 720 permits an entity to present expenses either in a single statement or in the notes. The two look different on the page and reconcile to the same total.
- **Earnings per share.** ASC 260 and IAS 33 are substantially converged: basic EPS on weighted-average ordinary shares, diluted EPS including dilutive potential ordinary shares, with the treasury stock and if-converted methods for the reconciling share count. Continuing-operations presentation after a discontinued operation is required under both (ASC 205-20, IFRS 5).
- **Non-GAAP measures.** SEC Regulation G and Item 10(e) of Regulation S-K govern the presentation and equalisation of non-GAAP financial measures: the most directly comparable GAAP measure must be presented alongside, the reconciliation must be provided, and the measure may not be presented more prominently than the GAAP measure. IFRS does not have an equivalent, so a group that publishes a "adjusted EBITDA" for both audiences needs two compliance analyses of the same number.
- **Foreign currency.** ASC 830 and IAS 21 both distinguish functional currency (IASB's "functional" and "presentation" currencies; FASB's "foreign currency" and "reporting currency") from transaction measurement. The major difference is the treatment of a subsidiary whose functional currency differs from the parent's: under ASC 830, translating results uses the average rate for the period and equity uses historical rates, with translation differences in other comprehensive income; under IAS 21, the same mechanics apply, but the reporting-currency translation method is more tightly specified and a persistent difference on remeasurement of a subsidiary can push the exchange difference to goodwill rather than to CTA.

## Applying the frameworks in a derived report

`reporting-data-ops` produces `sections`, `totals.revenue`, `totals.expense`, `totals.net`, `totals.netMargin`, `totals.unattributed`, `dataQuality.revenueDisagreement` and `dataQuality.expenseDisagreement`. Read them as follows.

- `net = revenue − expense` is arithmetic, not recognition. It is a derived aggregate over whatever sections were supplied. It is not a subtotal under ASC 606 or IFRS 15, it does not reflect consolidation, and it excludes every item the caller did not put in a revenue or expense section.
- `totals.unattributed` and `dataQuality.unattributedSections` are the control. A section outside the revenue and expense vocabularies (`revenue`, `income`, `cost`, `expense`, `opex`, `cogs`) is a sign that the section-to-statement mapping failed upstream. A non-zero unattributed total must be resolved or explained before the report is circulated, because the net figure silently excludes it.
- `revenueDisagreement` and `expenseDisagreement` compare stated totals against the sum of the lines, at a tolerance of 0.005 in the reporting currency. A disagreement is a data-quality failure in the source, not a rounding artifact worth suppressing: the derived figures in the report are the ones that are arithmetically supported.
- `basis` is `accrual` or `cash` and is reported alongside the figures. The same underlying transactions produce different revenue, different receivables and different net income under the two bases, and a figure carrying no basis label is unusable.
- `currency` defaults to `USD` and is a presentation-currency label. Multi-currency input must already be translated under ASC 830 or IAS 21 before it reaches this stage; the Skill does no translation.
- No output of this Assistant is a statement of GAAP or IFRS compliance. Compliance is asserted by a licensed accountant or an auditor against a full trial balance with the disclosures attached, and a report assembled from caller-supplied lines carries no assertion at all.

## Configuring this

The framework choice and its consequences are the operator's, not the runtime's. `reporting-data-ops` takes `basis` (default `accrual`), `currency` (default `USD`), `reportType` (default `profit-and-loss`) and the line vocabulary per call, and takes `defaultReportType`, `channel`, `system`, `confirmBeforeSend` and `defaultDryRun` from its persisted Skill configuration. The 0.005 cross-check tolerance and the revenue and expense section vocabularies are shipped defaults that an operator overrides in that same configuration when the ERP uses a different chart-of-accounts naming scheme. When the entity reports under both frameworks, the operator configures two separately-scoped Skill configurations rather than one blended one, because the section mapping, the de-vig-equivalent normalisations and the required disclosures differ between them. The rules in this document are the ones the Assistant applies by default; which framework governs a given report is a fact about the entity, and it is supplied in configuration.
