# Hotel Assistant Documentation (Version 9)

**Assistant ID:** `hotel`
**Assistant Name:** Hotel Property & Guest Operations Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Hotel Property & Guest Operations Assistant manages hotel hospitality operations. It optimizes revenue yields (RevPAR / ADR), manages Property Management System (PMS) room bookings, maintains guest VIP profiles, coordinates housekeeping schedules, dispatches maintenance work orders, and oversees amenity inventory.

---

## 2. Domain Knowledge

The Hotel Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/revpar-adr-formulas.md`**: Revenue per Available Room (RevPAR), Average Daily Rate (ADR), occupancy rate formulas, yield management algorithms, and competitive set benchmarking.
2. **`knowledge/pms-operations-guide.md`**: Property Management System workflows (Oracle Opera / Cloudbeds), room status transitions (Clean, Dirty, Inspected, Out of Order), guest folio posting, and room assignment logic.
3. **`knowledge/housekeeping-sla-rules.md`**: Room cleaning time benchmarks by room type, turn-down service protocols, guest amenity refill standards, and priority dispatch rules.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `hotel-revenue-performance-advisory`
* **Purpose:** Evaluates occupancy and room pricing performance to recommend dynamic ADR adjustments.
* **Tier:** `advise`
* **Trigger:** **User** — Revenue review requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "propertyId": { "type": "string" },
      "adr": { "type": "number", "description": "Average Daily Rate" },
      "revpar": { "type": "number", "description": "Revenue Per Available Room" },
      "occupancy": { "type": "number", "description": "Occupancy rate percentage" }
    },
    "required": ["propertyId", "adr", "revpar", "occupancy"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Yield optimization engine
* **Produces:** ADR rightsizing recommendations and yield strategy report.

### 3.2 `hotel-guest-experience`
* **Purpose:** Handles guest concierge inquiries, dining recommendations, and service requests.
* **Tier:** `aid`
* **Trigger:** **Event** — Guest service message
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "guestProfile": { "type": "object" },
      "serviceRequests": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["guestProfile"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Concierge knowledge base
* **Produces:** Personalized guest responses and service dispatches.

### 3.3 `hotel-reservations-manager`
* **Purpose:** Processes room reservations, stay modifications, and cancellations in the PMS.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Room booking request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "partySize": { "type": "number" },
      "guestName": { "type": "string" },
      "dates": { "type": "object", "description": "Check-in and check-out dates" }
    },
    "required": ["partySize", "guestName", "dates"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** PMS API (Opera)
* **Produces:** Confirmed PMS room reservation payload.

### 3.4 `hotel-guest-profile-manager`
* **Purpose:** Updates guest loyalty tiers, stay preferences, and special occasion notes.
* **Tier:** `aid`
* **Trigger:** **User** — Loyalty update
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "guestId": { "type": "string" },
      "loyaltyTier": { "type": "string" },
      "preferences": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["guestId"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Guest CRM
* **Produces:** Updated guest profile record.

### 3.5 `hotel-maintenance-dispatcher`
* **Purpose:** Dispatches maintenance work orders for room equipment issues and tracks resolution.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Fault reported
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "roomId": { "type": "string" },
      "issue": { "type": "string" },
      "priority": { "type": "string", "enum": ["low", "medium", "high", "urgent"] }
    },
    "required": ["roomId", "issue", "priority"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Maintenance API
* **Produces:** Dispatched maintenance work order payload.

### 3.6 `hotel-room-status-manager`
* **Purpose:** Updates PMS room availability status (Dirty, Clean, Inspected, Out of Order).
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Status update
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "roomId": { "type": "string" },
      "status": { "type": "string", "enum": ["clean", "dirty", "inspected", "out_of_order"] }
    },
    "required": ["roomId", "status"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** PMS API
* **Produces:** Updated PMS room status payload.

### 3.7 `hotel-housekeeping-manager`
* **Purpose:** Assigns housekeeping cleaning schedules based on check-outs and priority guest arrivals.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Housekeeping dispatch
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "roomId": { "type": "string" },
      "assignee": { "type": "string" }
    },
    "required": ["roomId", "assignee"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** PMS API
* **Produces:** Housekeeping assignment dispatch record.

### 3.8 `hotel-inventory-manager`
* **Purpose:** Adjusts hotel amenity, linen, and minibar stock counts.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Stock adjustment
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "item": { "type": "string" },
      "quantity": { "type": "number" }
    },
    "required": ["item", "quantity"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Inventory API
* **Produces:** Updated amenity inventory ledger.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Hotel Assistant executes property workflows via higher-order skills connecting to Opera/PMS endpoints.)*

---

## 5. Major Data Types & Contracts

### 5.1 PMS Room State Schema
```typescript
interface PmsRoomState {
  roomId: string;
  roomNumber: string;
  roomType: 'king' | 'queen_double' | 'suite' | 'penthouse';
  status: 'clean' | 'dirty' | 'inspected' | 'out_of_order';
  currentOccupant?: { guestId: string; guestName: string; checkOutDate: string };
  assignedHousekeeper?: string;
  pendingMaintenanceOrders: number;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - PMS synchronization currently relies on pull polling; real-time webhooks for check-outs should be implemented.
   - Housekeeping SLAs need dynamic priority scoring based on incoming guest VIP status.

2. **Enhancement Opportunities:**
   - Add SMS messaging integrations (e.g. Twilio API) for direct guest communication.
