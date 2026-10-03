# Brand Positioning Rules

How the marketing assistant keeps a campaign talking about the same thing the product is. The `plan-campaign` skill records a campaign's `product`, `budget`, `channels`, `timeline`, and `kpis`; `marketing-analysis-user` dispatches work to the content, social, email, SEO, market-research, audience-insights, and document-management channels; `marketing-audience-insights` supplies the segment and response signal. Positioning is the constraint that sits across all of them, and this handbook sets out the rules the generated creative and copy have to satisfy.

## What positioning is

Positioning answers one question: **relative to the alternatives a buyer is actually considering, why choose this?** Not what the product does — that is a feature list, and every competitor's feature list looks identical. The output is a sentence of the form:

> For **[segment]** who **[need or job]**, **[product]** is the **[category]** that **[benefit]**, unlike **[alternative]**, which **[trade-off]**.

If the sentence has no "unlike" clause, it is not positioning. It is a claim.

## The five components

| Component | The question it answers | Failure mode when missing |
| --- | --- | --- |
| Target segment | Who is this for, specifically enough to exclude someone? | "Everyone" — creative that resonates with no one in particular |
| Frame of reference / category | What do they compare you to? | Category confusion; the buyer files you wrongly and never revisits |
| Point of difference | What is true, provable, and not true of the alternatives? | Feature parity dressed as a differentiator |
| Benefit | So what does the buyer get? | Features without consequence |
| Reason to believe | Why should they trust that claim? | Unsubstantiated superlatives that the market has learned to discount |

Two of these are load-bearing and usually the weakest. **Point of difference** is what the competition cannot copy this quarter. **Reason to believe** is what stops the point of difference from reading as marketing copy — a benchmark, a guarantee, a certification, a data point, a named customer.

## The claim ladder

Every claim sits on a rung, and creative must stay on the rung it can defend.

1. **Category membership** — "a project management tool for clinical research teams." Always safe, never differentiating.
2. **Attribute** — "supports validated GxP workflows." True, checkable, and largely copyable.
3. **Benefit** — "so audit preparation takes days rather than weeks." The level at which most buying committees actually engage.
4. **Value** — "so your team spends its week on trial subjects instead of paperwork." The level at which budgets get approved.

Do not ask creative to climb past the rung the product can support. A claim at rung 4 with rung 2 evidence is the single most common cause of a sales objection that no amount of downstream content can fix.

## Message hierarchy

One positioning statement, three to five pillars, proof per pillar. Pillars are the only messages that appear in paid, and everything else routes to one of them.

- **Pillar** — a benefit statement, four to seven words, the thing a buyer would repeat to a colleague.
- **Proof** — the reason to believe for that pillar. One artefact, not a paragraph.
- **Audience translation** — how the pillar is phrased for each segment. Same pillar, different entry point.
- **Channel translation** — how the pillar is expressed per channel. Email gets the problem and the proof; social gets the problem and the tension; search gets the literal keyword and the attribute; the landing page carries the full hierarchy.

The test: a prospect who sees only a social post, then only an email, then only the landing page, should recognise one product with one promise. If the three read like three different companies from the same category, positioning has been lost somewhere in translation.

## Voice and claim discipline

These are hard rules for anything the assistant generates across the content, social, email, and SEO channels.

- **Never state a comparative claim without a named, checkable basis.** "Faster" needs a benchmark and a method; "cheaper" needs a pricing comparison at a stated scale. An unbaselined comparison is a compliance exposure, not a weak message.
- **No unsubstantiated superlatives.** "Best", "leading", "only" require a citation the assistant can point at. If it cannot, cut the word rather than the claim.
- **No claim about a competitor you would not say to their face.** Competitive copy is legal exposure with a logo attached.
- **Match the tone the operator selected.** `response` tone and channel conventions are inputs; the positioning is not a licence to change register per channel.
- **Accessibility is a positioning constraint, not a compliance afterthought.** Every asset must carry alt text, caption, or transcript; the "content-generation" and "social-media" channels are where this most often gets skipped.
- **One CTA per asset.** The campaign's `kpis` describe what success looks like; a post with two calls to action reports against neither.

## Segment discipline

`marketing-audience-insights` takes `audienceId`, `demographics`, `behaviors`, `campaign`, and `dateRange`, and its configuration carries `defaultSegment`, `segmentationModels`, `behaviorPredictors`, `privacyControls`, and `enrichmentSources`. Those inputs decide who the message is for.

- **A segment that cannot be excluded is not a segment.** If everyone qualifies, you have a market, not a target.
- **Do not stack protected attributes into targeting without a lawful basis.** The `privacyControls` configuration is the operator's declaration of that basis; the assistant should not infer one.
- **One positioning per segment, one primary segment per campaign.** Secondary segments get a variant pillar, never a blended message.
- **Response signals beat demographics.** Behaviors and observed campaign response outrank inferred attributes for both copy and spend allocation.

## Competitive and market context

`marketing-market-research` accepts `query`, `market`, `competitors[]`, `dateRange`, and `filters`. Use it to keep the "unlike" clause current, not to build attack copy.

