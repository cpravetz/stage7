# Kitchen Prep Standards

Prep is where a restaurant's food cost and its service failures are decided, hours before either shows up in a number. This handbook defines the vocabulary the kitchen workflow uses, writes out the conversion maths in full, and gives the worked example so the same forecast always produces the same prep list. It covers what to cut, how much, and what to do when the forecast is wrong.

## The conversions

```
prepQty        = forecastCovers × prepRatio[item]
shortage       = max(0, prepQty − currentStock[item])
staffNeeded    = ceil(openCovers × staffPerCover)
staffAvailable = floor(availableStaff × shiftShare)
coverage       = min(1, staffAvailable / staffNeeded)
overage        = max(0, prepQty − (currentStock[item] + onHandPrep[item]))
```

Definitions matter more than the arithmetic:

- **A cover** is one seated guest, counted at the reservation, not at the table. A party of four booked as two covers is an undercount that reaches the kitchen as an under-portion, so reservations and forecasts must use the same counting rule.
- **A prep ratio** is edible quantity per cover in the item's recipe unit — grams, millilitres, portions, whole units. It is never a purchase quantity. A ratio set from the invoice converts the invoice, including trim, into the kitchen's cost.
- **Current stock** is usable on-hand in the walk-in and the dry store, not the count in the inventory system from last week.
- **On-hand prep** is already-cut product, which is edible and therefore counted against the shortage before anything is cut further.
- **Service duration** is the elapsed minutes from first seating to last departure, not the time the dining room is nominally open.
- **Staff per cover** is the ratio of people on the line to covers in a shift, so a 0.2 ratio means five covers per line cook. It varies with the menu, not with the day of the week.

## Holding and re-prep

The reason the ratio matters as much as the quantity is that cut product holds for a shorter time than whole product does, and the window is short enough that a well-run kitchen plans back from it.

| Product | Hold at or below 5 °C | Hold frozen | Notes |
| --- | --- | --- | --- |
| Leafy greens, herbs | 24 hours | 6 weeks | Wash before cutting, never after |
| Root vegetables, peeled | 48 hours | 3 months | Cut and held in water needs 24 hours maximum |
| Onions, halved | 48 hours | — | Cut side down, covered |
| Boned meat, poultry | 48 hours | 3 months | Never refreeze thawed raw product |
| Cooked sauces and reductions | 72 hours | 1 month | Rapid-chill before storage |
| Cooked rice, pasta, potato | 24 hours | — | Cool within 30 minutes |
| Marinades and brines | 48 hours | 3 months | Raw protein stays below ready-to-eat |

Cold holding is at or below 5 °C, and hot holding at or above 63 °C. A prep list that cannot be completed inside its hold windows is a staffing problem or a forecast problem, not a chef's problem, and it is reported as whichever one the arithmetic shows.

## Allergen discipline

Allergen controls sit on the prep list rather than beside it, because the hazard is created during prep:

- Separate boards, knives and storage for allergen-free production, colour-coded and stored apart.
- Prep performed before allergen-free production in the shift, not after, so the line does not cross-contaminate in the order of service.
- Every prep list carries the current allergen notice, and a substitution is never silent.
- An item whose recipe cannot be made safely free-from is marked unavailable rather than made with a substitution.
- Oil, water and utensils used for an allergen-free item are shared only where the sharing is documented.

## Working the shortages

Shortages are ranked by what happens if the item runs out during service:

1. **Safety-critical** — items on the line that cannot be substituted without breaking an allergen or holding promise. Cut first, and flag when stock cannot cover them.
2. **Signature items** — the dishes the section is known for. A missing signature item is a complaint and a comp.
3. **Substitutable items** — where an approved substitute exists, the substitute is named on the list rather than left to the expediter.
4. **Base components** — sauces, garnishes and bases used across several dishes. Their cost is small and their absence is felt in several dishes at once.

The ranking only matters because the shift is short. When staff cover falls below the line, rank the list and say what was dropped, rather than producing a prep list nobody can finish.

## Definition discipline

Prep lists break in one predictable way: two people count the same thing differently. Fix these before a list is issued:

- Covers are counted once, at booking, and carried unchanged through forecast, prep and service.
- Prep ratios are in recipe units, and the unit is named on the list.
- Current stock excludes product already committed to another station.
- Hold times are counted from the moment of cutting, not from the end of prep.
- The list states the date and the shift it covers; yesterday's list is not a starting point.
- The forecast is labelled as a forecast. When it was wrong, the variance is recorded and the forecast is not silently overwritten.

## Configuring this

Every figure in this document is a default the operator overrides. The shift prep list copilot reads `defaultShift`, which sets the shift a list is generated for when the caller does not name one, and `autoReorderThreshold`, the shortage above which an item is put forward for reorder rather than simply flagged. Its per-run inputs are `forecastCovers` and `prepRatios` for quantities, `currentStock` and `openCovers` for what is on hand, `serviceDuration` and `staffPerCover` for the staffing calculation, and `availableStaff` for what the schedule actually delivers. Item-level `reorderPoints`, `safetyStock`, `leadTimes` and `unitCosts` are configured on the inventory reorder manager, and `forecastCovers` on the financial forecast evaluator, whose `forecastHorizonDays` and variance thresholds set how far ahead the list is planned. The line cook's own yield percentages are recipe data, not configuration, and belong in the recipe card. Where an operator's figures differ from these defaults, the operator's figures govern.