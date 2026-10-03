# Banquet Event Order (BEO) Specifications

The BEO is the controlling document for any event that puts food, beverage or service staff on a client's floor. It is the one place where planner, venue, caterer and client agree on numbers, and it is what an account manager opens when the final invoice disagrees with somebody's recollection. This handbook sets out the fields a complete BEO carries, the defaults applied when a client has not specified them, and the arithmetic behind the budget block.

## Where the BEO sits in the planning flow

Events move `plan → vendors → day-of`. The BEO is drafted during **plan**, countersigned with the venue and caterer before **vendors** are contracted, and becomes the reconciliation reference at day-of billing.

Three rules govern its life:

- **One BEO per scope.** A change to menu, price, guest count or timing produces a new numbered revision, never an edited copy of an issued one.
- **Signature precedes deposit.** Deposits are released only against a countersigned revision, never against a verbal confirmation or a draft sent for comment.
- **BEO is an order document, not a contract.** Terms, cancellation, indemnity and liability live in the vendor agreement. Anything with legal consequence belongs there.

## Header block: event identification

Every BEO opens with fields that let a reader with no other context identify the job:

| Field | Content | Why it is mandatory |
| --- | --- | --- |
| `eventName` | Client-facing event name, plus internal code | Deduplicates repeat clients across venues |
| `eventType` | conference, workshop, gala, wedding, festival, trade-show, retreat, product-launch, fundraiser, networking | Drives staffing ratios, service style and AV assumptions |
| `date` | Service date or date range, ISO | Everything else hangs off it |
| `venue` | Venue name plus room or address | Prevents "the ballroom" ambiguity |
| BEO number | Sequential, venue-side or planner-side | Required for revision control |
| Revision | Incrementing integer plus revision date | Audit trail for what changed |
| Prepared by / counterparty | Named planner with contact | Who to chase |

An event type drives the whole rest of the document. A gala of 250 and a conference day of 250 use the same number and almost nothing else.

## Dates and times block

The block is a clock, not a calendar entry. Each line has an owner and a done-state.

| Line | Typical value | Owner |
| --- | --- | --- |
| Load-in access | Venue default, often early morning | Venue ops |
| Setup / installation | Begins at load-in | Production + catering |
| Vendor meal service | Before guest arrival | Catering |
| Guest arrival / doors | Event-dependent | Planner |
| Seating / cocktail | 45–60 min before service, common default | Venue + planner |
| Speech / ceremony block | Agenda-driven | Planner |
| Meal service — first course | Agenda-driven | Catering |
| Last call (beverage) | Commonly 30–45 min before guest departure | Bar lead |
| Guest departure | Agenda-driven | Venue |
| Clear / strike | After departure | Venue + catering |
| Load-out | Venue default | Production |

Write every line as local time with the time zone. Cross-time-zone guest lists and multi-city event series are where BEO clocks most often go wrong.

## Attendance and guarantees

Attendance is three numbers, not one:

- **Expected attendance.** The planning figure. Drives staffing, rentals and prep quantities. Used for budget arithmetic.
- **Guaranteed minimum (GM).** The number the client will pay for regardless of actuals. Usually negotiated below expected attendance; commonly 80–90% of it.
- **Final guarantee (FG).** The last number that sets the final billing quantity, given at a cutoff before service — commonly 72 hours, sometimes 48.

```
billableCovers = max(actualCovers, finalGuarantee)
expectedSpend  = expectedAttendees × menuPricePerGuest
costPerAttendee = totalBudgetTotal / expectedAttendees
```

Overage handling must be stated explicitly in the BEO: the rate at which covers above the guarantee are billed, and whether they are billed at full menu price, at a set per-plate overage price, or at cost plus a percentage. "Billed at menu price" is the common default and the one most often left unstated.

Watch for the double-count: service charge is usually applied to food, beverage and sometimes labour as separate lines. A BEO that quotes a per-plate price "all in" still usually has tax applied on top, and guests read the per-plate figure.

