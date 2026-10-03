# Tax-Efficient Withdrawal Methodology for Drawdown, Rebalancing and Endgame

This handbook describes the method the Wealth Management & Personal Portfolio Assistant follows when a caller asks about withdrawal order, tax-aware rebalancing, required distributions, charitable giving, withdrawal rates or retirement readiness. It is a methodology, not personalised advice: tax outcomes depend on jurisdiction, filing status, account types, other income, state of residence and a set of rules that change, and a qualified tax adviser or certified financial planner governs every real decision. Where the Assistant is asked for an estimate, it returns the caller's own figures and nothing else, because a number it inferred would carry authority it does not have.

That contract is visible in the code. The `research-planning` Skill's `tax-optimization`, `estate-analysis`, `retirement-readiness` and `goal-tracking` actions return `strategies`, `estimatedSavings`, `estateTaxExposure`, `readinessScore`, `gap`, `recommendations` and `goals` exactly as supplied, each with a notice stating that no tax, estate or planning provider is connected and that nothing was inferred. The methods below are what a qualified practitioner applies; they are the checklist those supplied figures are supposed to be checked against.

## Scope and standing rules

- **Jurisdiction first.** Nothing below transfers across borders. US federal rules below do not apply to a UK ISA, a Canadian TFSA, an Australian superannuation account, or a eurozone country with its own wealth tax and deemed-disposal rules.
- **A qualified adviser governs.** A tax adviser or CFP who knows the client's full return position is required. The ordering logic here is a checklist for that conversation, not a substitute for it.
- **Position, not rate, is the lever.** In most jurisdictions the marginal rate a dollar of income passes through is set by the account it is withdrawn from. Choosing which account a dollar leaves is worth more than micro-optimising the timing of the withdrawal by months.
- **Do not treat tax as a return.** The after-tax return on a tax-deferred dollar is lower than the pre-tax return, always. A tax deferral is a loan at the tax rate, and it is only a gain if the loan is repaid by a lower rate later.

## Account types and their tax character

| Account | Pre-tax or post-tax contributions | Growth | Qualified distributions | Withdrawal | Key limits |
| --- | --- | --- | --- | --- | --- |
| Traditional 401(k) / 403(b) | pre-tax (Roth 401(k) is post-tax) | tax-deferred | yes | ordinary income, fully taxable | annual additions cap; catch-up from age 50; 10-year rule for 401(k)→IRA conversions |
| Traditional IRA | pre-tax | tax-deferred | yes | ordinary income, fully taxable | annual cap, phased out for high earners with a workplace plan |
| Roth IRA | post-tax | tax-free | none | **tax-free**, no RMD | income cap; backdoor conversion for high earners; 5-year rule on conversions |
| HSA | post-tax (often pre-tax via payroll) | tax-free | none | tax-free if 65+ and non-medical; taxable as ordinary income before 65 if not | high-deductible family HDHP; 3-month contribution-deadline carry-forward rule |
| 529 plan | post-tax | tax-deferred | qualified education expenses tax-free | non-qualified use: earnings taxable as ordinary income plus 10% penalty | beneficiary and qualified-expense restrictions; 5-year rule per contribution |
| Taxable brokerage | post-tax | realised gains deferred until sale | not applicable | long-term and short-term capital gains treatment | §1091 wash sale, holding period, state tax |

The structural fact that makes the whole ordering problem tractable: in nearly every structure, **the taxable account holds the lowest-cost capital, and the tax-deferred account the most expensive.** Selling in the taxable account realises gain at a preferential rate or realises a loss that shelters income from a higher bracket. Drawing from the tax-deferred account converts tax-deferred dollars into fully ordinary dollars and leaves the low-basis dollars invested, where they keep compounding. So the tax-deferred and Roth accounts are exhausted before the taxable account is sold, in almost every case.

## The five levers, in the order they are usually applied

**1. Satisfy the required distribution first.** Required minimum distributions are not optional income; they are income, and they set the top of the marginal bracket for everything else in the year. Optimising anything else before the RMD is computed is optimising the wrong variable. The RMD amount is therefore step one of any withdrawal analysis.

