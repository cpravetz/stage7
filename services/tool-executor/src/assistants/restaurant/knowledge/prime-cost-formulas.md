# Prime Cost and Restaurant Unit Economics

Prime cost is the number that tells you whether a restaurant makes money. Food plus labour is nearly all of the cost you can control week to week; rent, utilities and marketing are fixed and do not change because Tuesday was slow. This handbook defines the cost vocabulary the restaurant workflow computes, writes the formulas out in full, and gives a worked example so the same inputs always produce the same answer.

## The core formula set

```
foodCostPct        = foodCost / netSales × 100
beverageCostPct    = beverageCost / netSales × 100
primeCost          = foodCost + labourCost
primeCostPct       = primeCost / netSales × 100
contributionMargin = netSales − primeCost
contributionPct    = contributionMargin / netSales × 100
grossProfitPct     = (netSales − foodCost) / netSales × 100
netProfitPct       = netProfit / netSales × 100
breakEvenCovers    = fixedCosts / contributionPerCover
```

Definitions matter more than the arithmetic:

- **Net sales** is revenue after discounts, comps and voids, before tax and before gratuity. Tax collected on behalf of a government is not revenue; gratuity collected and paid to staff is not revenue. Taxing gross instead of net is the single most common error in an operator's food-cost percentage.
- **Food cost** is the cost of ingredients used, including waste, prep loss, spoilage and overproduction. It is the cost of goods sold from the inventory system, not the cost of purchases, which is a cash and ordering measure.
- **Labour cost** is wages plus employer burden — payroll tax, benefits, holiday pay, agency and labour-management fees — for every hour worked, including training and meetings.
- **Fixed costs** are rent, lease, utilities, insurance, licences, depreciation, marketing and salaried management.

## Prime cost, stated properly

```
primeCostPct = (foodCostPct + labourPct)
```

Prime cost is the cleanest single indicator of operating discipline because it needs no allocation decisions. Where an operator reports a target, it is usually quoted as a percentage of net sales and will vary by service model:

| Service model | Commonly cited prime cost target | Context |
| --- | --- | --- |
| Quick service / fast casual | 50–60% | Low labour, high volume, tight menu |
| Fast casual / casual dining | 55–65% | More prep and service labour |
| Full-service casual dining | 60–68% | Plated service, more touches |
| Fine dining | 65–75% | Higher food specs, more labour |
| Bar-led / pub | 50–60% of net sales | Usually paired with a beverage cost target of 20–28% |

These are ranges used as a starting point for a conversation about performance, not targets to be enforced universally. A $18-a-head fast-casual unit and a $140-a-head tasting menu are not comparable on this measure, and neither is a unit with $400 a week of rent and one with $40,000. Always state the target alongside the model, the rent line and the average cheque.

The workflow reports prime cost directly: the forecast evaluator computes `primeCost = cogs + laborCost` and `grossMargin = (revenue − cogs) / revenue × 100` on every run, so a report that omits them is a report that skipped the calculation.

## A worked example

A full-service unit, one trading week, from the figures an operator would actually pull from the POS and the payroll provider:

| Line | Amount |
| --- | --- |
| Covers | 1,400 |
| Net sales (after discounts and comps) | $42,000 |
| Food cost (COGS) | $13,860 |
| Labour cost (wages + burden) | $12,600 |
| Beverage cost | $3,150 |
| Other operating costs | $4,800 |
| Occupancy and fixed overhead | $7,700 |
| Net profit | $(210) |

Derived:

```
foodCostPct     = 13,860 / 42,000 × 100 = 33.0%
primeCost       = 13,860 + 12,600      = 26,460
primeCostPct    = 26,460 / 42,000 × 100 = 63.0%
grossMarginPct  = (42,000 − 13,860) / 42,000 × 100 = 67.0%
contribution    = 42,000 − 26,460      = 15,540
contributionPct = 15,540 / 42,000 × 100 = 37.0%
```

The headline is a 63% prime cost on a 63% margin — textbook healthy, and the restaurant is still losing money, because fixed costs consume the entire contribution. This is the most useful lesson in the formula set: prime cost is a discipline measure, not a profit measure.

