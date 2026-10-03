# PMS Operations Guide

This handbook describes the property-management operating model the hotel assistant implements: the room status state machine, the reservation and folio lifecycle, supply reorder logic, guest-service handling, and the shared external-request contract every mutating call returns. It is written for the duty manager and the revenue and systems staff who configure the connectors, and it maps each operational concept to the exact input field names and status enumerations the skills accept. Where a behaviour is a safety default rather than a business rule, it is called out as such.

## The external request contract

Every property-operations skill returns the same envelope, defined once in the shared hotel schema. Reading it correctly is the first requirement of working with this assistant:

| Field | Meaning |
| --- | --- |
| `success` | Whether the operation completed |
| `status` | `dry-run`, `live`, or `error` |
| `system` | The hotel system that handled it, e.g. `hotel-pms` |
| `action` | The high-level action the connector executed |
| `request.input` | The input actually sent |
| `request.endpoint`, `request.method` | Resolved transport details |
| `request.headers` | Redacted headers only |
| `response.status`, `response.data` | Upstream HTTP status and parsed body |
| `error` | Failure message, or null |

Two rules about the envelope. A `dry-run` status with `success: true` means the request validated and nothing was mutated. A `success: true` with a null `response` means the work was done against local state and no upstream call happened; local stores are not the system of record, and that distinction must survive into any guest-facing or owner-facing report.

## Room status state machine

Room status accepts exactly seven values: `available`, `occupied`, `reserved`, `cleaning`, `clean`, `inspected`, and `out-of-order`.

```
reserved  ──arrival──>  occupied
occupied  ──departure──>  cleaning ──> clean ──inspect──> inspected ──> available
any state ──defect──>  out-of-order ──repair──> cleaning
```

The critical rule is that saleable inventory is gated on housekeeping state. A room in `cleaning` or `clean` is not sellable; it reaches saleable only at `inspected`. A property that allows `clean` to be sold loses the inspection control entirely, and that control is the last point at which a defect is caught before a guest finds it.

`out-of-order` removes the room from sale entirely and is distinct from an unsold but available room. It is the correct status for a room unsellable for any reason including maintenance, deep clean, or staffing, and it should carry a `notes` entry explaining why so the next shift does not re-investigate.

Out-of-order rooms must be excluded from the `availableRooms` figure used in RevPAR calculations. A room held out of order shrinks the denominator and inflates occupancy, which makes an operational problem look like a revenue-management win.

Status changes write `roomId`, `status`, `notes`, and an ISO 8601 `updatedAt` into the `room_statuses` store. The `notes` field is the audit trail; leave it populated on every manual change, and never overwrite a note you did not write.

## Reservation and folio lifecycle

The reservations router handles the full booking lifecycle against a single PMS endpoint. Its inputs cover:

- Identity: `reservationId`, `guestId`, `guestName`, `email`, `phone`.
- Stay dates: `checkIn` and `checkOut`, accepted in ISO 8601 or plain `YYYY-MM-DD`.
- Product: `roomType`, `channel`, `currency`.
- Money: `amount`, `paymentMethod`, and a `lineItems` array of `description`, `quantity`, `unitPrice`, and `amount`.
- Scope: `dateRange`, `filters`, `data`, and a `payload` escape hatch for connector-specific fields.

Operating practices that matter more than the field names:

- Validate that `checkOut` is strictly after `checkIn` before dispatch. A same-day or reversed stay creates a phantom room night in every downstream metric.
- Keep the folio line items as the billing truth. `amount` on the reservation is a total; the `lineItems` array is what reconciles.
- `channel` is the field the revenue advisory slices by. A reservation created without a channel is invisible in the channel-mix analysis.
- `currency` is a three-letter code, and mixed-currency folios must be converted once, at a stated rate and date, before entering the revenue records.
- `roomType` must map to a physical room-type code the property actually maintains. An unmappable type produces a reservation that no housekeeper can turn over.

Arrival marks a room `occupied`; departure moves it to `cleaning` and starts the housekeeping clock. Both are status changes on the room-status skill, not fields on the reservation.

## Rate plans, channel managers, and the night audit

Three PMS-adjacent concepts the assistant's fields depend on:

- **Rate plan** is the sellable product: room type plus cancellation terms plus inclusions. It is not the same as a room type, and it is not the same as a corporate rate code. A negotiated rate plan belongs in the rate plan, not in a note on the reservation.
- **Channel manager** is the intermediary between the PMS and distribution channels. It owns channel availability parity, so a rate change is only complete when the channel manager confirms it. A rate published directly in the PMS will not appear on the OTA.
- **Night audit** closes the business date and posts the prior day's activity into the revenue figures. Data for the current business date is provisional until the audit runs, and any revenue query spanning yesterday should state whether the audit has completed. This is the single most common source of "the numbers changed this morning" disputes.

## Overbooking and inventory control

Overbooking is a function of sellable inventory, so it inherits every discipline above. The rules that keep it safe:

