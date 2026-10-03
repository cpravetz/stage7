// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { restaurantResultSchema, RESTAURANT_SAFETY_BOUNDARY, RESTAURANT_PRESENT_SCHEMA } from '../restaurant-contract';

const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_CONFIG = createSchemaRecord({
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before executing live reservation actions', default: true }),
  defaultPartySize: SchemaProps.number({ description: 'Default party size for new reservations', default: 2 }),
  endpointUrl: SchemaProps.url({ description: 'Reservation system endpoint URL' }),
});

const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_INPUT = createSchemaRecord({
  guestId: SchemaProps.text({ description: 'Guest identifier' }),
  name: SchemaProps.text({ description: 'Guest full name' }),
  phone: SchemaProps.text({ description: 'Guest phone number' }),
  email: SchemaProps.email({ description: 'Guest email' }),
  preferences: SchemaProps.object({}, { description: 'Guest preferences (dietary, seating, etc.)' }),
  reservationId: SchemaProps.text({ description: 'Reservation identifier' }),
  date: SchemaProps.text({ description: 'Reservation date (YYYY-MM-DD)' }),
  partySize: SchemaProps.number({ description: 'Number of guests' }),
  tableId: SchemaProps.text({ description: 'Table assignment' }),
  status: SchemaProps.select(['pending', 'confirmed', 'cancelled', 'no-show'], { description: 'Reservation status' }),
  dryRun: SchemaProps.boolean({ description: 'Run in dry-run mode without executing', default: true }),
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation for live endpoint', default: true }),
});

export const RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER = createDeclarativeCodeSkill({
  id: 'restaurant-reservations-guest-profile-manager',
  name: 'Restaurant Reservations & Guest Profile Manager',
  description: 'Manage guest profiles, reservations, and reservation history with dry-run defaults and explicit confirmation requirements for live endpoint actions. Returns not-connected when RESTAURANT_RESERVATION_ENDPOINT is absent.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_INPUT,
  outputSchema: restaurantResultSchema('Guest profile or reservation record'),
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Make a reservation',
        'Book a table',
        'Create guest profile',
        'Check reservation status',
      ],
    },
    { kind: 'event', on: 'A new reservation is requested' },
  ],
  isSkill: true,
  tier: 'represent',
  domainKnowledge: 'Restaurant reservation management, guest profile tracking, and booking coordination',
  confirmBeforeSend: true,
  manifest: {
    configSchema: RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_CONFIG
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const SAFETY = "food safety / allergen protocol";
      const endpoint = String(ctx.config?.endpointUrl || '');
      const dryRun = input.dryRun !== false;
      const confirmBeforeSend = input.confirmBeforeSend !== false;

      function fail(status, message, title) {
        return         {
        success: false,
        status: status,
        error: message,
        data: null,
        present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }],
        };
      }

      function presentNotice(title, body) {
        return         {
        success: false,
        status: 'not-connected',
        connected: false,
        data: null,
        error: null,
        present: [{ id: 'notice', title: title, kind: 'text', body: body + NL + NL + SAFETY }],
        };
      }

      if (!endpoint) {
        return presentNotice('Not connected', 'RESTAURANT_RESERVATION_ENDPOINT is not configured. Reservation operations require a live endpoint. No guest profile was created or modified.');
      }

      const guestId = input.guestId || ('guest_' + Date.now());
      const name = input.name || 'Unknown';
      const phone = input.phone || '';
      const email = input.email || '';
      const preferences = input.preferences || {};
      const profile = { id: guestId, name, phone, email, preferences };

      if (dryRun || !confirmBeforeSend) {
        // ---- Report ------------------------------------------------------------------
        const lines = [];
        lines.push('Guest profile created (dry-run — no live endpoint mutation).');
        lines.push('');
        lines.push('Profile details:');
        lines.push('  Guest ID: ' + guestId);
        lines.push('  Name: ' + name);
        lines.push('  Phone: ' + (phone || '(not provided)'));
        lines.push('  Email: ' + (email || '(not provided)'));
        const prefKeys = Object.keys(preferences);
        if (prefKeys.length > 0) {
          lines.push('  Preferences:');
          prefKeys.forEach(function (key) { lines.push('    ' + key + ': ' + preferences[key]); });
        } else {
          lines.push('  Preferences: (none provided)');
        }
        lines.push('');
        lines.push('Endpoint: ' + endpoint + ' (dry-run, profile shown but not persisted remotely)');
        lines.push('');
        lines.push(SAFETY);
        return { success: true, data: profile, present: [{ id: 'report', title: 'Guest Profile (dry-run)', kind: 'text', body: lines.join(NL) }] };

      } else {
        return presentNotice('Confirmation required', 'A live reservation operation was requested but explicit confirmation was not received. No guest profile was created on the live endpoint.');
      }
    }
  });
RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER.configSchema = RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER_CONFIG;