## Cost per cover

Cost per cover is how a kitchen actually plans, because it scales with guests rather than with the trading day.

```
costPerCover           = netSales / covers
foodCostPerCover       = foodCost / covers
labourCostPerCover     = labourCost / covers
primeCostPerCover      = primeCost / covers
primeCostPerCoverPct   = primeCostPerCover / costPerCover × 100
contributionPerCover   = netSales / covers − primeCost / covers
```

Cost per cover must be read alongside average cheque. The same $4.20 prime cost per cover is comfortable at a $32 average cheque and fatal at $14.

| Metric | Value in the worked example |
| --- | --- |
| Average cheque | $30.00 |
| Cost per cover | $30.00 |
| Food cost per cover | $9.90 |
| Labour cost per cover | $9.00 |
| Prime cost per cover | $18.90 |
| Prime cost per cover % | 63.0% |
| Contribution per cover | $11.10 |

Target setting runs in the other direction. Fix the average cheque, fix the target prime cost percentage, and the target cost per cover follows:

```
targetPrimeCostPerCover = averageCheque × targetPrimeCostPct
```

## Theoretical versus actual food cost

- **Theoretical (ideal) food cost** is the cost of the recipe quantities actually sold, at current purchase prices.
- **Actual food cost** is cost of goods sold from the books.

```
foodCostVariance = actualFoodCostPct − theoreticalFoodCostPct
```

A positive variance is the number the kitchen is accountable for. Its components are individually diagnosable: yield loss from butchery and trimming, overproduction and trim waste, spoilage and waste log entries, voids and comps, theft and count error, and recipe drift — the dish changed and the cost card did not. Track waste reasons by category; a single "waste" line teaches nothing.

## Beverage cost and the bar

```
beverageCostPct  = beverageCost / beverageSales × 100
pourCost        = ouncesInBottle × pricePerBottle ÷ ouncesPerPour
pourCostPct     = pourCost / pourPrice × 100
theoreticalYieldPct = actualAmountPoured ÷ standardPourSize × 100
```

Pour cost percentage and theoretical yield are where beverage cost is actually controlled, and both are staff behaviours rather than purchasing outcomes. Track free pours, short pours and wine corkage separately.

## Labour cost and coverage

```
labourCostPct = labourCost / netSales × 100
scheduledHoursRequired = forecastCovers × staffPerCover
scheduledHoursCost     = scheduledHours × averageHourlyCost
staffToCoverRatio      = requiredStaff / forecastCovers
```

The shift prep workflow takes `staffPerCover` as an input, defaulting to a commonly cited 0.2 (one scheduled team member per five covers), and `serviceDuration` defaulting to 90 minutes. Both are planning assumptions that vary enormously by service style: a seated 90-minute service and a 30-minute counter turn need different ratios for the same cover count. Set the ratio from the unit's own scheduling history rather than from a number in a handbook.

Scheduling labour to a forecast is only half the job; the other half is the actual-versus-scheduled variance, which is the measure supervisors are accountable for.

```
labourVariancePct = (actualHours − scheduledHours) / scheduledHours × 100
```

## Inventory, purchasing and turnover

```
inventoryTurns        = cogs / averageInventoryValue
daysInventoryOnHand   = 365 / inventoryTurns
stockoutRate          = stockoutEvents / totalReorderEvents
yieldPct              = usableOutputWeight / rawInputWeight × 100
```

The reorder workflow models this as reorder point, safety stock and lead-time demand:

```
leadTimeDemand = reorderPoint × leadTimeDays
orderQty       = onHand < reorderPoint ? max(safetyStock, leadTimeDemand − onHand) : 0
```

With the workflow's fallbacks — reorder point 20, safety stock 5, lead time 2 days, safety stock as 25% of the reorder point — lead-time demand is 40 units and an item at 12 on hand triggers an order of 28. Suppliers with irregular lead times need their own per-item lead time rather than the default, and fast-moving perishables need a shorter safety stock than ambient dry goods. Setting safety stock as a flat percentage of reorder point is a convenience, not a method: the correct buffer grows with demand variability and lead-time variability, not with the reorder point itself.

