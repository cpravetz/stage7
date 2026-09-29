import { createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import {
  HOTEL_EXTERNAL_CONFIG_SCHEMA,
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_PROPERTY_BASE_INPUT,
  withConfirmation,
} from './hotel-external-common';

const INVENTORY_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  itemId: SchemaProps.text({ description: 'Inventory item identifier' }),
  category: SchemaProps.text({ description: 'Inventory category, such as linen, amenities, or housekeeping supplies' }),
  quantity: SchemaProps.number({ description: 'Inventory quantity to adjust', minimum: 0 }),
  unit: SchemaProps.text({ description: 'Inventory quantity unit, such as each, case, or liter' }),
  minStockLevel: SchemaProps.number({ description: 'Minimum stock threshold used to surface reorder needs', minimum: 0 }),
  notes: SchemaProps.textarea({ description: 'Stock count or adjustment note' }),
  filters: SchemaProps.object({}, { description: 'Inventory query filters, such as category or below-threshold', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Inventory-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const INVENTORY_MANAGER_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-inventory-manager',
  name: 'Supply & Inventory Reorder',
  description: 'Adjust hotel supply and housekeeping stock quantities and list stock that has fallen below its reorder threshold. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'inventory',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: INVENTORY_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  configSchema: HOTEL_EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 45000,
  tier: 'represent',
  domainKnowledge: 'Hotel supply chain: par levels and reorder thresholds, linen and amenity consumption rates per occupied room, stock count reconciliation, and vendor lead-time planning.',
  triggers: [
    { kind: 'event', on: 'Inventory item falls below its minimum stock level' },
    { kind: 'schedule', cadence: 'daily' },
    { kind: 'user', phrase_examples: ['Check linen stock levels', 'Adjust towel count to 400', 'List supplies below reorder threshold'] },
  ],
  isSkill: true,
}));
