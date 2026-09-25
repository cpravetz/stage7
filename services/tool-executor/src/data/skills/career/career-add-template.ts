import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-add-template: registers a new resume or cover letter template.
// Returns { success, data: { template, outPath } }
const CAREER_ADD_TEMPLATE_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const kind = input.kind || input.type || 'resume';
const name = input.name || input.templateId || 'template_' + Date.now();
const content = input.content || '';
const variables = input.variables || [];
const tags = input.tags || [];
const profileId = input.profileId || 'default';

if (!content) {
  console.log(JSON.stringify({ success: false, error: 'Template content is required' }));
  return;
}

const dir = path.join(baseDir, kind === 'cover_letter' || kind === 'cover-letter' ? 'cover_letters' : 'resumes');
fs.mkdirSync(dir, { recursive: true });
const outPath = path.join(dir, name + '.json');
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
fs.writeFileSync(outPath, JSON.stringify(template, null, 2));
console.log(JSON.stringify({ success: true, data: { template, outPath, totalTemplates: 1 } }));
})();`;

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

const CAREER_ADD_TEMPLATE = createCodeSkill({
  id: 'career-add-template',
  name: 'Add Template',
  description: 'Register a new resume or cover letter template in the career workspace. Templates are named, versioned, and can be reused across applications with variable substitution.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_ADD_TEMPLATE_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Save template',
  },
  inputSchema: CAREER_ADD_TEMPLATE_INPUT,
  outputSchema: CAREER_ADD_TEMPLATE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Add a resume template', 'Save a cover letter', 'Create a new template'] },
  ],
});
CAREER_ADD_TEMPLATE.configSchema = CAREER_ADD_TEMPLATE.manifest.configSchema as SchemaRecord;

export { CAREER_ADD_TEMPLATE };
