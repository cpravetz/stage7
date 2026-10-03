# Food Safety and Allergen Control Guidelines

Every output the restaurant workflow produces carries the safety boundary marker, because a food cost percentage or a prep list that ignores handling rules is a hazard in numeric form. This handbook covers the standard practice a foodservice operation runs on: hazard analysis, time and temperature control, cross-contamination prevention, allergen management, cleaning and sanitising, and the records that demonstrate control. Local regulation and a qualified food safety professional govern; the figures here are commonly cited planning defaults drawn from widely adopted guidance, and where a local code states a different number, the local code applies.

## The safety boundary

`food safety / allergen protocol` is attached to every restaurant report for a reason. Two things follow from it in practice:

- **Cost and safety are not separate systems.** Yield percentages, prep ratios, overproduction and waste decisions all move food through the operation faster or slower, and time is a food-safety control.
- **Allergen information is never inferred from a menu description.** Allergen risk is handled by documented ingredient data, staff knowledge and controlled substitution, and by telling the guest what the kitchen actually knows.

## HACCP in a restaurant

The Hazard Analysis and Critical Control Point framework is the structure most kitchens are inspected against, whether or not the word is used on the floor.

Seven principles, in plain terms:

1. **Analyse hazards** at every step from receiving to service.
2. **Identify significant hazards** — biological, chemical, physical and allergenic.
3. **Determine critical control points** — the steps where control is essential: cooking, cooling, hot holding, reheating.
4. **Establish critical limits** — the measurable thresholds, chiefly time and temperature.
5. **Establish monitoring procedures** — who checks, how often, and what the check is recorded as.
6. **Establish corrective actions** — what happens when a limit is breached: reheat, extend, discard, escalate.
7. **Establish verification procedures** — calibration, record review, supervisor observation, and the third-party audit.

In practice the kitchen reduces this to three or four written critical limits, the thermometer checks that enforce them, and a log that shows they happened. If a limit cannot be measured, it cannot be a critical limit.

## Time and temperature control for safety

**Time/temperature control for safety (TCS)** food is food that supports the growth of pathogens, or food that is raw animal product, cut produce, cut melons, or cut leafy greens. Almost everything on a restaurant menu is TCS food.

### The danger zone

Food safety guidance places the temperature danger zone roughly between **4 °C (40 °F) and 60 °C (140 °F)**, where TCS food must not spend long. Some frameworks use a narrower upper band for hot holding, commonly **57–60 °C (135–140 °F)**, and many operations set their own internal hot-holding floor at **60 °C (140 °F)**. The commonly cited planning defaults are:

- **Cold holding: at or below 4 °C (40 °F)**
- **Hot holding: at or above 60 °C (140 °F)**
- **Maximum time in the danger zone before use or discard: 4 hours**, commonly reduced by operation policy to **2 hours** as a working rule

Operations that adopt the shorter internal limit get more margin and survive inspection more comfortably. This is a default an operator sets and enforces; the governing local code governs.

```
timeInDangerZone = now − timeLeftControl
action = timeInDangerZone > maxTimeInDangerZone ? discard-or-extend-under-control : proceed
```

If a control is lost mid-service — cooler fails, a hot box runs cold, the pass runs out of hot plates — the exposed food is either brought back under control within the allowed window or discarded. There is no third option and no judgement call at 2 a.m.

### Cooking temperatures

Commonly cited minimum internal temperatures for cooking TCS food, from widely adopted food codes:

| Food category | Minimum internal temperature | Rest / carry-over |
| --- | --- | --- |
| Poultry, ground meat, comminuted meat | 74 °C (165 °F) | None |
| Fish | 63 °C (145 °F) | Cook and hold, or serve immediately |
| Shell eggs and egg dishes | 71 °C (160 °F) | Immediate service |
| Raw or rare steaks, roast beef, seafood for commutation | Cordon bleu to preference, typically 49–54 °C (120–130 °F) | Rest before slicing or commutation |
| Ready-to-eat and hot-held items | Reheated to 74 °C (165 °F) within 2 hours | Hold at or above 60 °C |

These are floors, not targets. Two operational rules sit on top of them:

- **Commercially cooked / sous-vide / low-temperature cooking.** Items cooked gently and held for service must be pasteurised before service or cooked to the standard immediately before service. Vacuum packaging does not make an undercooked product safe.
- **Reheating for hot holding** must reach the reheat temperature within the time limit, once, per reheating event.

### Cooling

Cooling is where the most serious and most invisible failures happen. The widely cited two-stage rule:

