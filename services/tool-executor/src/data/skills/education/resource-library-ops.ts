import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EDUCATION_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string' },
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
};

export const RESOURCE_LIBRARY_OPS = createExternalActionSkill({
  id: 'education-resource-library',
  name: 'Resource Library Ops',
  description: 'Search and manage educational resources in a connected repository (LMS, Google Drive, SharePoint, custom). Proxy skill for real repository operations.',
  system: 'education_repository',
  action: 'manage_resources',
  endpoint: { envVar: 'EDUCATION_RESOURCE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EDUCATION_RESOURCE_ACCESS_TOKEN' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Resource repository base URL' },
      token: { type: 'string', description: 'Repository bearer token' },
      provider: { type: 'string', enum: ['google-drive', 'sharepoint', 'canvas-commons', 'oer-commons', 'custom'], description: 'Repository provider' },
      defaultFolder: { type: 'string', description: 'Default folder/path' },
      taxonomy: { type: 'object', description: 'Tagging taxonomy: subjects, grades, standards, types, topics' },
      accessibilityStandards: { type: 'string', enum: ['WCAG-2.1-AA', 'Section-508', 'custom'], description: 'Accessibility standard to enforce' },
      allowedTypes: { type: 'array', items: { type: 'string' }, description: 'Allowed file types' },
      maxFileSizeMb: { type: 'number', description: 'Max file size in MB' },
      versioning: { type: 'boolean', description: 'Enable version control', default: true },
    },
    required: ['baseUrl', 'token', 'provider'],
  },
  credentialSource: {
    token: { envVar: 'EDUCATION_RESOURCE_ACCESS_TOKEN', configKey: 'education.resource.token' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      resourceId: { type: 'string', description: 'Resource identifier' },
      file: { type: 'object', description: 'File metadata for upload: name, mimeType, content (base64), size' },
      folder: { type: 'string', description: 'Target folder/path' },
      tags: { type: 'object', description: 'Tags: subject, grade, standard, type, topic, language, license' },
      query: { type: 'string', description: 'Search query' },
      filters: { type: 'object', description: 'Search filters' },
      accessibilityStandard: SchemaProps.select(['WCAG-2.1-AA', 'Section-508', 'custom'], { description: 'Accessibility standard for check' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing' }),
    },
  },
  outputSchema: EDUCATION_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
  tier: 'aid',
  domainKnowledge: "Pedagogical frameworks (Bloom's Taxonomy, Spaced Repetition), curriculum design, assessment scoring methods, student engagement metrics",
  triggers: [
    { kind: 'user', phrase_examples: ['Curate learning resources for this subject'] },
  ],
});
