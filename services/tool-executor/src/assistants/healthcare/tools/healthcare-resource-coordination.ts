// @ts-nocheck

import { SchemaProps, createExternalActionSkill } from '../../../adk/code-skill-factory';
import { HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA } from '../healthcare-contract';

export const RESOURCE_COORDINATION = createExternalActionSkill({
  id: 'healthcare-resource-coordination',
  isSkill: false,
  name: 'Resource Coordination',
  description: 'Coordinate beds, equipment, staff, and rooms across facilities, and match patients to optimal resources based on clinical needs, insurance, and preferences.',
  tier: 'represent',
  domainKnowledge: 'Healthcare resource coordination, bed/equipment/staff management, and patient-resource matching',
  system: 'healthcare',
  action: 'resource-coordination',
  endpoint: { configKey: 'HEALTHCARE_RESOURCE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'HEALTHCARE_RESOURCE_ACCESS_TOKEN' },
  },
  credentialSource: {
    token: { envVar: 'HEALTHCARE_RESOURCE_ACCESS_TOKEN', configKey: 'resource.token' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Resource management system base URL' },
      token: { type: 'string', description: 'Resource management bearer token' },
      provider: { type: 'string', enum: ['teletracking', 'central-logic', 'awarepoint', 'referral-md', 'kyruus', 'custom'], description: 'System provider' },
      defaultFacility: { type: 'string', description: 'Default facility identifier' },
      enableMatching: { type: 'boolean', description: 'Enable patient-resource matching algorithms' },
      enableForecasting: { type: 'boolean', description: 'Enable demand forecasting' },
      maxAllocationHours: { type: 'number', description: 'Maximum allocation duration in hours', default: 24 },
    },
    required: ['baseUrl', 'token'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      resourceType: SchemaProps.select(['bed', 'equipment', 'room', 'staff', 'device', 'supply'], { description: 'Type of resource' }),
      resourceId: SchemaProps.reference('healthcare-resources', { description: 'Resource identifier' }),
       facility: SchemaProps.text({ description: 'Facility identifier' }),
       patient: SchemaProps.text({ description: 'Select patient' }),
       quantity: SchemaProps.integer({ description: 'Quantity to allocate' }),
      startTime: SchemaProps.text({ description: 'Start time (ISO 8601)' }),
      endTime: SchemaProps.text({ description: 'End time (ISO 8601)' }),
      priority: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Request priority' }),
      clinicalNeeds: SchemaProps.stringArray({ description: 'Patient clinical needs for matching' }),
      insurance: SchemaProps.object({}, { description: 'Insurance information for matching' }),
      preferences: SchemaProps.object({}, { description: 'Patient preferences' }),
      specialty: SchemaProps.text({ description: 'Medical specialty for matching' }),
      urgency: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Matching urgency' }),
      maxResults: SchemaProps.integer({ description: 'Maximum results to return', default: 10 }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
    required: [],
  },
  outputSchema: HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  triggers: [
    { kind: 'event', on: 'Resource request received' },
  ],
});