**2. Fill the lowest bracket that is already open.** A large standard deduction and a wide 0% capital-gains bracket mean a given amount of income can be raised at effectively no additional tax. The target is to keep taxable income inside those thresholds rather than to minimise the nominal withdrawal. This is a *bracket* decision and it is usually worth more than any account-level choice.

**3. Order the withdrawal sources: taxable, then tax-deferred, then Roth.** The lowest marginal rate is normally the long-term capital-gains rate, then the qualified-dividend and ordinary-income rate on the taxable account, and last the ordinary-income rate on a tax-deferred balance. Note the standard exception: a high-income year can invert the first two, so when a year is already taxed at high ordinary rates, a long-term gain may be preferable to a dividend.

**4. Realise losses against whatever is at the top of the bracket.** Tax-loss harvesting is a *bracket* tool, not a return-enhancement tool. A £1,000 loss offsets income at the marginal rate, so a harvested loss in a 40% bracket is worth roughly £400 of tax saved while the same loss in a 12% bracket is worth about £120. A loss harvested against ordinary income in a lower-income year, to be carried forward into a higher-income year, is often better than a loss harvested immediately.

**5. Use the tax-free buckets and the charitable path.** Qualified HSA, Roth and 529 distributions carry no income tax. A qualified charitable distribution satisfies the RMD up to the amount donated, is excluded from income, and is not deductible if the standard deduction is taken (or is deductible to the extent it exceeds the itemised floor).

## Required minimum distributions

The RMD age was raised to **75** by SECURE 2.0 (it was 73 under the original SECURE Act; it remains 73 for those born 1951–1959), and Roth IRA RMDs were eliminated entirely from 2024. The rules are US-specific and are changing.

**Calculating the amount.** RMD = the account balance at the end of the prior calendar year divided by the applicable life-expectancy divisor from the Uniform Lifetime Table (the IRS publishes the full table annually). Two adjustments: a qualified charitable distribution satisfies the RMD up to the amount contributed, and an inherited IRA is subject to the 10-year rule under the original SECURE Act, removed for non-spousal beneficiaries by SECURE Act 2.0 for decedents dying from 2024.

**Withholding.** Distributions from a traditional 401(k) or IRA are subject to 10% federal withholding, plus an additional 10% when the rate reaches the top marginal bracket, plus withholding for the portion above 125% of the top rate unless the payee certifies. Roth distributions are not subject to withholding. Withholding is a credit against the tax due, not the tax, and the rate is provisional: the payee can be asked to calculate the actual expected liability to reduce the over-withholding, and that election should be made for large balances.

**Deferral across years is a rate bet.** Delaying a distribution into a lower-income year (retirement, a severance year, a year of reduced earned income, a year with a large capital loss) is worth doing when the current rate exceeds the expected rate at the RMD age. It is worth less when the current rate is low, and the breakeven point is roughly the difference in the two rates over the deferral period. It is not worth doing if the deferral merely moves a large distribution to a later year in which the rate is expected to be the same or higher.

## Loss harvesting and the wash sale

§1091 disallows a loss when a substantially identical security is bought within 30 days before or after the sale. The rules an implementation must honour:

- **The window spans all accounts, including IRAs.** A loss harvested in a taxable account against a purchase in an IRA is fully disallowed. This catches most self-directed accounts, because the IRA purchase is often made automatically.
- **Substantially identical is a question of fact.** Options on the same underlying, and convertible securities, are commonly but not automatically treated as substantially identical.
- **Replacement shares in the same security defer the loss rather than permanently disallow it.** The disallowed amount is added to the basis of the replacement shares, so the loss is held, not destroyed. Broadening the replacement to a similar but not substantially identical security is the standard remedy, and it carries tracking risk.
- **Basis is now reported.** Brokerages report covered securities on Form 1099-B, and where a wash sale is triggered the basis adjustment is shown on the form rather than having to be reconstructed. The deferral can run indefinitely: the basis adjustment carries to the replacement and to its replacement.
- **The economic point.** A wash sale is not a tax cost — the net unrealised loss is deferred, not lost — but it is a *liquidity and tracking* cost, because the investor now holds something other than what the thesis was about. That is a real cost and it is the reason for the substitution rule.

