import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EVENT_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
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
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const VENDOR_CONTRACT_MANAGEMENT = createExternalActionSkill({
  id: 'event_vendor_contract_management',
  name: 'Vendor & Contract Management',
  description: 'Manage vendor database, contracts, and payments for events. Real external integration with vendor management platforms, payment processors, and contract tools.',
  system: 'event_vendor',
  action: 'manage',
  endpoint: { envVar: 'EVENT_VENDOR_ENDPOINT', method: 'POST' },
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
      operation: SchemaProps.select(['vendor-create', 'vendor-update', 'vendor-get', 'vendor-list', 'contract-create', 'contract-sign', 'contract-get', 'payment-schedule', 'payment-send', 'payment-track', 'invoice-generate', '1099-prepare'], { description: 'Operation' }),
      vendorId: { type: 'string', description: 'Vendor identifier' },
      vendorData: { type: 'object', description: 'Vendor info: name, category, contact, services, pricing, insurance, certifications' },
      contractId: { type: 'string', description: 'Contract identifier' },
      contractData: { type: 'object', description: 'Contract terms: scope, deliverables, timeline, payment schedule, cancellation, liability' },
      paymentId: { type: 'string', description: 'Payment identifier' },
      paymentData: { type: 'object', description: 'Payment: amount, date, method, invoice reference, purpose' },
      eventId: { type: 'string', description: 'Event identifier' },
      filters: { type: 'object', description: 'List filters: category, status, event' },
      endpointUrl: SchemaProps.text({ description: 'Optional endpoint override' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing' }),
    },
    required: ['operation'],
  },
  outputSchema: EVENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
});

VENDOR_CONTRACT_MANAGEMENT.confirmBeforeSend = true;
VENDOR_CONTRACT_MANAGEMENT.triggers = [
  { kind: 'user', phrase_examples: ['Create vendor', 'Sign contract', 'Schedule payment'] },
  { kind: 'schedule', cadence: 'Weekly vendor review' },
  { kind: 'event', on: 'Event date confirmed' },
  { kind: 'event', on: 'Contract deadline approaching' },
];

export { VENDOR_CONTRACT_MANAGEMENT };
