# Restaurant Assistant Documentation (Version 9)

**Assistant ID:** `restaurant`
**Assistant Name:** Restaurant Operations & Foodservice Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Restaurant Operations & Foodservice Assistant optimizes commercial kitchen and dining room performance. It performs menu item profitability and margin engineering, builds shift prep checklists, handles table reservations and guest VIP profiles, manages food inventory reorder purchase orders, and evaluates P&L financial forecasts.

---

## 2. Domain Knowledge

The Restaurant Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/prime-cost-formulas.md`**: Formulas for Cost of Goods Sold (COGS), prime cost targets (55-60%), labor cost percentages, and yield calculations.
2. **`knowledge/food-safety-guidelines.md`**: ServSafe HACCP temperature control thresholds, cross-contamination prevention protocols, and storage time limits.
3. **`knowledge/kitchen-prep-standards.md`**: Station prep sheet conventions, par level formulas based on projected cover count, and batch cooking instructions.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `restaurant-menu-engineering-cost-strategist`
* **Purpose:** Analyzes menu item popularity and profitability (Stars, Plowhorses, Puzzles, Dogs) to optimize menu layouts and pricing.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly menu review
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "menuId": { "type": "string" },
      "items": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["items"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal cost calculation engine
* **Produces:** Menu matrix matrix report, dish margin recommendations, and pricing adjustments.

### 3.2 `restaurant-shift-prep-list-copilot`
* **Purpose:** Generates station prep checklists based on POS sales forecasts and target par levels.
* **Tier:** `aid`
* **Trigger:** **Schedule** — Daily prep run
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "dateRange": { "type": "string" },
      "station": { "type": "string", "description": "e.g., Grill, Saute, Pantry, Bar" },
      "forecastData": { "type": "object" }
    },
    "required": ["station", "forecastData"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** POS sales data
* **Produces:** Station prep quantity checklist, batch recipe scaling factors, and shift labor assignments.

### 3.3 `restaurant-manage-reservation`
* **Purpose:** Processes table reservation bookings, modifications, and cancellations.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Booking request received
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "partySize": { "type": "number" },
      "guestName": { "type": "string" },
      "time": { "type": "string" }
    },
    "required": ["partySize", "guestName", "time"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Reservation API (OpenTable / SevenRooms)
* **Produces:** Reservation confirmation payload and seating assignment.

### 3.4 `restaurant-update-guest-profile`
* **Purpose:** Updates guest loyalty data, dietary allergies, favorite tables, and VIP notes.
* **Tier:** `aid`
* **Trigger:** **User** — Profile edit requested
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "guestId": { "type": "string" },
      "dietaryPreferences": { "type": "array", "items": { "type": "string" } },
      "vipStatus": { "type": "boolean" }
    },
    "required": ["guestId"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Guest CRM database
* **Produces:** Updated guest profile record.

### 3.5 `restaurant-supply-chain-inventory-reorder-manager`
* **Purpose:** Monitors ingredient stock levels and issues purchase order drafts to vendors when stock drops below par levels.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Low inventory threshold reached
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "item": { "type": "string" },
      "quantity": { "type": "number" },
      "supplier": { "type": "string" }
    },
    "required": ["item", "quantity", "supplier"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Inventory management API
* **Produces:** Formatted supplier Purchase Order (PO) draft and reorder logs.

### 3.6 `restaurant-financial-forecast-evaluator`
* **Purpose:** Evaluates prime costs, food sales mix, labor expenditure, and monthly financial P&L statements.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly financial run
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "dateRange": { "type": "string" },
      "department": { "type": "string" }
    },
    "required": ["dateRange"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Financial modeling engine
* **Produces:** P&L summary, variance report, and operational cost recommendations.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Restaurant Assistant interacts directly with POS, inventory, and reservation endpoints configured via higher-order skills.)*

---

## 5. Major Data Types & Contracts

### 5.1 Menu Engineering Matrix Item
```typescript
interface MenuEngineeringItem {
  itemId: string;
  name: string;
  category: 'star' | 'plowhorse' | 'puzzle' | 'dog';
  recipeCost: number;
  sellingPrice: number;
  contributionMargin: number;
  salesVolumeUnit: number;
  menuMixPercentage: number;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Real-time POS integration relies on batch polling schedules rather than webhooks for instant order updates.
   - Ingredient cost fluctuations require manual updates in recipe databases rather than auto-syncing with vendor invoices.

2. **Enhancement Opportunities:**
   - Integrate OCR invoice parsing (e.g. Toast / Restaurant365 invoice scan) to continuously update recipe ingredient prices.
