# Event Assistant Documentation (Version 9)

**Assistant ID:** `event`
**Assistant Name:** Event Logistics & Operations Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Event Logistics & Operations Assistant manages end-to-end event production, including venue budgeting, banquet event order (BEO) specs, vendor contracts, attendee check-in scans, floorplan seating chart adjustments, and day-of incident logging.

---

## 2. Domain Knowledge

The Event Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/beo-specifications.md`**: Banquet Event Order (BEO) formatting, catering line item calculations, AV specs, and setup/teardown schedules.
2. **`knowledge/crowd-safety-standards.md`**: Maximum occupancy limits, emergency egress clearance, security ratios, and ADA compliance rules.
3. **`knowledge/vendor-contract-clauses.md`**: Event insurance indemnity rules, force majeure terms, cancellation penalties, and attrition rate calculations.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `event-planning-budgeting`
* **Purpose:** Calculates itemized event production budgets, revenue projections, and venue space requirements.
* **Tier:** `advise`
* **Trigger:** **User** — Event plan initiated
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "venueSpecs": { "type": "object", "description": "Square footage, capacity, hourly rates" },
      "budgetData": { "type": "object", "description": "Target ceiling and category allocations" },
      "guestCount": { "type": "number" }
    },
    "required": ["guestCount"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal event budgeting rules
* **Produces:** Detailed line-item budget breakdown, cost-per-head breakdown, and margin analysis.

### 3.2 `event-vendor-contract-management`
* **Purpose:** Evaluates vendor bids, tracks contract milestones, and dispatches vendor comms.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Vendor milestone reached
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "vendorData": { "type": "object" },
      "contractTerms": { "type": "object" }
    },
    "required": ["vendorData", "contractTerms"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Vendor portal APIs
* **Produces:** Verified contract comparison matrix and automated vendor dispatch logs.

### 3.3 `event-checkin-guest`
* **Purpose:** Processes attendee check-in scans, verifies badge status, and updates live attendance lists.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — QR scan / guest arrival
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "guestId": { "type": "string" },
      "ticketType": { "type": "string" }
    },
    "required": ["guestId"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Ticketing API
* **Produces:** Verified check-in confirmation and badge printing print commands.

### 3.4 `event-update-seating`
* **Purpose:** Dynamically reassigns attendee seating on spatial event floorplans.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Seating change requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "guestId": { "type": "string" },
      "targetTable": { "type": "string" }
    },
    "required": ["guestId", "targetTable"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Floorplan seating API
* **Produces:** Updated table assignment matrix and graphic layout payload.

### 3.5 `event-log-incident`
* **Purpose:** Records day-of operational incidents, safety hazards, and AV disruptions into real-time incident logs.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **User** — Incident reported
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "incidentDetails": { "type": "string" },
      "severity": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
      "location": { "type": "string" }
    },
    "required": ["incidentDetails", "severity"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Operations log API
* **Produces:** Formal timestamped incident entry and notification payload.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Event Assistant currently operates via higher-order skills integrating directly with ticketing, floorplan, and operations endpoints.)*

---

## 5. Major Data Types & Contracts

### 5.1 Banquet Event Order (BEO) Schema
```typescript
interface BanquetEventOrder {
  eventId: string;
  eventName: string;
  date: string;
  headcount: number;
  schedule: Array<{ time: string; activity: string; location: string }>;
  cateringMenu: Array<{ item: string; qty: number; unitPrice: number }>;
  avRequirements: string[];
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Day-of operational tools like `event-checkin-guest` require ultra-low latency (<200ms) execution; LLM reasoning overhead should be bypassed for direct barcode scans.
   - Floorplan seating updates lack collision detection for table capacity limits in basic schema definitions.

2. **Enhancement Opportunities:**
   - Implement real-time WebSocket broadcasting for guest check-in counters.
   - Integrate spatial floorplan rendering engine to generate visual SVG seating maps.