Harvesting only against the top of the bracket, and only losses that are genuinely thesis-driven, is the discipline. Selling for a tax reason rather than an investment reason is a different decision and needs its own case.

## Withdrawal rates

**The 4% rule.** Originating with Bengen's work on 1950s–1990s US data, 4% of the initial real portfolio balance, withdrawn annually and adjusted for inflation, sustained over 30 years. The underlying finding was a 95% or better historical success rate. Three criticisms dominate: the sample contained a single exceptionally favourable equity market, the 30-year horizon is a test that has not yet run for anyone now retiring, and the plan fails outright if the sequence of the first returns is adverse.

**The Trinity study and its successors.** Extended the data across countries and rolling 30-year windows, and quantified the failure rate as a function of the withdrawal rate. A 3.5% rate materially reduces the historical failure probability, at the cost of a materially lower starting spending level for a given portfolio. Retrospectively rebalanced portfolios also performed well; portfolios never rebalanced did not.

**The honest modern position.** No single rule is sufficient. The best practice is a guardrails framework — Guyton–Klinger is the canonical reference:

```
1. Set a target initial withdrawal rate
2. Set a lower guardrail (a spending floor) and an upper guardrail (a spending cap)
3. Allow withdrawal rate adjustments only when the portfolio has crossed a guardrail
4. Adjust by a small increment, with a hard band limit per year
5. Give every increase and every decrease a finite time window
```

This converts a fixed rule into a rule that responds to realised portfolio performance, which is the property the fixed rule lacks. A cap-plus-up (Schwerg) variant adds an inflation floor so the real spending never falls, at the cost of a higher failure probability.

**The 4% figure is pre-tax on a pre-tax account.** The most common error in retirement projections is applying a 4% withdrawal rate to a pre-tax portfolio and calling the result spendable income. In retirement most of the return is untaxed growth and the distribution is fully taxable, so a 4% rule on a traditional-heavy portfolio typically delivers an after-tax income materially below a 4% rule on a Roth-heavy one. Two portfolios with identical pre-tax cash flows can differ by tens of percent in after-tax spending capacity. The comparison must be made on after-tax, after-fee numbers, and it must account for state income tax, the NIIT at 3.8% above the applicable MAGI thresholds, the ACA premium-tax interaction, Social Security taxation and Medicare IRMAA premium surcharges triggered by higher taxable income.

**Sequence-of-returns risk.** The `create-plan` action projects `portfolioValue = assets · (1 + marketReturn − inflationRate)^years` and `annualIncome = portfolioValue · withdrawalRate`. That compound form treats a single real rate as though it were known and constant, which is the assumption the Trinity work exists to break. The real-return distribution has a left tail, and the first decade dominates whether the plan works. An implementation that wants to be honest replaces the single rate with a simulation over a real-return distribution, and reports a success probability alongside the projection rather than a point value.

## A worked ordering framework

This is the sequence an adviser walks through. Bracketed fields are inputs the caller supplies; the framework names them, it does not populate them.

| Step | Question | Inputs | Output |
| --- | --- | --- | --- |
| 1 | Is there an unpaid RMD? | RMD age, prior year-end balances, life-expectancy divisor | RMD amount, and the withdrawal already satisfied by it |
| 2 | Where does the remaining need sit relative to the brackets? | standard deduction, filing status, LTCG and ordinary brackets, other income | target taxable income for the year |
| 3 | Is there a charitable intent? | annual indexed QCD limit, itemised deductions, appreciated-asset positions | QCD amount, satisfied-RMD amount, deduction treatment |
| 4 | Order the sources for the residual | taxable basis and holding period, deferred balances, Roth balances, state tax | per-account withdrawal schedule |
| 5 | Is there a loss to harvest? | unrealised losses, replacement eligibility across all accounts, current top bracket | realised loss, replacement securities, basis adjustments |
| 6 | Does the rebalance cross a taxable sale? | drift, threshold, asset location, ticket size, minimum tax lot | trade or no-trade, with the new-cash alternative preferred |
| 7 | Reforecast | success probability, inflation, horizon, sequence sensitivity | readiness score, funding gap, ranked sensitivities |

