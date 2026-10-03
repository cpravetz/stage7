// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { restaurantResultSchema, RESTAURANT_SAFETY_BOUNDARY, RESTAURANT_PRESENT_SCHEMA } from '../restaurant-contract';

const RESTAURANT_SHIFT_PREP_LIST_COPILOT_CONFIG = createSchemaRecord({
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before submitting prep orders', default: false }),
  defaultShift: SchemaProps.text({ description: 'Default shift for prep generation', default: 'all' }),
  autoReorderThreshold: SchemaProps.number({ description: 'Auto-reorder when shortage exceeds this value', default: 0 }),
});

const RESTAURANT_SHIFT_PREP_LIST_COPILOT_INPUT = createSchemaRecord({
  date: SchemaProps.text({ description: 'Date (YYYY-MM-DD)' }),
  forecastCovers: SchemaProps.number({ description: 'Forecasted number of covers' }),
  prepRatios: SchemaProps.object({}, { description: 'Prep quantity ratio per cover by item name' }),
  currentStock: SchemaProps.object({}, { description: 'Current stock levels by item name' }),
  shift: SchemaProps.select(['breakfast', 'lunch', 'dinner', 'all'], { description: 'Shift name', default: 'all' }),
  openCovers: SchemaProps.number({ description: 'Expected open covers for allocation' }),
  serviceDuration: SchemaProps.number({ description: 'Service duration in minutes', default: 90 }),
  staffPerCover: SchemaProps.number({ description: 'Staff required per cover', default: 0.2 }),
  availableStaff: SchemaProps.number({ description: 'Available staff count' }),
});

export const RESTAURANT_SHIFT_PREP_LIST_COPILOT = createDeclarativeCodeSkill({
  id: 'restaurant-shift-prep-list-copilot',
  name: 'Restaurant Shift Prep List Copilot',
  description: 'Generate shift prep lists from forecasted covers and prep ratios, compute shortages, and allocate staff based on cover volume and service duration with deterministic calculations.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: RESTAURANT_SHIFT_PREP_LIST_COPILOT_INPUT,
  outputSchema: restaurantResultSchema('Prep items with quantities, shortages, order quantities, and totals'),
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Generate prep list',
        'Check shift inventory',
        'Plan prep for tomorrow',
        'Allocate staff',
      ],
    },
    { kind: 'schedule', cadence: 'Daily shift prep list generation' },
  ],
  isSkill: true,
  tier: 'aid',
  domainKnowledge: 'Restaurant shift planning, prep list generation, and staff allocation based on cover forecasts',
  confirmBeforeSend: false,
  manifest: {
    configSchema: RESTAURANT_SHIFT_PREP_LIST_COPILOT_CONFIG
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const SAFETY = "food safety / allergen protocol";

      function fail(status, message, title) {
        return         {
        success: false,
        status: status,
        error: message,
        data: null,
        present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }],
        };
      }

      const date = input.date || new Date().toISOString().split('T')[0];
      const forecastCovers = Number(input.forecastCovers || 0);
      const prepRatios = input.prepRatios || {};
      const currentStock = input.currentStock || {};
      const shift = input.shift || 'all';

      if (forecastCovers <= 0 && Object.keys(prepRatios).length === 0) {
        return fail('not-connected', 'Not connected: forecast covers and prep ratios are required to generate a prep list.', 'Input required');
      }

      const items = Object.keys(prepRatios).map(name => {
        const ratio = Number(prepRatios[name] || 0);
        const needed = Math.ceil(forecastCovers * ratio);
        const onHand = Number(currentStock[name] || 0);
        return { name, forecastCovers, prepRatio: ratio, quantityNeeded: needed, quantityOnHand: onHand, shortage: Math.max(0, needed - onHand), orderQty: Math.max(0, needed - onHand) };
      });
      const totalNeeded = items.reduce((s, i) => s + i.quantityNeeded, 0);
      const totalOnHand = items.reduce((s, i) => s + i.quantityOnHand, 0);
      const totalShortage = items.reduce((s, i) => s + i.shortage, 0);
      const prep = { id: 'prep_' + date + '_' + shift, date, shift, forecastCovers, items, totals: { items: items.length, quantityNeeded: totalNeeded, quantityOnHand: totalOnHand, shortage: totalShortage } };

      // ---- Report ------------------------------------------------------------------
      const lines = [];
      lines.push('Prep list for ' + shift + ' shift on ' + date + ' (covers: ' + forecastCovers + ').');
      lines.push('');
      if (items.length > 0) {
        lines.push('Per-item breakdown:');
        items.forEach(function (item) {
          lines.push('  ' + item.name + ': needed=' + item.quantityNeeded + ', on-hand=' + item.quantityOnHand + ', shortage=' + item.shortage + ', order=' + item.orderQty + ' (ratio ' + item.prepRatio + ' per cover)');
        });
      } else {
        lines.push('No prep items were supplied.');
      }
      lines.push('');
      lines.push('Totals: items=' + items.length + ', quantity needed=' + totalNeeded + ', on-hand=' + totalOnHand + ', shortage=' + totalShortage);
      lines.push('');
      lines.push(SAFETY);
      return { success: true, data: prep, present: [{ id: 'report', title: 'Shift Prep', kind: 'text', body: lines.join(NL) }] };
    }
  });
RESTAURANT_SHIFT_PREP_LIST_COPILOT.configSchema = RESTAURANT_SHIFT_PREP_LIST_COPILOT_CONFIG;
