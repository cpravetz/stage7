import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const RESUME_TEMPLATE_MANAGER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const resumeFile = input.resumeFile && typeof input.resumeFile === 'object' ? input.resumeFile : {};
const templateId = input.templateId || input.name || (resumeFile.name ? 'resume-' + resumeFile.name.replace(/[^a-z0-9]+/gi, '-') : '');
const templateName = input.name || resumeFile.name || '';
const templateContent = input.content || resumeFile.content || '';
if (!templateId || !templateName || !templateContent) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: provide a template name and content, or upload a resume file to manage' }));
return;
}
const result = await __execute_tool('career-add-template', {
  templateId,
  name: templateName,
  type: input.type || 'resume',
  content: templateContent,
  variables: input.variables || [],
  tags: input.tags || [],
});
if (!result || result.success === false || result.error) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: result && result.error ? result.error : 'Not connected: resume template manager could not save the template' }));
return;
}
const data = result.data && typeof result.data === 'object' ? result.data : result;
const template = data.template || data;
if (!template || (!template.templateId && !template.name)) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: template manager returned no saved template' }));
return;
}
console.log(JSON.stringify({ success: true, data: { template, totalTemplates: data.totalTemplates, templatePath: data.templatePath || result.templatePath, delegatedTo: 'career-add-template', generatedAt: new Date().toISOString() } }));
})();`;

const RESUME_TEMPLATE_MANAGER_INPUT = {
type: 'object',
properties: {
name: { type: 'string', description: 'Template name' },
type: { type: 'string', enum: ['resume', 'cover-letter'], description: 'Template type' },
content: { type: 'string', description: 'Template content' },
variables: { type: 'array', items: { type: 'string' }, description: 'Template variable names (configuration, not run-time data)' },
tags: { type: 'array', items: { type: 'string' }, description: 'Template tags (configuration, not run-time data)' },
resumeFile: {
  type: 'object',
  description: 'Resume file used to create a resume template',
  properties: {
    name: { type: 'string' },
    mimeType: { type: 'string' },
    content: { type: 'string', description: 'Base64 for binary formats, plain text for md/txt' },
  },
  required: ['name', 'mimeType', 'content'],
},
},
};

const RESUME_TEMPLATE_MANAGER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
data: {
type: 'object',
properties: {
template: { type: 'object' },
totalTemplates: { type: 'number' },
templatePath: { type: 'string' },
delegatedTo: { type: 'string' },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const RESUME_TEMPLATE_MANAGER = createCodeSkill({
id: 'career-resume-template-manager',
name: 'Resume & Template Manager',
description: 'Manages resume and cover-letter templates, including ATS-friendly variants. Delegates to career-add-template and reports not-connected when no template content or resume file is available.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: RESUME_TEMPLATE_MANAGER_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
lowerOrderTools: ['career-add-template'],
 actionLabel: 'Manage templates',
},
inputSchema: RESUME_TEMPLATE_MANAGER_INPUT,
outputSchema: RESUME_TEMPLATE_MANAGER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Update my resume', 'Manage templates', 'Upload a new resume variant'] },
],
isSkill: true,
});
RESUME_TEMPLATE_MANAGER.configSchema = RESUME_TEMPLATE_MANAGER.manifest.configSchema as SchemaRecord;

export { RESUME_TEMPLATE_MANAGER };