## Menu and service style block

Record the menu by course, with the price attached to each course, and state the service style once:

- **Plated / seated service.** Requires a table plan, service positions per table and a fixed sequence.
- **Family-style.** Placed on the table; requires larger table footprint and a shorter service window per guest.
- **Buffet.** Lowest labour per cover, longest queue, requires a floor-plan queue design and a second service line for accessibility and dietary needs.
- **Stations / action stations.** Requires footprint, queue routing and often power; highest perceived value, highest labour cost.

Course-level detail that belongs in the BEO: course name, dish composition, portion size for plated service, substitutions, and the dietary handling note. Allergen and dietary substitutions belong in a separate allergen matrix, cross-referenced, not folded into the menu line.

## Beverage and bar block

Two pricing models, and the BEO must name which one is in force:

- **Open bar / consumption.** Guests pay at the bar; the BEO records the price per drink and any minimum spend.
- **Bar package / consumption minimum.** A per-guest, per-hour or per-event minimum. Typically 3–5 drinks per guest per hour as a planning assumption — a default, not a rule.

The block also carries: corkage fee per bottle brought in, bartender fee per hour and the minimum bartender hours (commonly 4–5, because the bar is staffed before and after the peak), glassware and ice service, and brand restrictions where a client specifies a category rather than a brand.

## Minimums, service charges and fees

These lines are the most common source of invoice dispute, because they are frequently quoted verbally and omitted from the BEO:

| Line | Common treatment | Notes |
| --- | --- | --- |
| Food & beverage minimum | Per guest, per event, or per day for multi-day | Specify which; per-day is standard for conferences spanning several days |
| Guaranteed spend | Dollar amount, not a per-plate rate | Confirm whether tax and service charge count toward it |
| Service charge | Percentage of food and beverage | Commonly 18–22% in full-service operations; often negotiable or waived at higher volume |
| Administrative fee | Percentage, sometimes on service charge too | Rarely understood by clients; state it explicitly and stack it visibly |
| Rentals and service fees | Percent of rental list or flat | Damages and loss charges on rented goods should be named |
| Sales tax / VAT | Jurisdiction-specific | Affects the final per-plate cost |

Every one of these is a default the operator sets. Nothing here is universal, and a client who has negotiated a fee waiver in one event has not earned it in the next.

## Staffing and operations block

Record the staffing model, not just the headcount:

- Ratio of servers to guests, stated per service style. Plated service needs more; buffet needs fewer servers but more runners.
- Captain / banquet captain presence and authority to approve substitutions.
- Chef attendance and escalation contact.
- Uniform standard and whether the venue supplies it.
- Bar staff count and bartender hours minimum.
- Back-of-house prep start time and whether prep happens on site or off site.
- POS and check-presenting responsibility, so the day-of team knows who settles.

## Rentals, equipment and site services

The BEO lists what the venue provides versus what is rented, because double-ordering and gaps both cost money:

- Tables, chairs, linens, china, glassware, flatware — quantity, style, condition standard.
- Staging, risers, dance floor, pipe and drape, carpet.
- Lectern, staging stairs, railings.
- Lighting: house lighting vs production, house pin spots vs full rig.
- Power: house power availability, distribution, and whether a generator or tie-in permit is required. Stating required amperage prevents the most common production delay.
- Internet and wifi: whether it is included, the SSID, and the required bandwidth.
- Signage: what the venue provides, what is printed, who installs it and when.

## Floor plan and seating block

A floor plan is part of the BEO, not an attachment someone forgot. It carries: room dimensions and a scale, exits and extinguisher positions, service stations and their clearance, buffet or station queue routing, accessible route, head table and VIP seating, sponsor or product placement, and the position of the AV riser relative to the audience sight line.

For ticketed or seated events the plan also carries table identifiers, seating assignment by name or by ticket tier, and the reserved-release rule — how many unassigned seats are held and when they release to walk-up.