```
stage 1: 60 °C (140 °F) → 21 °C (70 °F) within 2 hours
stage 2: 21 °C (70 °F) → 5 °C (41 °F) within a further 4 hours
total:    60 °C → 5 °C within 6 hours
```

Supporting practice:

- Spread the product in shallow pans, in single layers, in pans no more than a few centimetres deep.
- Use blast chillers, ice baths, or portion and blast-chill in the walk-in.
- Cool in the walk-in rather than in open ambient air, and do not stack hot pans in a busy fridge — the middle of the stack stays in the danger zone for hours.
- Never cool a large batch in the deep stockpot it was cooked in.
- Label with the time it entered the cooler and the time it must be out.

Cooling records are among the first things an inspector asks for, and they are among the easiest to fake badly.

### Thawing and tempering

- Refrigerated thawing under refrigeration, on a tray below other food, never on a counter or in ambient air.
- Under running water at a temperature that does not raise the food above the cold-holding limit, in a sink dedicated to thawing raw product.
- Microwave thawing only for immediate cooking — food begins rising in temperature before the middle thaws.
- Thawed food is never refrozen, and thawing in the walk-in without a tray is a cross-contamination route.

### Holding and service

- Hot holding in equipment monitored at the interval the kitchen set, with the readings written down.
- Cold holding on ice or in mechanical refrigeration, with the display checked rather than assumed.
- **Buffet and banquet service**: hot holding equipment preheated and verified before service, food replaced in small batches rather than all at once, and the service window for each batch logged. A plated meal held out of the pass falls out of temperature in minutes.
- **Room-temperature displays** of TCS food — cheese boards with meat, pâté, cut fruit, dairy spreads — are frequently overlooked. The display itself is a critical control point.

## Cross-contamination and segregation

- **Raw vs ready-to-eat segregation**, physically and temporally: separate boards, knives, containers, cloths and storage space; raw stored below ready-to-eat in the walk-in.
- **Colour-coded boards** as a visible convention, not the control itself — the control is that tools are dedicated and cleaned between uses.
- **Wash, rinse, sanitise between tasks**, on the same surface, with the same hands.
- **Handwashing** — soap and running water, at least 20 seconds, at stations that are actually reachable and actually supplied. The absence of soap or hot water is the finding that shuts a kitchen down.
- **No bare-hand contact with ready-to-eat food** where a regulation or policy requires utensils or gloves. Gloves are a barrier, not a handwashing substitute: change between tasks, and wash before and after gloving.
- **Aprons and outerwear** changed after handling raw product or waste.
- **Wiping cloths** held in sanitiser between uses, and cloths for raw never used on ready-to-eat.
- **Ice and ice scoops**: dedicated scoop, never a glass, never hands.
- **Allergen and dietary substitutions prepared to the same standard as everything else** — separate boards, separate utensils, clean surfaces, and a plate that visibly differs so the runner knows it is a special.

## Allergen management

The most commonly cited allergen set in the US is the **nine major food allergens**: milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy and sesame. The EU and UK frameworks generally list **14** allergens, adding celery, lupin, mustard, sesame and sulphites. Allergen lists differ by jurisdiction and by supplier formulation — a product can change its supplier and its allergen profile without the recipe changing.

Rules that hold in practice:

- **The allergen source is the current supplier specification and the current recipe**, not the menu description and not memory.
- **Substitution is a documented process** with an approval step, not a verbal "we can do that".
- **Dedicated equipment for high-risk allergens** where the volume justifies it: separate fryers, separate oil, separate prep surfaces for nut and shellfish work.
- **Fryer oil is shared by default and is an allergen control point.** Oil shared with breaded, battered or fish products carries allergens; many operations post this.
- **Staff must ask, not assume.** A guest saying "I'm fine" does not answer the allergen question; a guest saying "no dairy" is not a nut allergy and a nut allergy is not a dairy intolerance.
- **The guest is told what the kitchen knows and does not know.** Where a supplier specification is unavailable, say so.
- **Records**: keep the allergen matrix, the supplier specifications, and the substitutions made on each service.

No menu or guarantee eliminates the risk of an individual reaction. The control is information, verification and communication.

## Personal hygiene and health

- Handwashing on entry, after toilet, after raw handling, after waste, after cleaning, after phone, after handling money where policy requires, and between glove changes.
- Reporting of illness by staff, with the exclusion periods set by the governing code, and a documented return-to-work process. Managers must be able to state the rule; staff must be told where to report.
- Cuts covered with a waterproof dressing and a glove; hand dressings paired with gloves where the code requires.
- Hair restrained, no jewellery on hands, clean uniform and footwear.
- Eating, drinking, smoking and vaping restricted to designated areas away from food.

