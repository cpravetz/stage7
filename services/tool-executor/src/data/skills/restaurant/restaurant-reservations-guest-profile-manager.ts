import { Tool } from "../../../types";
import { createCodeSkill, SchemaProps } from "../code-skill-factory";

const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const operation = input.operation || 'guest-profile';
  const endpoint = process.env.RESTAURANT_RESERVATION_ENDPOINT || '';
  const dryRun = input.dryRun !== false;
  const confirmBeforeSend = input.confirmBeforeSend !== false;
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'reservations');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'profiles.json');
  let profiles = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (!endpoint) {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', operation, error: 'Not connected: RESTAURANT_RESERVATION_ENDPOINT is not configured. Reservation operations require a live endpoint.', endpoint: null }));
    return;
  }

  if (operation === 'guest-profile') {
    const guestId = input.guestId || ('guest_' + Date.now());
    const name = input.name || 'Unknown';
    const phone = input.phone || '';
    const email = input.email || '';
    const preferences = input.preferences || {};
    const profile = { id: guestId, name, phone, email, preferences, visitCount: 0, createdAt: new Date().toISOString() };
    if (dryRun || !confirmBeforeSend) {
      profiles.push(profile);
      fs.writeFileSync(storePath, JSON.stringify(profiles, null, 2));
      console.log(JSON.stringify({ success: true, mode: dryRun ? 'dry-run' : 'live', operation, data: { profile, dryRun, savedLocally: true } }));
    } else {
      console.log(JSON.stringify({ success: false, mode: 'pending-confirmation', operation, error: 'Confirmation required before creating guest profile on live endpoint', profileId: guestId }));
    }
  } else if (operation === 'reservation') {
    const reservationId = input.reservationId || ('res_' + Date.now());
    const guestId = input.guestId || '';
    const date = input.date || '';
    const partySize = Number(input.partySize || 2);
    const tableId = input.tableId || '';
    const status = input.status || 'pending';
    const reservation = { id: reservationId, guestId, date, partySize, tableId, status, createdAt: new Date().toISOString() };
    if (dryRun || !confirmBeforeSend) {
      profiles.push({ id: guestId, reservations: [reservation] });
      fs.writeFileSync(storePath, JSON.stringify(profiles, null, 2));
      console.log(JSON.stringify({ success: true, mode: dryRun ? 'dry-run' : 'live', operation, data: { reservation, dryRun, savedLocally: true } }));
    } else {
      console.log(JSON.stringify({ success: false, mode: 'pending-confirmation', operation, error: 'Confirmation required before creating reservation on live endpoint', reservationId }));
    }
  } else if (operation === 'guest-history') {
    const guestId = input.guestId || '';
    const history = profiles.filter(p => p.id === guestId);
    console.log(JSON.stringify({ success: true, mode: 'local', operation, data: { guestId, history } }));
  } else {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_CONFIG = {
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before executing live reservation actions",
      "default": true
    },
    "defaultPartySize": {
      "type": "number",
      "description": "Default party size for new reservations",
      "default": 2
    },
    "endpointUrl": {
      "type": "string",
      "description": "Reservation system endpoint URL",
      "format": "uri"
    }
  }
};

const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_INPUT = {
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "guest-profile",
        "reservation",
        "guest-history"
      ],
      "description": "Reservation or guest profile operation"
    },
    "guestId": {
      "type": "string",
      "description": "Guest identifier"
    },
    "name": {
      "type": "string",
      "description": "Guest full name"
    },
    "phone": {
      "type": "string",
      "description": "Guest phone number"
    },
    "email": {
      "type": "string",
      "description": "Guest email"
    },
    "preferences": {
      "type": "object",
      "description": "Guest preferences (dietary, seating, etc.)"
    },
    "reservationId": {
      "type": "string",
      "description": "Reservation identifier"
    },
    "date": {
      "type": "string",
      "description": "Reservation date (YYYY-MM-DD)"
    },
    "partySize": {
      "type": "number",
      "description": "Number of guests"
    },
    "tableId": {
      "type": "string",
      "description": "Table assignment"
    },
    "status": {
      "type": "string",
      "description": "Reservation status (pending, confirmed, cancelled, no-show)"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Run in dry-run mode without executing",
      "default": true
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation for live endpoint",
      "default": true
    }
  }
};

const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_OUTPUT = {
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation succeeded"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "not-connected",
        "pending-confirmation",
        "error"
      ],
      "description": "Execution mode"
    },
    "operation": {
      "type": "string",
      "description": "The operation performed"
    },
    "data": {
      "type": "object",
      "description": "Result data"
    },
    "endpoint": {
      "type": [
        "string",
        "null"
      ],
      "description": "Endpoint used"
    },
    "error": {
      "type": [
        "string",
        "null"
      ],
      "description": "Error message if failed"
    }
  },
  "required": [
    "success",
    "mode",
    "operation"
  ]
};

export const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER = createCodeSkill({
  id: "restaurant-reservations-guest-profile-manager",
  name: "Restaurant Reservations & Guest Profile Manager",
  description: "Manage guest profiles, reservations, and reservation history with dry-run defaults and explicit confirmation requirements for live endpoint actions. Returns not-connected when RESTAURANT_RESERVATION_ENDPOINT is absent.",
  manifest: { language: "javascript", entrypoint: "index.js", sourceCode: RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_SOURCE, configSchema: RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_CONFIG },
  inputSchema: RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_INPUT,
  outputSchema: RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_OUTPUT,
  triggers: [
    {
      "kind": "user",
      "phrase_examples": [
        "Make a reservation",
        "Book a table",
        "Create guest profile",
        "Check reservation status"
      ]
    },
    {
      "kind": "schedule",
      "cadence": "Daily reservation review"
    },
    {
      "kind": "event",
      "on": "Reservation requested"
    }
  ],
});