**Economic order quantity** balances ordering cost against holding cost:

```
EOQ = √(2 × annualDemand × orderCostPerOrder ÷ holdingCostPerUnitPerYear)
```

The workflow takes `annualDemand`, `orderCost` defaulting to 50, and `holdingCost` defaulting to 2 per unit per year. Note that EOQ is deliberately silent about the reorder point: EOQ decides how much to buy when you decide to buy, the reorder point decides when. Using EOQ to set reorder points is a category error.

## The forecast and variance mechanics

The financial forecast evaluator is explicit that its projection is deterministic, not random. Period `i` applies a linear trend factor to the supplied revenue, cost and labour:

```
trendFactor   = 1 + (period − 1) × 0.01
periodRevenue = revenue × trendFactor
periodProfit  = periodRevenue − periodCogs − periodLabor
variancePct   = (periodRevenue − revenue) / revenue × 100
flag          = |variance| > varianceThreshold ? high-variance : normal
```

At the default horizon of 12 periods the trend reaches roughly +11%, and the variance flag fires once the cumulative drift exceeds the threshold, default 10%. Two operational consequences:

- **A rising trend is assumed, not forecast.** The drift is a mechanical projection from the base period. It is a placeholder for a demand model built on covers, day of week, seasonality and events — not a substitute for one.
- **High-variance periods are counted**, and the count of consecutive or cumulative periods above the threshold is what should prompt investigation, default 3 periods before an alert.

Treat the forecast as a trend-exposure view: "if this pace continues, where does the period land, and is the drift large enough to act on". Substitute a real demand model when one exists, and keep the variance flag, which is genuinely useful.

## Levers, ranked by speed of effect

| Lever | Effect | Typical speed |
| --- | --- | --- |
| Portion control and recipe accuracy | Food cost, direct | Immediate |
| Waste and spoilage discipline | Food cost, direct | Immediate |
| Yield percentages on butchery and produce | Food cost, direct | Immediate |
| Menu mix toward high-contribution items | Margin and covers | Weeks |
| Schedule-to-forecast labour control | Labour cost | Weeks |
| Beverage pour control | Beverage cost | Weeks |
| Vendor negotiation and pricing | COGS | Months, at contract renewal |
| Menu price changes | Revenue | Immediate, with demand risk |
| Hours or day-part changes | Fixed cost absorption | Months |

The fastest levers are the operational ones. A price change that loses covers is not a saving, and the way to know is contribution per cover, not average cheque.

## Definition discipline

Prime cost reporting breaks in one predictable way: two people use different definitions. Fix these before any target is discussed:

- Net sales excludes tax, gratuity and comps — stated once.
- Labour includes burden and includes salaried management, or it does not, consistently.
- Food cost is COGS from the inventory system, not purchases.
- Comps are recorded and visible, not netted out silently.
- The reporting period is stated with every figure: trading day, week, month or comparable period.
- Comparison periods are like-for-like. A week containing a public holiday or a two-day closure is not comparable, and the variance flags on it should be read with that in mind.

## Configuring this

Every target in this document — prime cost percentage, food cost percentage, `staffPerCover`, service duration, lead time, safety stock, reorder point, ordering cost and holding cost — is a default that the operator overrides. Prime cost and gross margin are computed from `revenue`, `cogs` and `laborCost` inputs to the financial forecast evaluator, whose persisted configuration sets `forecastHorizonDays`, `varianceThresholdPercent`, `highVarianceAlertThreshold` and the required `dataSource` identifying the POS or accounting system the figures come from. Item-level `reorderPoints`, `safetyStock`, `leadTimes` and `unitCosts` are configured on the inventory reorder manager, and `forecastCovers`, `prepRatios` and `currentStock` on the shift prep copilot; menu-level `targetFoodCostPct`, `defaultTargetMargin` and `lowMenuHighlightThreshold` are configured on the menu engineering strategist. Where an operator's actual figures differ from these ranges, the operator's figures govern.