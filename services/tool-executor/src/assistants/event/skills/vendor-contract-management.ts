import { createExternalActionSkill, SchemaProps } from '../../../adk/code-skill-factory';

const EVENT_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'system', 'action', 'request', 'response', 'error'],
};

const VENDOR_CONTRACT_MANAGEMENT = createExternalActionSkill({
  id: 'event-vendor-contract-management',
  name: 'Vendor & Contract Management',
  description: 'Manage vendor database, contracts, and payments for events. Real external integration with vendor management platforms, payment processors, and contract tools.',
  system: 'event_vendor',
  action: 'manage',
  endpoint: { configKey: 'EVENT_VENDOR_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EVENT_VENDOR_ACCESS_TOKEN' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Vendor management platform base URL' },
      token: { type: 'string', description: 'Platform bearer token' },
      provider: { type: 'string', enum: ['honeybook', '17hats', 'dubsado', 'planning-pod', 'eventbrite', 'cvent', 'custom'], description: 'Vendor/platform provider' },
      paymentProviders: { type: 'object', description: 'Connected payment processors', properties: { stripe: { type: 'object' }, square: { type: 'object' }, paypal: { type: 'object' }, ach: { type: 'object' } } },
      contractTemplates: { type: 'object', description: 'Contract templates by vendor type' },
      defaultTerms: { type: 'object', description: 'Default payment terms (net-30, deposit%, etc.)' },
      approvalWorkflows: { type: 'object', description: 'Approval workflows for contracts/payments' },
    },
    required: ['baseUrl', 'token', 'provider'],
  },
  credentialSource: {
    token: { envVar: 'EVENT_VENDOR_ACCESS_TOKEN', configKey: 'event.vendor.token' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      vendorId: { type: 'string', format: 'reference', 'x-referenceSource': 'event-vendors', description: 'Vendor' },
      vendorData: { type: 'object', description: 'Vendor info: name, category, contact, services, pricing, insurance, certifications' },
      contractId: { type: 'string', format: 'reference', 'x-referenceSource': 'event-contracts', description: 'Contract' },
      contractData: { type: 'object', description: 'Contract terms: scope, deliverables, timeline, payment schedule, cancellation, liability' },
      paymentId: { type: 'string', format: 'reference', 'x-referenceSource': 'event-payments', description: 'Payment' },
      paymentData: { type: 'object', description: 'Payment: amount, date, method, invoice reference, purpose' },
      event: { type: 'string', description: 'Event identifier' },
      filters: { type: 'object', description: 'List filters: category, status, event' },
      dryRun: SchemaProps.boolean({ description: 'Validate without executing' }),
    },
    required: ['contractId'],
  },
  outputSchema: EVENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  tier: 'aid',
isSkill: true,
});

VENDOR_CONTRACT_MANAGEMENT.domainKnowledge = 'Event vendor management: vendor sourcing and categorization, contract negotiation and signing, payment scheduling and tracking, invoice generation, and 1099 tax preparation for event vendors';
VENDOR_CONTRACT_MANAGEMENT.confirmBeforeSend = true;
VENDOR_CONTRACT_MANAGEMENT.triggers = [
  { kind: 'event', on: 'Vendor contract request' },
];

export { VENDOR_CONTRACT_MANAGEMENT };
