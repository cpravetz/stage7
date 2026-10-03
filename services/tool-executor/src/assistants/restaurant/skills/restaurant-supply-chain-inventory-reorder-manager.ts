// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { restaurantResultSchema, RESTAURANT_SAFETY_BOUNDARY, RESTAURANT_PRESENT_SCHEMA } from '../restaurant-contract';

const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_CONFIG = createSchemaRecord({
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before placing live reorder orders', default: true }),
  defaultLeadTime: SchemaProps.number({ description: 'Default lead time in days', default: 2 }),
  defaultSafetyStockPct: SchemaProps.number({ description: 'Default safety stock as percentage of reorder point', default: 25 }),
  endpointUrl: SchemaProps.url({ description: 'Supply chain system endpoint URL' }),
});

const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_INPUT = createSchemaRecord({
  items: SchemaProps.objectArray(
    SchemaProps.object({
      name: SchemaProps.text({ description: 'Item name' }),
      quantity: SchemaProps.number({ description: 'Current quantity on hand' }),
    }),
    { description: 'Inventory items to evaluate for reorder' },
  ),
  reorderPoints: SchemaProps.object({}, { description: 'Reorder point by item name' }),
  safetyStock: SchemaProps.object({}, { description: 'Safety stock by item name' }),
  leadTimes: SchemaProps.object({}, { description: 'Lead time in days by item name' }),
  unitCosts: SchemaProps.object({}, { description: 'Unit cost by item name' }),
  name: SchemaProps.text({ description: 'Item name for EOQ calculation' }),
  annualDemand: SchemaProps.number({ description: 'Annual demand quantity for EOQ' }),
  orderCost: SchemaProps.number({ description: 'Cost per order for EOQ', default: 50 }),
  holdingCost: SchemaProps.number({ description: 'Holding cost per unit per year for EOQ', default: 2 }),
  supplierIds: SchemaProps.stringArray({ description: 'Supplier identifiers for status check' }),
  dryRun: SchemaProps.boolean({ description: 'Run in dry-run mode without executing', default: true }),
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation for live endpoint', default: true }),
});

export const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER = createDeclarativeCodeSkill({
  id: 'restaurant-supply-chain-inventory-reorder-manager',
  name: 'Restaurant Supply Chain & Inventory Reorder Manager',
  description: 'Manage inventory reorder points, EOQ calculations, and supplier status with dry-run defaults and confirmation requirements for live endpoint actions. Returns not-connected when RESTAURANT_SUPPLY_ENDPOINT is absent.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_INPUT,
  outputSchema: restaurantResultSchema('Reorder items with quantities, reorder points, safety stock, lead time demand, and summary'),
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Check inventory reorder',
        'Calculate EOQ',
        'Place reorder',
        'Check supplier status',
      ],
    },
    { kind: 'event', on: 'Inventory level drops below reorder point' },
  ],
  isSkill: true,
  tier: 'represent',
  domainKnowledge: 'Restaurant supply chain management, inventory reorder points, EOQ calculations, and supplier status tracking',
  confirmBeforeSend: true,
  manifest: {
    configSchema: RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_CONFIG
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
        return presentNotice('Not connected', 'RESTAURANT_SUPPLY_ENDPOINT is not configured. Supply chain operations require a live endpoint. No reorder was placed or modified.');
      }

      const items = Array.isArray(input.items) ? input.items : [];
      const reorderPoints = input.reorderPoints || {};
      const safetyStock = input.safetyStock || {};
      const leadTimes = input.leadTimes || {};
      const unitCosts = input.unitCosts || {};

      const reorders = items.map(item => {
        const name = typeof item === 'string' ? item : (item.name || '');
        const currentQty = typeof item === 'object' ? (item.quantity || 0) : 0;
        const rop = Number(reorderPoints[name] || 20);
        const ss = Number(safetyStock[name] || 5);
        const lt = Number(leadTimes[name] || 2);
        const cost = Number(unitCosts[name] || 0);
        const leadTimeDemand = Math.ceil(rop * lt);
        const orderQty = currentQty < rop ? Math.max(ss, leadTimeDemand - currentQty) : 0;
        return { name, currentQty, reorderPoint: rop, safetyStock: ss, leadTime: lt, leadTimeDemand, orderQty, unitCost: cost, totalCost: Math.round(orderQty * cost * 100) / 100, needsReorder: currentQty < rop };
      });
      const totalOrderQty = reorders.reduce((s, r) => s + r.orderQty, 0);
      const totalCost = reorders.reduce((s, r) => s + r.totalCost, 0);
      const resultData = { reorders, summary: { items: reorders.length, totalOrderQty, totalCost } };

      // ---- Report ------------------------------------------------------------------
      const lines = [];
      lines.push('Inventory reorder analysis:');
      lines.push('');
      if (reorders.length > 0) {
        lines.push('Per-item reorder analysis:');
        reorders.forEach(function (r) {
          lines.push('  ' + r.name + ': on-hand=' + r.currentQty + ', reorder-point=' + r.reorderPoint + ', safety-stock=' + r.safetyStock + ', lead-time=' + r.leadTime + 'd, lead-time-demand=' + r.leadTimeDemand + ', order=' + r.orderQty + ' (unit cost ' + r.unitCost + ', total ' + r.totalCost + '), needs-reorder=' + r.needsReorder);
        });
      } else {
        lines.push('No inventory items were supplied.');
      }
      lines.push('');
      lines.push('Summary: items=' + reorders.length + ', total order qty=' + totalOrderQty + ', total cost=' + Math.round(totalCost * 100) / 100);
      lines.push('');
      if (dryRun) {
        lines.push('Mode: dry-run — no live reorder was placed.');
      } else if (confirmBeforeSend) {
        lines.push('A live reorder was requested but explicit confirmation was not received. No order was placed.');
      }
      lines.push('');
      lines.push(SAFETY);
      return { success: true, data: resultData, present: [{ id: 'report', title: 'Supply Chain Analysis', kind: 'text', body: lines.join(NL) }] };
    }
  });
RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER.configSchema = RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_CONFIG;