## Access, logistics and compliance block

- Parking: on-site count, overflow location, valet arrangement and pricing.
- Loading dock: reservation window, dock height, elevator dimensions and load rating, and whether freight elevator use needs separate booking.
- Access hours versus guest hours, with the surcharge if they differ.
- Certificates of insurance from every vendor naming the venue as additional insured, with limits as agreed in the contract.
- Permits: assembly occupancy, fire marshal inspection, food service permit, alcohol licence, amplified sound or street closure permits.
- Security staffing and screening if the client requires it.

## Billing, deposit and sign-off

The BEO closes with the money mechanics, in this order:

1. Deposit amount and due date, tied to a signed revision.
2. Final payment terms and due date.
3. Incidental spend authorisation — who may approve, and up to what limit.
4. Tax treatment.
5. Signatures with printed names, titles and dates for client, venue and caterer.

Never release a deposit against an unsigned draft. The revision number, not the date, is what identifies what was agreed.

## Budget block and cost arithmetic

When the client has supplied a total budget and no category split, the planner applies a default category distribution and records it as an assumption, not a quote. Common starting shares for a full-service event:

| Category | Common starting share | Notes |
| --- | --- | --- |
| Venue, facility and bundled rentals | 25–40% | Highest variance; single-room exclusivity can dominate |
| Catering: food, beverage, service charge | 30–45% | Driven by per-plate price and bar model |
| Entertainment, AV and production | 10–20% | Scales with rigging, power and content |
| Labour not included in venue package | 8–15% | Omit where the venue staffs the event |
| Decor, florals and styling | 5–10% | Often the easiest place to trim |
| Marketing, invitations, printing | 3–8% | Scales with audience size |
| Transport, logistics, parking, freight | 3–7% | Larger for regional or multi-day events |
| Permits, insurance, security, medical | 2–6% | Required, rarely optional |
| Contingency | 8–12% of subtotal | Hold it; do not allocate it |

Per-category overrides are applied through the `budgetBreakdown` input, which takes a category name mapped to a percentage, e.g. `{ "Venue": { "pct": 0.35 } }`. The shares must sum to 1.0; a breakdown that does not sum to 1 is an error, not a rounding difference.

Two derived numbers get computed from every plan and quoted back to the client:

```
costPerAttendee = totalBudgetTotal / expectedAttendees
perPlateAllIn   = (food + beverage + serviceCharge + tax) / finalGuarantee
headroom        = totalBudgetTotal − sum(allCategories)
```

Report cost per attendee as well as the total. It is the number a client can actually check against a competing proposal, and it is the first thing that breaks when the guest count is wrong.

## Revision control

Each issued BEO is stamped with revision number, revision date, and a short description of what changed. Prior revisions are retained, never overwritten. At close-out the invoice is reconciled against the final revision, and any departure — extra covers, extended bar hours, added AV, overtime labour — is matched to an authorisation before it is paid.

## Common BEO errors

- Service charge and administrative fee quoted as one number, then invoiced as two.
- Guaranteed minimum stated without the cutoff date for the final guarantee.
- Guest arrival time and meal service time less than 45 minutes apart for seated service.
- Bar minimum in dollars, but the per-guest drink assumption never written down.
- Rentals listed without who supplies them.
- Power listed without required amperage.
- Floor plan missing exits and accessible route.
- Contingency allocated to a category, leaving nothing for the change that will certainly happen.

## Configuring this

The category shares, guarantee cutoffs, service charge percentages and contingency percentages in this document are defaults, not universal figures — each client and each venue negotiates its own. The planner overrides them per event through the `budgetBreakdown`, `eventType`, `expectedAttendees` and `budgetTotal` inputs to the Event Planning & Budgeting skill, and the resulting plan is persisted to its `plans` store under an `event_<timestamp>` identifier. Vendor- and venue-side counts are then reconciled against the countersigned BEO by the Vendor & Contract Management skill, and day-of attendance against the same BEO during operations.