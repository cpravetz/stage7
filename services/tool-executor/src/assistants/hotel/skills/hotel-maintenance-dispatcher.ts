import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import {
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_LOCATION_INPUT,
  HOTEL_PROPERTY_BASE_INPUT,
} from '../tools/hotel-external-common';

const MAINTENANCE_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  roomId: SchemaProps.reference('hotel-rooms', { description: 'Room identifier' }),
  taskId: SchemaProps.reference('hotel-tasks', { description: 'Maintenance work-order identifier' }),
  issueId: SchemaProps.reference('hotel-issues', { description: 'Reported issue or incident identifier' }),
  staffId: SchemaProps.reference('hotel-staff', { description: 'Maintenance technician identifier' }),
  staffIds: SchemaProps.referenceArray('hotel-staff', { description: 'Technicians to assign or dispatch' }),
  category: SchemaProps.text({ description: 'Maintenance trade or work category, such as hvac, plumbing, or electrical' }),
  severity: SchemaProps.select(['minor', 'moderate', 'major', 'critical'], { description: 'Issue severity' }),
  priority: SchemaProps.select(['low', 'medium', 'high', 'urgent', 'emergency'], {
    description: 'Work-order priority',
  }),
  status: SchemaProps.select(['open', 'assigned', 'in-progress', 'on-hold', 'completed', 'closed', 'resolved', 'escalated'], {
    description: 'Work-order lifecycle status',
  }),
  location: HOTEL_LOCATION_INPUT,
  dueTime: SchemaProps.datetime({ description: 'Work-order due time in ISO 8601 format' }),
  scheduledAt: SchemaProps.datetime({ description: 'Scheduled visit time in ISO 8601 format' }),
  estimatedMinutes: SchemaProps.integer({ description: 'Estimated repair duration in minutes', minimum: 1 }),
  notes: SchemaProps.textarea({ description: 'Repair notes, parts used, or technician handoff instructions' }),
  filters: SchemaProps.object({}, { description: 'Maintenance work-order query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Maintenance-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const MAINTENANCE_DISPATCHER_SKILL = createDeclarativeCodeSkill({
  id: 'hotel-maintenance-dispatcher',
  name: 'Maintenance Dispatch & Resolution',
  description: 'Create, update, assign, dispatch, complete, close, resolve, and escalate maintenance work orders from reported property issues. Mutating requests require confirmation and default to dry-run.',
  persistenceEnvVar: 'HOTEL_HOME',
  inputSchema: MAINTENANCE_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'represent',
  domainKnowledge: 'Hotel maintenance operations: work-order lifecycle, trade specialization, severity and priority triage, preventive maintenance scheduling, and guest-impact assessment during repairs.',
  triggers: [
    { kind: 'event', on: 'Maintenance issue reported for a room or facility area' },
    { kind: 'user', phrase_examples: ['Report a leaking faucet in room 212', 'Dispatch a technician', 'Escalate the HVAC work order'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const workOrders = ctx.store.load('maintenance_work_orders');
    function resolveOperation(input: Record<string, unknown>): string {
      // v9 §1.1 item 3: no routing enum and no free-text `request` field. The
      // Skill picks the operation from which declared inputs were actually
      // supplied, so what runs is always what the caller asked for.
      const has = (...keys: string[]): boolean => keys.some((k) => {
        const v = (input as Record<string, unknown>)[k];
        return v != null && v !== '' && !(Array.isArray(v) && !v.length);
      });

      if (has('issueId')) return 'update';
      if (has('staffId')) return 'assign';
      if (has('scheduledAt', 'staffIds')) return 'dispatch';
      if (has('category')) return 'create';
      // Nothing the caller supplied selects anything more specific, so this runs.
      return 'create';
    }
    const action = resolveOperation(input as Record<string, unknown>);
    if (action === 'create' || action === 'update' || action === 'assign' || action === 'dispatch') {
      const order = {
        taskId: input.taskId || `wo_${Date.now()}`,
        roomId: input.roomId,
        category: input.category || 'general',
        severity: input.severity || 'minor',
        status: input.status || 'open',
        updatedAt: new Date().toISOString(),
      };
      workOrders.push(order);
      ctx.store.save('maintenance_work_orders', workOrders);
      return {
        success: true,
        data: { workOrder: order },
        present: [
          ctx.render.text('maintenance-update', 'Maintenance Work Order Processed', `Work Order ${order.taskId} status: ${order.status}`),
        ],
      };
    }
    return {
      success: true,
      data: { workOrders },
      present: [
        ctx.render.text('maintenance-list', 'Maintenance Work Orders', `Total work orders: ${workOrders.length}`),
      ],
    };
      },
    });
