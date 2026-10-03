# Housekeeping SLA Rules and Turnover Standards

This handbook is the operating standard for the Housekeeping & Room Turnover skill: how tasks are created, assigned, dispatched, and completed, how room cleanliness states gate the saleable inventory, and how the service levels and productivity budgets that determine whether the department keeps up with arrivals are calculated. The skill is deliberately thin — it records task state and enforces the state machine — so the standards it enforces are the ones written here. A property that runs a different standard should encode it in configuration and task priority, not assume the assistant knows it.

## Task lifecycle and defaults

The skill accepts `action` values of `create`, `update`, `assign`, `dispatch`, and `complete`. Anything else falls through to a list response.

A created or updated task record contains exactly six fields:

| Field | Source | Default when omitted |
| --- | --- | --- |
| `taskId` | `taskId` input | Generated from the current timestamp |
| `roomId` | `roomId` input | null |
| `staffId` | `staffId` input | null |
| `status` | `housekeepingStatus` | `dirty` |
| `priority` | `priority` | `medium` |
| `updatedAt` | System clock | ISO 8601 instant |

Mutating actions return `{ task, totalTasks }`; a list returns `{ tasks, totalTasks }` where `totalTasks` is the size of the persisted `housekeeping_tasks` store. Because the store is cumulative and never pruned, `totalTasks` counts every task ever recorded, not the open workload. For an open-room count, filter on the task status rather than reading the total.

`priority` accepts `low`, `medium`, `high`, and `urgent`. `urgent` is reserved for a guest in the room, a VIP arrival inside the SLA window, or a room tied to a same-day revenue-critical sell. It is not a way to express dissatisfaction.

The task record carries no `dueTime`, `scheduledAt`, or `estimatedMinutes` even though all three are accepted as inputs and used for dispatch planning. Anything not stored on the record must be tracked in the notes field or in the PMS, or it is lost on the next write.

## Cleanliness state machine

`housekeepingStatus` accepts `dirty`, `clean`, `inspected`, and `out-of-service`. These are distinct from the saleable room statuses managed elsewhere; the two vocabularies meet at one point and it matters:

```
dirty  ──attendant cleans──>  clean  ──inspector──>  inspected
any    ──defect / hold──>  out-of-service  ──cleared──>  dirty
```

The rule that carries the most operational weight: a room becomes saleable only at `inspected`. An attendant marking a room `clean` has asserted that the work is done, not that it is acceptable. The inspection pass is the control that catches a missed sanitation step, a broken fitting, or a maintenance defect discovered during cleaning. Skipping inspection to save minutes is a direct trade of guest safety and brand risk for a few minutes of labour, and the labour saving does not survive the rework or the complaint.

`out-of-service` on the housekeeping side corresponds to `out-of-order` in the room-status vocabulary. When a room goes out of service, the saleable inventory must drop with it or the property is selling rooms it cannot deliver.

## Service level tiers

A workable SLA is expressed as a readiness time keyed to when the guest needs the room, not to when the guest departs. The tiers below are typical defaults for a full-service hotel with an in-house laundry; adjust per property and per room type.

| Tier | Trigger | Ready-by target | Notes |
| --- | --- | --- | --- |
| Same-day departure turnover | Guest departs before 10:00 | Ready by 15:00 | The bulk of the daily workload |
| Post-checkout hold | Departure after 10:00 | Ready by guest arrival time | Triggers only if arrival is same day |
| Stayover refresh | Occupied room, second night | Completed before 11:00 | Reduced scope, guest-occupied window |
| VIP / loyalty | Flagged reservation | Ready 30 minutes before standard target | Requires the flag to be visible to the floor |
| Early arrival | Guest arrives before standard check-in | On request, best effort | Trade against the same-day departure queue |
| Inspection turnaround | Attendant marks `clean` | Inspected within 30 minutes | Keeps the inspected pool ahead of demand |
| Out-of-service re-entry | Repair completed | Re-cleaned and inspected same day | Room does not re-enter the pool on repair alone |

Two operational rules that make the tiers work. The inspected pool is the buffer: if the count of rooms in `inspected` falls below the arrival count for the next two hours, the department is behind and staffing should be rebalanced before the backlog compounds. And a departure after the morning cut-off is a scheduling decision, not a housekeeping failure; the escalation belongs to the front office that promised the arrival time.

The arrival curve, not the departure curve, sets the staffing requirement. Work is created at checkout and felt at check-in, and the two curves peak at different hours. A department staffed to the departure curve will be idle at 09:00 and short at 14:00.

## Productivity budgets and SMED

Standard minutes per room, the core of any productivity budget:

| Room type | Stayover | Departure clean | Deep clean |
| --- | --- | --- | --- |
| Standard king or queen | 20–25 min | 30–35 min | 60–90 min |
| Two-room suite | 40–50 min | 60–75 min | 120+ min |
| Accessible room | 30–35 min | 45–55 min | 90–120 min |
| Executive floor room | 30–35 min | 45–55 min | 90+ min |

Rooms per attendant per shift, in a 480-minute shift with a standard 30 percent allowance for breaks, meetings, and non-productive time: roughly 14–16 stayovers, 11–14 departure cleans, or 5–6 suites.

