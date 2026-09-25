import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const MATTER_DOCUMENT_OPS = createExternalActionSkill({
  id: 'matter-document-ops',
  name: 'Matter & Document Ops',
  description: 'Prepare matter, document-tagging, and eDiscovery requests for a configured external endpoint. Without a configured endpoint, the action remains a dry run and makes no live change.',
  system: 'matter-document-ops',
  action: 'ops',
  endpoint: { envVar: 'MATTER_DOCUMENT_OPS_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { accessToken: 'MATTER_DOCUMENT_OPS_TOKEN' },
  },
  credentialSource: {
    accessToken: { envVar: 'MATTER_DOCUMENT_OPS_TOKEN', configKey: 'matterDocumentOps.token' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Matter & Document Ops system base URL' },
      accessToken: { type: 'string', description: 'Bearer access token' },
      workspaceId: { type: 'string', description: 'Default workspace or firm identifier' },
    },
    required: ['baseUrl', 'accessToken'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      matterId: { type: 'string', description: 'Matter or case identifier' },
      caseId: { type: 'string', description: 'Case identifier for case management operations' },
      caseData: { type: 'object', description: 'Case data object for create/update operations' },
      documentId: { type: 'string', description: 'Document identifier for tagging operations' },
      content: { type: 'string', description: 'Document content or text to analyze for tagging' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags to apply or consider for document tagging' },
      taxonomy: { type: 'string', description: 'Taxonomy or tag set for document classification' },
      custodians: { type: 'array', items: { type: 'string' }, description: 'List of custodians for collection or search' },
      searchTerms: { type: 'array', items: { type: 'string' }, description: 'Search terms for eDiscovery' },
      dateRange: { type: 'object', description: 'Date range for operations (e.g., { start: "2023-01-01", end: "2023-12-31" })' },
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: 'string', description: 'Outcome status (e.g., completed, dry-run, error, not-connected)' },
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
    required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
  },
  timeoutMs: 60000,
isSkill: true,
});

MATTER_DOCUMENT_OPS.confirmBeforeSend = true;
MATTER_DOCUMENT_OPS.tier = 'represent';
MATTER_DOCUMENT_OPS.domainKnowledge = 'Matter management, document tagging taxonomies, eDiscovery collection and search (EDRM), custodian mapping, and legal hold procedures';

MATTER_DOCUMENT_OPS.triggers = [
  { kind: 'user', phrase_examples: ['Manage this matter', 'Tag this document', 'Review eDiscovery'] },
];

export { MATTER_DOCUMENT_OPS };