- **Re-verify the frame of reference quarterly.** The alternative a buyer compares against changes as the market consolidates.
- **Update the point of difference before a competitor ships it.** A differentiator with a two-week half-life is a launch, not a position.
- **Record the source and date for every claim.** Positioning is a decision record; a claim nobody can trace is a rumour that will outlive the person who made it.

## Anti-patterns

- **Feature soup** — the pillar is a list of capabilities. Nothing to remember.
- **Category drift** — the same product described as a platform, a tool, and a service across channels.
- **Segment laundering** — the enterprise message with a startup headline.
- **Proof inflation** — one customer quote stretched into a general claim.
- **Positioning by committee** — five pillars because five stakeholders asked for one. Three is a working maximum; fewer is better.
- **Rewriting positioning per campaign** — if each campaign needs its own positioning, you do not have positioning, you have a slogan.

## Testing a positioning statement

A positioning statement that survives scrutiny passes five checks. Run them before any creative is commissioned.

1. **Exclusion test** — name a real account or segment it excludes. If nobody is excluded, it is a market description.
2. **Substitution test** — swap in a competitor's name. If the sentence still reads true, it is not positioning; it is a category description everyone agrees with.
3. **Evidence test** — can you point at the artefact supporting the reason to believe? Benchmark, certification, contract, published number, named customer.
4. **Loss test** — ask the buyer what they lose by choosing the alternative. If the answer is "nothing", the point of difference is not one.
5. **Recall test** — can three people in three functions state the promise without consulting the document? If not, the document is too long or there are too many pillars.

An example, for a clinical trial data product:

> For CROs running multi-site Phase II trials, [product] is the trial data platform that validates eCRF submissions as they are entered, so monitoring visits start with clean data instead of a reconciliation project. Unlike general-purpose warehouse tools, which require a data team to build and maintain the validation, it ships the checks already configured for regulatory submission.

The "unlike" clause is doing the work. Both the "so that" and the contrast are specific, falsifiable, and name a buyer who would immediately recognise themselves. Strip the contrast clause and it collapses into every other vendor's homepage.

## The messaging house

Positioning lives at the top of a hierarchy that everything else descends from:

- **Roof** — the positioning statement. One sentence, signed off by whoever owns the budget.
- **Pillars** — three to five benefit statements. Each maps to a pillar of the positioning sentence's "benefit" clause.
- **Proofs** — one artefact per pillar. A number, a certification, a case study, a screenshot.
- **Bricks** — the feature-level claims that support each proof. Specific, verifiable, and boring on purpose.
- **Tone** — three adjectives and three anti-adjectives. The anti-list matters more; it is what stops the house drifting every quarter.

Every asset any channel produces should be traceable to a pillar, a pillar to a proof, and a proof to the positioning statement. An asset that traces to none of them is off-message and should not ship, no matter how well it performs.

## Pricing and packaging as positioning

Pricing is a positioning statement the buyer reads without your involvement. Three ways it asserts a position:

- **Value metric** — what you charge for. Seat-based asserts you sell software licences; consumption-based asserts you sell outcomes. They attract different buyers and produce different expansion dynamics.
- **Price point** — a price materially above the category signals premium; materially below signals a different buyer or a different business model. Being the cheapest is a position, and it is the hardest one to hold.
- **Packaging** — what is bundled at each tier tells a buyer which capabilities you consider core. Excluding a capability that every competitor includes sends a message about your quality standards.

If the positioning says "premium rigor" and the entry tier is the cheapest on the market, one of the two is wrong, and no amount of copy will resolve it.

## Channel-by-channel translation

The same pillar, four expressions. The claim is identical; only the entry point changes.

| Channel | Entry point | Proof form | What to omit |
| --- | --- | --- | --- |
| Paid social | The tension the buyer already feels | One number | Any explanation of how the product works |
| Email | The named problem in the reader's own vocabulary | Short case | Feature detail |
| Search | The literal keyword the buyer typed | The attribute | Aspirational language entirely |
| Landing page | The full hierarchy, top to bottom | Everything, in order | Nothing — this is the one place the whole structure appears |
| SEO content | The question behind the keyword | Depth | Product language; nobody arrived to buy |
| Sales deck | The objection just raised | The proof for that objection | The full feature list |

The failure this prevents is the common one where the landing page reads like a brochure and the social post reads like the landing page. They are different media with different jobs.

## Configuring this

The claims discipline above, the message hierarchy, the ladder, and the anti-patterns are conventions, not code: no skill in the marketing assistant validates a generated asset against them today, which is exactly why they are written down. The operator-controlled knobs are the ones visible in the assistant's configuration — `plan-campaign`'s `channels` and `budget`, the audience-insights `defaultSegment`, `segmentationModels`, and `privacyControls`, the research `providers` and `defaultMarkets`, and the `reportTemplates` and `reportCadence` on the scheduled report, which requires `campaignIds` before it will run. Pin the segment list, the approved claim list with sources and expiry dates, and the pillar-to-channel translation map in the assistant's persisted configuration; treat anything the assistant generates that is not traceable to a pinned pillar as a draft for review rather than a publishable asset.