## Cleaning and sanitising

- **Clean removes soil; sanitise reduces microorganisms.** Sanitiser applied to a dirty surface does almost nothing.
- Sanitiser strength and contact time come from the product label and the local code — commonly quoted ranges of tens to hundreds of parts per million exist across products, and the label is the instruction, not a default to guess at.
- Test strips or test strips-equivalent verification on every solution, at preparation and through the shift. Concentration charts taped above each station.
- Wash, rinse, sanitise — in that order, on food contact surfaces between raw and ready-to-eat tasks, and always at the end of a task and the end of the shift.
- Air drying after sanitising; wet cloths breed growth.
- Dishwashing: temperatures and chemical concentration monitored at each change, and machine cycles verified.
- High-touch surfaces: handles, taps, till areas, service buttons, door push plates, and the aluminium foil and glove boxes nobody lists.

## Receiving, storage and stock rotation

- **Check deliveries on arrival**: temperature, packaging integrity, date coding, damage, and vehicle cleanliness. Reject rather than accept and hope.
- **FIFO** for best-before stock, **FEFO** for use-by and short-dated items; products with use-by dates are rotated first and separated so they are used.
- Store raw below ready-to-eat; keep chemicals and allergen-free products segregated from food.
- Label and date everything that is opened, decanted, thawed or prepped, with a use-by and an initial.
- Wipe and date open containers of oil, sauce and dressing; do not top up old product back into a fresh container.
- Waste removed regularly, bins lidded, and the waste area kept away from food handling.

## Facility and pest management

- Structure kept in repair: flooring, wall finishes, ceilings, coving, and the gap under equipment and behind shelving that becomes a harbourage.
- Waste removed from site frequently and containers fitted with lids.
- Pest control on a documented schedule with a contractor log and a trend, not just the absence of sightings.
- Water and plumbing defects reported immediately — a blocked sink backs contamination up the whole line.
- Adequate ventilation, temperature-controlled storage, and chemical storage that is labelled, segregated and inaccessible to unauthorised people.

## Records, monitoring and corrective action

A safety system is only as good as its records. The minimum monitoring record set:

| Record | Frequency | Content |
| --- | --- | --- |
| Receiving temperatures | Every delivery | Item, temperature, time, acceptance, action |
| Walk-in and storage temperatures | Each shift, start and end | Both coolers, temperatures, corrective action |
| Cooking and reheat temperatures | Every batch | Item, temperature, time, initials |
| Cooling records | Every cooked batch | Start time, stage times, discard or use-by |
| Hot and cold holding temperatures | Every service, at the interval set | Unit, temperature, corrective action |
| Sanitiser verification | Solution prep and through shift | Concentration, strip used, initials |
| Cleaning schedule | Per shift | Task, area, completion, initials |
| Calibration | Per schedule | Thermometer and probe checks, correction |
| Corrective action | On every breach | What failed, what was done, who decided, when |

**Corrective action vocabulary**: reheat, re-chill, extend cooking, isolate, discard, escalate, do not serve. Every breach gets one of these recorded, with the time. A breach with no recorded disposition is a breach waiting to be found by someone else.

When a failure occurs that reaches guests, the response is a documented one: preserve what is needed for investigation, notify in line with policy and regulation, and be honest about the timeline. Quiet handling converts a contained incident into a reputational and regulatory one.

## Where the workflow meets these rules

- Prep lists are ordering tools, not temperature tools. Any item on a prep list that is TCS carries a hold time, a label date and a use-by.
- Forecast covers drive prep quantity; a high-forecast day produces overproduction, and overproduction is a food-safety control problem before it is a cost problem. Waste is logged with a reason.
- Shortages reported by the prep and reorder workflows are time-critical when the substitute is a fresh TCS item — a missed delivery is a safety decision as well as a service one.
- Allergen and dietary requirements travel with the reservation, into the prep list, and onto the ticket at the pass. The runner must be able to see it and repeat it back.

## Configuring this

The temperatures, time limits, holding levels, allergen counts and sanitiser figures in this document are commonly cited defaults and, where a local code or a qualified food safety professional specifies otherwise, the local requirement applies. The kind of control that actually protects guests is the operator's own HACCP plan — its critical limits, its monitoring interval, its corrective actions and its records — supported by calibration schedules and staff training held in the kitchen, not in configuration. Supplier specifications and the allergen matrix are maintained as operator data and surface through reservation preferences, prep lists and reorder records. Nothing here is legal advice or a substitute for a food safety manager, a certifying authority or the local regulator.