Step 6 has a rule that is worth more than every other step combined for a taxable investor: **rebalance with new money first.** Contributions and Roth conversions can be directed to under-weight sleeves with no realisation at all. Only after the cash-flow lever is exhausted is a sale justified, and then the sale belongs in the account where the asset and the loss belong.

## Endgame: when the tax-deferred balance runs out

The last third of retirement is where the ordering problem inverts, because the tax-deferred balance is large and the taxable balance is small and heavily appreciated. The common problems and the standard answers:

- **Sequence-of-returns risk with no recovery room.** A large loss in the first two years of a planned distribution sequence can be unrecoverable. The lever is the initial withdrawal rate and the size of the cash buffer built before the sequence starts.
- **A concentrated low-basis position.** A single high-basis-few-shares position can force a large realised gain. Leveraged or buffered options written against it, or a charitable transfer of the shares, can address the gain without a sale. Both carry costs and both are complex; both are conversations for an adviser.
- **A tontine or annuity bridge.** Delaying RMDs by purchasing a deferred annuity inside an IRA can defer the distribution and the tax on it, at the cost of surrendering the account balance to an insurer. It is a legitimate planning tool with a genuine counterparty, cost and illiquidity.
- **The 5-year rule on Roth conversions.** Each conversion has its own 5-year clock for the principal and a 5-year clock for the earnings; converting early and the conversion is recaptured. A conversion done once per year for a specific amount, tracked per lot, is the disciplined version.
- **Inherited accounts.** The 10-year rule, the eligible-rollover rules that stretch it, and the availability of the charitable remainder trust for a large balance. Estate and trust work is a specialist discipline, and `estate-analysis` returns only the caller's supplied `estateTaxExposure` and `recommendedActions`.

## What the Assistant can and cannot compute

It can compute, from caller-supplied values: the weighted composite ordering that ranks supplied strategies, the supplied `estimatedSavings`, the supplied `readinessScore` and `gap`, the compound projection and the resulting `annualIncome` at a supplied `withdrawalRate`, the drift between current holdings and supplied `targets` against a supplied `rebalanceThreshold`, the staged transfer amount `|driftPct| × totalValue`, and the list of obligations with a valid amount and a parseable due date.

It cannot compute, and returns nothing for: a marginal tax rate; a federal or state tax liability; an RMD; a long-term versus short-term holding period; a wash-sale exposure across accounts; a required minimum distribution table lookup; an account contribution-limit or phase-out calculation; an after-tax portfolio return; a Medigap or IRMAA premium; a Social Security benefit estimate; a capital-gains tax on a proposed trade; or anything requiring a return history it does not hold.

That boundary is the design, not a gap to be papered over. A number the Assistant infers would read as a computation; a number the caller supplies and the Assistant returns is traceable to whoever computed it. An adviser reviewing the output needs to know which is which, and the notices attached to every one of these actions say so.

## Configuring this

The rules, thresholds and defaults in this document are the shipped method, and the actual numbers always come from the caller. `research-planning` takes `strategies`, `estimatedSavings`, `estateTaxExposure`, `readinessScore`, `gap`, `recommendations`, `goals`, `clientProfile` and `assumptions` — including `inflationRate`, `marketReturn`, `retirementAge` and `withdrawalRate` — per call, and `bill-pay-rebalancing` takes `rebalanceThreshold` (default 0.05) and the `targets` map per call. An operator sets jurisdiction, default withdrawal rate, default RMD age, the charitable-giving limit, the minimum criteria for a rebalance to be staged, and any state-specific overlay in the persisted configuration of those Skills, so that the framing a client sees is bounded by the advisor's practice rather than by a general default. The single most consequential thing an operator can do is ensure the jurisdiction setting is correct before any of this is applied, because every rule in the document is jurisdiction-dependent and a 4% withdrawal rate, an RMD age and a wash-sale window have no meaning outside the framework they belong to.
