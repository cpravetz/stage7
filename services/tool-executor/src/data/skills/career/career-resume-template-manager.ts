import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const RESUME_TEMPLATE_MANAGER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const NL = '\\n';

function emit(success, status, data, error, present) {
  console.log(JSON.stringify({ success: success, status: status, data: data || null, error: error || null, present: present || [] }));
  return { success: success, status: status, data: data || null, error: error || null, present: present || [] };
}

const resumeFile = input.resumeFile && typeof input.resumeFile === 'object' ? input.resumeFile : {};
const templateId = input.templateId || input.name || (resumeFile.name ? 'resume-' + resumeFile.name.replace(/[^a-z0-9]+/gi, '-') : '');
const templateName = input.name || resumeFile.name || '';
const templateContent = input.content || resumeFile.content || '';
const type = input.type || 'resume';

if (!templateId || !templateName || !templateContent) {
  const lines = ['Resume & Template Manager'];
  lines.push('=========================');
  lines.push('');
  lines.push('Provide a template name and content, or upload a resume file to manage.');
  lines.push('');
  lines.push('To store a complete resume:');
  lines.push('  - Upload a resume file (PDF, DOCX, or text)');
  lines.push('  - Or provide "name" and "content" fields');
  lines.push('');
  lines.push('To create a template with variables:');
  lines.push('  - Provide "name", "content" with {{variables}}, and a "type" (resume or cover-letter)');
  emit(false, 'not-connected', null, 'Provide a template name and content, or upload a resume file to manage', [{ id: 'notice', title: 'Resume Manager', kind: 'text', body: lines.join(NL) }]);
  return;
}
const result = await __execute_tool('career-add-template', {
  templateId,
  name: templateName,
  type: type,
  content: templateContent,
  variables: input.variables || [],
  tags: input.tags || [],
});
if (!result || result.success === false || result.error) {
  emit(false, 'not-connected', null, result && result.error ? result.error : 'Resume template manager could not save the template', [{ id: 'error', title: 'Error', kind: 'text', body: 'Could not save the resume/template. Check the input and try again.' }]);
  return;
}
const data = result.data && typeof result.data === 'object' ? result.data : {};
const template = data.template || {};

const lines = ['Saved Resume / Template'];
lines.push('========================');
lines.push('');
lines.push('Name: ' + (template.name || templateId));
lines.push('Type: ' + (template.kind || type || 'resume'));
const varCount = Array.isArray(template.variables) ? template.variables.length : 0;
if (varCount > 0) {
  lines.push('Variables: ' + template.variables.join(', '));
}
if (Array.isArray(template.tags) && template.tags.length) {
  lines.push('Tags: ' + template.tags.join(', '));
}
const contentLen = String(template.content || '').length;
lines.push('Content length: ' + contentLen + ' characters');
lines.push('Status: ' + (type === 'cover-letter' ? 'Cover letter template saved' : 'Resume saved'));
lines.push('');
lines.push('Use this content to apply to jobs via the Apply to Jobs skill.');

emit(true, 'ok', { template: { id: template.id || templateId, name: template.name || templateName, type: template.kind || type, variables: template.variables || [], tags: template.tags || [] }, totalTemplates: data.totalTemplates || 1, generatedAt: new Date().toISOString() }, null, [{ id: 'resume', title: 'Resume Saved', kind: 'text', body: lines.join(NL) }]);
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
  outputSchema: careerResultSchema('Saved resume/template metadata without internal file paths'),
triggers: [
{ kind: 'user', phrase_examples: ['Update my resume', 'Manage templates', 'Upload a new resume variant'] },
],
tier: 'aid',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
});
RESUME_TEMPLATE_MANAGER.configSchema = RESUME_TEMPLATE_MANAGER.manifest.configSchema as SchemaRecord;

export { RESUME_TEMPLATE_MANAGER };