The gap between standard minutes and actual minutes is where the department loses. SMED — separate, move, eliminate, simplify, integrate, then sustain — is the standard method for closing it, applied here in property-specific terms:

- **Separate**: stage linen, chemicals, and caddy supplies at the floor rather than at the housekeeping office. Measure the walk.
- **Move**: bring the cart to the room, not the linen to the cart. Where floor staging is impossible, measure the retrieval round trip.
- **Eliminate**: identify steps done because they have always been done. Guest-requested items on a stayover are not the same as a full refresh.
- **Simplify**: standardise the room-attendant route within a floor so the sequence is identical every time. Variation costs time.
- **Integrate**: sequence the route around arrival times rather than room numbers so cleaned rooms are not re-entered.
- **Sustain**: measure after each change and publish the number.

The practical test of a standards programme is whether the actual minutes converge on the standard minutes without the cleaning steps shrinking. If cycle time falls and inspection findings rise, the change removed quality rather than waste. The industry term for the covert version of this is tunnelling, and the only reliable detector is inspection scoring, not time measurement.

## Inspection and scoring

Inspection should be a scored pass, not a gestalt. A workable point scheme:

- Critical fail: sanitation failure, sharp object, biohazard, or an unreported maintenance hazard. One critical fail fails the room regardless of the numeric score.
- Deduction categories: bed and linen condition, bathroom cleanliness and consumables, dust and surfaces, floors and carpet, furniture condition, closets and storage, minibar and inventory accuracy, and presentation of the entrance.
- Re-clean trigger: any critical fail, or a deduction total above the property threshold. Default re-clean threshold is 20 percent of available points.

Record the failure category on the task `notes` field. Category frequency is the only data that makes the next training or process change specific, and the task record is where it lives.

Quality sampling matters when the inspector is also the manager. Randomly auditing a fraction of already-approved rooms is the cheapest way to detect an inspector who approves everything, and it is the only sampling that is not biased by which rooms happen to be revisited.

## Workload balancing and assignment

The `staffIds` field supports bulk assignment and `roomIds` supports bulk rounds, so a whole floor can be dispatched in one call with a single `dueTime`.

Balancing rules that hold in most properties:

- Assign by measured credit consumption, not by room count. A suite and a stayover are not one task each.
- Keep a route contiguous per attendant. Cross-floor hopping wastes more time than the assignment saves.
- Do not assign a room that is currently occupied to a departure clean. Check the saleable room status, not the housekeeping status, before dispatch.
- Peak coverage should follow the arrival curve, not the departure curve.
- Leave one attendant of slack per floor per shift for re-cleans and out-of-service re-entries. Zero slack is not an efficiency gain; it is a promise you will break on the first inspection failure.

## Measuring the department

Four numbers are worth reporting weekly, and none of them should be reported alone:

| Measure | Definition | Why it can mislead alone |
| --- | --- | --- |
| Attendant minutes per occupied room | Total task minutes / rooms cleaned | Falls when scope is reduced rather than when time is saved |
| Rooms cleaned per attendant per shift | Count / attendants rostered | Rises on a light day and on an over-simplified scope |
| Inspection pass rate | Rooms passing first inspection / rooms inspected | Falls when inspection is skipped, which also raises throughput |
| Re-clean rate | Re-cleans / rooms cleaned | The most honest of the four, and the slowest to improve |

Report them together as a set. The combination of falling minutes with a falling pass rate is a scope reduction, and it is visible only when the pass rate is reported next to the throughput.

The productivity denominator also needs a rule about who counts. Departure cleans and stayovers are different credits; scoring them equally is the most common way a productivity number flatters a property that has an unusually high stayover share.

## Chemical, linen, and room security

Three areas that sit under housekeeping ownership and are governed by more than the turnaround clock:

- **Chemical safety.** Chemicals are stored and dispensed from a caddy, never decanted into an unmarked beverage container, and never transferred out of the property. The label travels with the chemical.
- **Linen handling.** Linen is never used as a mop or as a wipe on a surface that is then wiped again. Soiled linen is bagged at the point of use and never carried across a corridor draped over a cart.
- **Room security.** Housekeeping holds a master key or a key-card override. That access is logged, is issued per attendant per shift, and is surrendered at end of shift. A room attendant does not report a door that has already been forced; the process is to leave it, secure the floor, and call the manager.
- **Lost property.** Items left in a room go to a single logged location with a date and a room reference, and are held for a defined period before disposition. They are never held in a staff area.

## Configuring this

The standard minutes, the ready-by targets, the inspection turnaround, and the re-clean deduction threshold in this document are defaults for a full-service property and are not configuration fields in the skill. What an operator does configure is the persisted task store, the property and room and staff references, the connector endpoint, and the confirm-before-send and dry-run behaviour, all carried in the skill's configuration. Priority and cleanliness-state vocabularies are fixed enumerations, so a property with an extra intermediate state such as a two-stage inspection should express it through `notes` and `priority` or raise the extension with the platform team. Mutating actions default to dry-run and require explicit confirmation before a live dispatch reaches the PMS, and that safety default is not meant to be relaxed per property.