- The sellable-allotment calculation must be recomputed whenever a room goes out of order, and the delta communicated to distribution immediately.
- Overbooking is a property-level decision with a defined ceiling; a single channel exceeding its share is a routing problem, not a reason to raise the total.
- Walked arrivals need a documented recovery path and a named owner. A walk without a recovery script is a complaint and a chargeback.
- The clerk-versus-sellable distinction must be explicit in the system: a clerk is a room out of inventory for a reason, and it still counts as physical inventory for staffing and consumable planning.

## Cash handling and night-shift operations

The assistant does not touch payment settlement, and it should not be given a settlement endpoint. It does carry `amount`, `paymentMethod`, and `lineItems`, which are folio-data fields. The boundary worth holding: an assistant may read and stage a folio adjustment, and an actual refund or settlement runs through the authorised cashier or payments system with its own dual-control approval. Cardholder data never belongs in a free-text note, a `notes` field, or a communication body.

## Supply and inventory reorder

The inventory manager tracks items with `itemId`, `category`, `quantity`, `unit`, and `minStockLevel`. The reorder signal is a strict comparison: an item is surfaced as `lowStock` when `quantity` is less than `minStockLevel`. Equality does not trigger.

The stored item defaults `minStockLevel` to 10 when the caller does not supply one. Treat that as a placeholder, not a par level.

Sizing a par level properly uses three inputs:

- **Consumption per occupied room**, by item: linen sets, towel sets, toiletries, and coffee capsules per stay, plus par and consumable levels.
- **Occupancy forecast** for the reorder horizon, from the same RevPAR and occupancy machinery as the revenue advisory.
- **Lead time and delivery cadence** from the vendor, expressed in the same unit as the `quantity` field.

Consumption per room multiplied by forecast occupied rooms over the lead time, plus a safety stock allowance, gives the reorder point. The `filters` object supports a below-threshold query so a single request can return everything needing action. Note that the store's quantity is an absolute level rather than a delta, so a stock count and an adjustment use the same field and the caller is responsible for the arithmetic.

## Guest experience and concierge

Guest-service requests accept a `category` of `dining`, `transport`, `attractions`, `events`, `wellness`, `shopping`, `business`, or `emergency`; an `urgency` of `low`, `medium`, `high`, or `urgent`; and a `location` with `address`, `latitude`, and `longitude`, plus a `radiusKm` and a minimum `rating` on a zero-to-five scale.

Communications accept `channel` across `email`, `sms`, `push`, `portal`, `phone`, and `whatsapp`, with `templateId`, `subject`, `message`, a `variables` object for templating, and an optional ISO 8601 `scheduledAt`.

Three rules. The `emergency` category and the `urgent` urgency are not dispatch instructions: route any guest emergency to the property's on-duty manager through the human escalation path, not through a messaging channel. SMS is not a channel for anything containing a reservation confirmation, folio detail, or anything a guest did not expect; confirm the guest's channel preference before using it, and honour opt-outs. And a scheduled send whose `scheduledAt` has passed should be revalidated before dispatch rather than sent late with stale content.

## Maintenance work orders

The maintenance dispatcher carries a full lifecycle: `create`, `update`, `assign`, `dispatch`, `complete`, `close`, `resolve`, and `escalate`, over statuses `open`, `assigned`, `in-progress`, `on-hold`, `completed`, `closed`, `resolved`, and `escalated`.

Severity runs `minor`, `moderate`, `major`, `critical`; priority runs `low`, `medium`, `high`, `urgent`, `emergency`. These are different axes and conflating them is a common failure. Severity describes the defect. Priority describes the guest and revenue impact of leaving it unrepaired, so a dripping tap in an occupied room on a sold-out night is a `major` severity and a `urgent` priority.

`category` names the trade: `hvac`, `plumbing`, `electrical`, or a property-specific list. `location` carries `label`, `floor`, and `roomNumber`; populating all three is what makes a work order routable by a technician working a floor rather than a building. `dueTime` and `scheduledAt` are both ISO 8601, and `estimatedMinutes` is a positive integer used for dispatch load balancing.

`closed` and `resolved` are distinct terminal states in the enumeration: resolved means the fault is fixed, closed means the work order is administratively finished and paperwork complete. Collapsing them loses the ability to report a backlog of open-but-fixed items.

Room-affecting work orders should transition the room to `out-of-order` when the defect makes it unsellable, and back through `cleaning` on completion. Leaving a room `occupied` or `available` while it is under an open critical work order is how a room gets sold twice.

## Preventive maintenance

Preventive schedules are not modelled as a separate entity; they are recurring work orders carrying a future `scheduledAt`. Two practices keep them from being displaced by reactive work: preventive tasks are created ahead of the reactive queue rather than inserted into it, and the dispatcher load balance reserves technician capacity for them. A preventive schedule that is rebooked every time a guest reports a leaking tap was never a preventive schedule.

## Configuring this

Connector endpoints, the PMS provider selection, the API version, the confirm-before-send flag, and the persisted store locations are all deployment configuration carried in each skill's `configSchema`. Dry-run defaulting to true, the confirmation requirement for live mutations, the seven-value status enumeration, and the emergency exclusions are behavioural defaults baked into the skills; they are the guard rails that keep a mis-scoped request from reaching a live PMS, so they are not intended to be relaxed by configuration. Redacted headers in the request block are a hard invariant, not a preference.
