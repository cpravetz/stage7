// @ts-nocheck
import { createExternalActionSkill } from '../code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from './marketing-contract';

export const MARKETING_DOCUMENT_MANAGEMENT = createExternalActionSkill({
    triggers: [
      { kind: 'event', on: 'Document update received for marketing asset' },
    ],
    id: 'marketing-document-management',
    name: 'Marketing Document Management',
    description: 'Create, store, retrieve, and organize marketing assets and campaign documents in a configurable document system.',
    system: 'document-management',
    action: 'manage-document',
    endpoint: { configKey: 'MARKETING_DOCUMENT_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'MARKETING_DOCUMENT_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'MARKETING_DOCUMENT_ACCESS_TOKEN', configKey: 'documentManagement.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Document management system base URL' },
        token: { type: 'string', description: 'Document system bearer token' },
        provider: { type: 'string', enum: ['google-drive', 'sharepoint', 'dropbox', 'box', 'custom'] },
        defaultFolder: { type: 'string' },
        assetTaxonomy: { type: 'object', description: 'Asset classification taxonomy' },
        versionControl: { type: 'object', description: 'Version control settings' },
        rightsManagement: { type: 'object', description: 'Digital rights management settings' },
        collaborationWorkflows: { type: 'array', items: { type: 'object' }, description: 'Collaboration workflow definitions' },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'object', description: 'Document object to create or update' },
        documentId: { type: 'string', description: 'Unique identifier of the document' },
        folderId: { type: 'string', description: 'Target folder identifier' },
        name: { type: 'string', description: 'Document name or title' },
        contentType: { type: 'string', description: 'MIME type or content type of the document' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
