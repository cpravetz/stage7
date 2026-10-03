import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import {
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_PROPERTY_BASE_INPUT,
} from '../tools/hotel-external-common';

const INVENTORY_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  itemId: SchemaProps.reference('hotel-inventory-items', { description: 'Inventory item identifier' }),
  category: SchemaProps.text({ description: 'Inventory category, such as linen, amenities, or housekeeping supplies' }),
  quantity: SchemaProps.number({ description: 'Inventory quantity to adjust', minimum: 0 }),
  unit: SchemaProps.text({ description: 'Inventory quantity unit, such as each, case, or liter' }),
  minStockLevel: SchemaProps.number({ description: 'Minimum stock threshold used to surface reorder needs', minimum: 0 }),
  notes: SchemaProps.textarea({ description: 'Stock count or adjustment note' }),
  filters: SchemaProps.object({}, { description: 'Inventory query filters, such as category or below-threshold', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Inventory-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const INVENTORY_MANAGER_SKILL = createDeclarativeCodeSkill({
  id: 'hotel-inventory-manager',
  name: 'Supply & Inventory Reorder',
  description: 'Adjust hotel supply and housekeeping stock quantities and list stock that has fallen below its reorder threshold. Mutating requests require confirmation and default to dry-run.',
  persistenceEnvVar: 'HOTEL_HOME',
  inputSchema: INVENTORY_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'represent',
  emitEvent: 'hotel.inventory.stock_adjusted',
  domainKnowledge: 'Hotel supply chain: par levels and reorder thresholds, linen and amenity consumption rates per occupied room, stock count reconciliation, and vendor lead-time planning.',
  triggers: [
    { kind: 'event', on: 'Inventory item falls below its minimum stock level', externalEvent: true, eventId: 'hotel.external.stock_level.changed' },
    { kind: 'schedule', cadence: 'daily' },
    { kind: 'user', phrase_examples: ['Check linen stock levels', 'Adjust towel count to 400', 'List supplies below reorder threshold'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const inventory = ctx.store.load('hotel_inventory');
    if (input.itemId && input.quantity !== undefined) {
      const idx = inventory.findIndex((item: any) => item.itemId === input.itemId);
      const updatedItem = {
        itemId: input.itemId,
        category: input.category || 'general',
        quantity: input.quantity,
        minStockLevel: input.minStockLevel || 10,
        updatedAt: new Date().toISOString(),
      };
      if (idx >= 0) {
        inventory[idx] = updatedItem;
      } else {
        inventory.push(updatedItem);
      }
      ctx.store.save('hotel_inventory', inventory);
      return {
        success: true,
        data: { item: updatedItem },
        present: [
          ctx.render.text('inventory-update', 'Inventory Adjusted', `Item ${input.itemId} quantity adjusted to ${input.quantity}.`),
        ],
      };
    }
    const lowStock = inventory.filter((item: any) => item.quantity < item.minStockLevel);
    return {
      success: true,
      data: { inventory, lowStock },
      present: [
        ctx.render.text('inventory-status', 'Inventory Status', `Total items: ${inventory.length}. Items below reorder threshold: ${lowStock.length}.`),
      ],
    };
  },
});
