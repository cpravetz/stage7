// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-add-template: registers a new resume or cover letter template.
// Returns { success, data: { template, outPath } }

const CAREER_ADD_TEMPLATE_INPUT = {
  type: 'object',
  properties: {
    templateId: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['resume', 'cover-letter'] },
    kind: { type: 'string', enum: ['resume', 'cover_letter'] },
    content: { type: 'string' },
    variables: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    profileId: { type: 'string', default: 'default' },
  },
};

const CAREER_ADD_TEMPLATE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        template: { type: 'object' },
        outPath: { type: 'string' },
        totalTemplates: { type: 'number' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_ADD_TEMPLATE = createDeclarativeCodeSkill({
  id: 'career-add-template',
  isSkill: false,
  name: 'Add Template',
  description: 'Register a new resume or cover letter template in the career workspace. Templates are named, versioned, and can be reused across applications with variable substitution.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: CAREER_ADD_TEMPLATE_INPUT,
  outputSchema: CAREER_ADD_TEMPLATE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Add a resume template', 'Save a cover letter', 'Create a new template'] },
  ],
  manifest: {
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Save template'
  },
  handler: async function handler(input, ctx) {
      const kind = input.kind || input.type || 'resume';
      const name = input.name || input.templateId || 'template_' + Date.now();
      const content = input.content || '';
      const variables = input.variables || [];
      const tags = input.tags || [];
      const profileId = input.profileId || 'default';

      if (!content) {

      return;
      }

      const outPath = 'career-templates/' + (kind === 'cover_letter' || kind === 'cover-letter' ? 'cover_letters' : 'resumes') + '/' + name + '.json';
      const template = {
      id: name,
      kind: kind === 'cover_letter' || kind === 'cover-letter' ? 'cover_letter' : 'resume',
      name,
      content,
      variables,
      tags,
      profileId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      };
      ctx.store.save('outPath', template);
      return { success: true, data: { template, outPath, totalTemplates: 1 } };
    }
  });
CAREER_ADD_TEMPLATE.configSchema = CAREER_BASE_CONFIG_SCHEMA;
CAREER_ADD_TEMPLATE.configSchema = CAREER_ADD_TEMPLATE.manifest.configSchema as SchemaRecord;

export { CAREER_ADD_TEMPLATE };
