// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const RESUME_TEMPLATE_MANAGER_INPUT = {
  type: 'object',
  properties: {
    mode: SchemaProps.select(['save', 'list', 'get'], { description: 'Operation mode: save a template, list existing templates, or get a single template by id', default: 'save' }),
    name: { type: 'string', description: 'Template name (required for save mode)' },
    type: { type: 'string', enum: ['resume', 'cover-letter'], description: 'Template type (required for save mode; used for filtering in list mode)' },
    content: { type: 'string', description: 'Template content (required for save mode)' },
    variables: { type: 'array', items: { type: 'string' }, description: 'Template variable names (configuration, not run-time data)' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Template tags (configuration, not run-time data)' },
    id: { type: 'string', description: 'Template ID (required for get mode)' },
    resumeFile: {
      type: 'object',
      description: 'Resume file used to create a resume template (save mode)',
      properties: {
        name: { type: 'string' },
        mimeType: { type: 'string' },
        content: { type: 'string', description: 'Base64 for binary formats, plain text for md/txt' },
      },
      required: ['name', 'mimeType', 'content'],
    },
  },
};

const RESUME_TEMPLATE_MANAGER = createDeclarativeCodeSkill({
  id: 'career-resume-template-manager',
  name: 'Resume & Template Manager',
  description: 'Manages resume and cover-letter templates. Supports saving new templates, listing existing templates by type, and retrieving a single template by ID.',
  persistenceEnvVar: 'CAREER_HOME',
  tier: 'aid',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
  inputSchema: RESUME_TEMPLATE_MANAGER_INPUT,
  outputSchema: careerResultSchema('Template metadata or list of templates'),
  triggers: [
    { kind: 'user', phrase_examples: ['Update my resume', 'Manage templates', 'Upload a new resume variant', 'List my resume templates', 'List my cover letter templates'] },
  ],
  handler: async (input, ctx) => {
    const mode = input.mode || 'save';
    const templateType = input.type || 'resume';

    const templates = ctx.store.load('templates', []);
    const normalizedTemplates = Array.isArray(templates) ? templates : [];

    if (mode === 'list') {
      const filtered = normalizedTemplates.filter((t) => t.kind === templateType || t.type === templateType);
      const lines = [
        `${templateType === 'resume' ? 'Resume' : 'Cover Letter'} Templates`,
        '========================',
        '',
      ];
      if (filtered.length === 0) {
        lines.push(`No ${templateType} templates found. Create one using save mode.`);
      } else {
        filtered.forEach((t) => {
          lines.push(`- ${t.name} (id: ${t.id})${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`);
        });
      }
      // A plain object, not ctx.emit.success(...): the generated wrapper already calls
      // ctx.emit.success(result) on whatever the handler returns, so emitting here too
      // would print the result twice and make the skill output unparseable.
      return {
        success: true,
        data: { templates: filtered.map(t => ({ id: t.id, name: t.name, type: t.kind || t.type, tags: t.tags || [] })), totalTemplates: filtered.length },
        status: 'ok',
        present: [ctx.render.text('templates', `${templateType} Templates`, lines)],
      };
    }

    if (mode === 'get') {
      const templateId = input.id;
      if (!templateId) {
        return {
          success: false,
          status: 'error',
          error: 'Template ID is required for get mode',
          data: null,
          present: [ctx.render.text('error', 'Error', 'Provide an id to retrieve a specific template')],
        };
      }
      const template = normalizedTemplates.find((t) => t.id === templateId);
      if (!template) {
        return {
          success: false,
          status: 'error',
          error: 'Template not found',
          data: null,
          present: [ctx.render.text('error', 'Error', `No template found with id: ${templateId}`)],
        };
      }
      return {
        success: true,
        data: { template },
        status: 'ok',
        present: [ctx.render.text('template', template.name, template.content)],
      };
    }

    // mode === 'save'
    const resumeFile = input.resumeFile && typeof input.resumeFile === 'object' ? input.resumeFile : {};
    const templateId = input.name || (resumeFile.name ? 'resume-' + resumeFile.name.replace(/[^a-z0-9]+/gi, '-') : '');
    const templateName = input.name || resumeFile.name || '';
    const templateContent = input.content || resumeFile.content || '';
    const type = input.type || 'resume';

    if (!templateId || !templateName || !templateContent) {
      const lines = [
        'Resume & Template Manager',
        '=========================',
        '',
        'Provide a template name and content, or upload a resume file to manage.',
        '',
        'To store a complete resume:',
        '  - Upload a resume file (PDF, DOCX, or text)',
        '  - Or provide "name" and "content" fields',
        '',
        'To create a template with variables:',
        '  - Provide "name", "content" with {{variables}}, and a "type" (resume or cover-letter)',
      ];
      const reason = 'Provide a template name and content, or upload a resume file to manage';
      const details = lines.join('\n');
      return {
        success: false,
        status: 'not-connected',
        data: null,
        error: `Not connected: ${reason}`,
        present: [
          {
            id: 'not-connected',
            title: 'Connection required',
            kind: 'text',
            body: details ? `${reason}\n${details}` : reason,
          },
        ],
      };
    }

    const existingIdx = normalizedTemplates.findIndex((t) => t.id === templateId);
    const template = {
      id: templateId,
      kind: type === 'cover-letter' ? 'cover_letter' : 'resume',
      type,
      name: templateName,
      content: templateContent,
      variables: input.variables || [],
      tags: input.tags || [],
      profileId: 'default',
      createdAt: existingIdx >= 0 ? normalizedTemplates[existingIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: existingIdx >= 0 ? (normalizedTemplates[existingIdx].version || 1) + 1 : 1,
    };

    if (existingIdx >= 0) {
      normalizedTemplates[existingIdx] = template;
    } else {
      normalizedTemplates.push(template);
    }
    ctx.store.save('templates', normalizedTemplates);

    const lines = [
      'Saved Resume / Template',
      '========================',
      '',
      'Name: ' + template.name,
      'Type: ' + type,
      'Version: ' + template.version,
    ];
    const varCount = Array.isArray(template.variables) ? template.variables.length : 0;
    if (varCount > 0) lines.push('Variables: ' + template.variables.join(', '));
    if (Array.isArray(template.tags) && template.tags.length) lines.push('Tags: ' + template.tags.join(', '));
    lines.push('Content length: ' + template.content.length + ' characters');
    lines.push('Status: ' + (type === 'cover-letter' ? 'Cover letter template saved' : 'Resume saved'));
    lines.push('');
    lines.push('Use this content to apply to jobs via the Apply to Jobs skill.');

    return {
      success: true,
      data: { template: { id: template.id, name: template.name, type: template.type, variables: template.variables, tags: template.tags }, totalTemplates: normalizedTemplates.length, generatedAt: new Date().toISOString() },
      status: 'ok',
      present: [ctx.render.text('resume', 'Resume Saved', lines)],
    };
  },
});

RESUME_TEMPLATE_MANAGER.configSchema = RESUME_TEMPLATE_MANAGER.manifest.configSchema as SchemaRecord;

export { RESUME_TEMPLATE_MANAGER };
