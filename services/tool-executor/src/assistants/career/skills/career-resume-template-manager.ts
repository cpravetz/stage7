// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { careerResultSchema } from '../career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

/**
 * Clean entity-centric schema for Document & Template Management.
 * Replaces mode-switching forms with action-based execution.
 */
const RESUME_TEMPLATE_MANAGER_INPUT = {
  type: 'object',
  properties: {
    typeFilter: {
      type: 'string',
      enum: ['all', 'resume', 'cover-letter'],
      description: 'Filter template type (used with list action)',
      default: 'all',
    },
    id: {
      type: 'string',
      description: 'Template ID (required for get/delete, optional for save to update existing)',
    },
    name: {
      type: 'string',
      description: 'Template display name (required for save)',
    },
    type: {
      type: 'string',
      enum: ['resume', 'cover-letter'],
      description: 'Document classification (required for save)',
      default: 'resume',
    },
    content: {
      type: 'string',
      description: 'Template content body in markdown or plain text',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional tags/labels for categorizing templates',
    },
    resumeFile: {
      type: 'object',
      description: 'File upload attachment (PDF, DOCX, MD, TXT)',
      properties: {
        name: { type: 'string' },
        mimeType: { type: 'string' },
        content: { type: 'string', description: 'Base64 or plain text content' },
      },
      required: ['name', 'mimeType', 'content'],
    },
  },
  // `get` and `delete` are both driven by `id`, so presence alone cannot tell them
  // apart. Deletion is therefore opt-in and can never be the default that a bare
  // `id` falls through to.
  delete: { type: 'boolean', description: 'Delete the template named by `id` rather than returning it', default: false },
  // `save` is otherwise selected by exactly the fields it validates, which leaves its
  // "you gave me nothing" guidance unreachable. This flag is what asks for a save
  // without yet supplying the document.
  save: { type: 'boolean', description: 'Save a template; when name and content are both absent, reports what is missing', default: false },
};

const RESUME_TEMPLATE_MANAGER = createDeclarativeCodeSkill({
  id: 'career-resume-template-manager',
  name: 'Resume & Template Manager',
  description: 'Manage, edit, upload, and organize resume and cover letter templates.',
  persistenceEnvVar: 'CAREER_HOME',
  tier: 'aid',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization',
  isSkill: true,
  // Adding a template is the write half of this Skill, so the standalone tool
  // sits behind it rather than being reachable on its own.
  manifest: { actionLabel: 'Manage templates', lowerOrderTools: ['career-add-template'] },
  inputSchema: RESUME_TEMPLATE_MANAGER_INPUT,
  outputSchema: careerResultSchema('Template metadata, detail view, or document list'),
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Manage templates',
        'List my resume templates',
        'Upload a new resume',
        'View template library',
      ],
    },
  ],
  handler: async (input, ctx) => {
    function resolveOperation(input: Record<string, unknown>): string {
      // v9 §1.1 item 3: no routing enum and no free-text `request` field. The
      // Skill picks the operation from which declared inputs were supplied.
      const present = (v: unknown): boolean => v != null && v !== '' && !(Array.isArray(v) && !v.length);
      const has = (...keys: string[]): boolean => keys.some((k) => present(input[k]));
      const all = (...keys: string[]): boolean => keys.every((k) => present(input[k]));

      if (has('save') && input.save === true) return 'save';
      if (has('resumeFile', 'content', 'name', 'tags')) return 'save';
      if (has('delete') && input.delete === true) return 'delete';
      if (has('id')) return 'get';
      if (has('typeFilter')) return 'list';
      return 'list';
    }
    const action = resolveOperation(input as Record<string, unknown>);
    const templates = ctx.store.load('templates', []);
    const normalizedTemplates = Array.isArray(templates) ? templates : [];

    // ------------------------------------------------------------------------
    // ACTION: LIST
    // ------------------------------------------------------------------------
    if (action === 'list') {
      const filter = input.typeFilter || 'all';
      const filtered = normalizedTemplates.filter(
        (t) => filter === 'all' || t.type === filter || t.kind === (filter === 'cover-letter' ? 'cover_letter' : filter)
      );

      const items = filtered.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type || (t.kind === 'cover_letter' ? 'cover-letter' : 'resume'),
        tags: t.tags || [],
        variables: t.variables || [],
        updatedAt: t.updatedAt || t.createdAt,
      }));

      const summaryText = filtered.length === 0
        ? `No ${filter === 'all' ? '' : filter + ' '}templates found.`
        : `Found ${filtered.length} document template(s).`;

      return {
        success: true,
        data: { templates: items, totalTemplates: filtered.length },
        status: 'ok',
        present: [
          ctx.render.text('templates-list', 'Document Library', `${summaryText}\n\n` + 
            filtered.map(t => `• **${t.name}** [${t.type || 'resume'}] (ID: ${t.id})`).join('\n')
          ),
        ],
      };
    }

    // ------------------------------------------------------------------------
    // ACTION: GET (View single document)
    // ------------------------------------------------------------------------
    if (action === 'get') {
      const templateId = input.id;
      if (!templateId) {
        return {
          success: false,
          status: 'error',
          error: 'Template ID is required to retrieve a document',
          data: null,
          present: [ctx.render.text('error', 'Error', 'Select or specify a valid Template ID.')],
        };
      }

      const template = normalizedTemplates.find((t) => t.id === templateId);
      if (!template) {
        return {
          success: false,
          status: 'error',
          error: `Template not found for ID: ${templateId}`,
          data: null,
          present: [ctx.render.text('error', 'Error', `No template found with ID: ${templateId}`)],
        };
      }

      return {
        success: true,
        data: { template },
        status: 'ok',
        present: [
          ctx.render.text(
            'template-detail',
            template.name,
            `**Type:** ${template.type}\n**Tags:** ${(template.tags || []).join(', ') || 'None'}\n**Variables Detected:** ${(template.variables || []).join(', ') || 'None'}\n\n---\n\n${template.content}`
          ),
        ],
      };
    }

    // ------------------------------------------------------------------------
    // ACTION: DELETE
    // ------------------------------------------------------------------------
    if (action === 'delete') {
      const templateId = input.id;
      if (!templateId) {
        return {
          success: false,
          status: 'error',
          error: 'Template ID is required for deletion',
          data: null,
          present: [ctx.render.text('error', 'Error', 'Provide a Template ID to delete.')],
        };
      }

      const updatedList = normalizedTemplates.filter((t) => t.id !== templateId);
      if (updatedList.length === normalizedTemplates.length) {
        return {
          success: false,
          status: 'error',
          error: 'Template not found',
          data: null,
          present: [ctx.render.text('error', 'Error', `No template found with ID: ${templateId}`)],
        };
      }

      ctx.store.save('templates', updatedList);
      return {
        success: true,
        data: { deletedId: templateId, remainingCount: updatedList.length },
        status: 'ok',
        present: [ctx.render.text('delete-success', 'Document Removed', `Successfully deleted template: ${templateId}`)],
      };
    }

    // ------------------------------------------------------------------------
    // ACTION: SAVE (Create / Update)
    // ------------------------------------------------------------------------
    const resumeFile = input.resumeFile && typeof input.resumeFile === 'object' ? input.resumeFile : {};
    const rawContent = input.content || resumeFile.content || '';
    const templateName = input.name || resumeFile.name || '';
    const docType = input.type || 'resume';

    if (!templateName || !rawContent) {
      return {
        success: false,
        status: 'error',
        error: 'Missing required document fields',
        data: null,
        present: [
          ctx.render.text(
            'save-error',
            'Cannot Save Template',
            'To save a template, please provide a document name and content (or attach a file).'
          ),
        ],
      };
    }

    // Generate clean ID slug if not explicitly updating
    const generatedId = input.id || templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const autoVariables = (() => {
      if (!rawContent) return [];
      const matches = rawContent.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
      if (!matches) return [];
      const vars = matches.map((m) => m.replace(/[\{\}\s]/g, ''));
      return Array.from(new Set(vars));
    })();

    const existingIdx = normalizedTemplates.findIndex((t) => t.id === generatedId);
    const existingDoc = existingIdx >= 0 ? normalizedTemplates[existingIdx] : null;

    const templateRecord = {
      id: generatedId,
      kind: docType === 'cover-letter' ? 'cover_letter' : 'resume',
      type: docType,
      name: templateName,
      content: rawContent,
      variables: autoVariables,
      tags: input.tags || (existingDoc ? existingDoc.tags : []),
      profileId: 'default',
      createdAt: existingDoc ? existingDoc.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: existingDoc ? (existingDoc.version || 1) + 1 : 1,
    };

    if (existingIdx >= 0) {
      normalizedTemplates[existingIdx] = templateRecord;
    } else {
      normalizedTemplates.push(templateRecord);
    }

    ctx.store.save('templates', normalizedTemplates);

    return {
      success: true,
      data: {
        template: {
          id: templateRecord.id,
          name: templateRecord.name,
          type: templateRecord.type,
          variables: templateRecord.variables,
          tags: templateRecord.tags,
          version: templateRecord.version,
        },
        totalTemplates: normalizedTemplates.length,
      },
      status: 'ok',
      present: [
        ctx.render.text(
          'save-success',
          `Template Saved: ${templateRecord.name}`,
          `**Type:** ${templateRecord.type}\n**Version:** ${templateRecord.version}\n**Detected Variables:** ${autoVariables.length ? autoVariables.join(', ') : 'None'}\n**Tags:** ${templateRecord.tags.join(', ') || 'None'}`
        ),
      ],
    };
  },
});

RESUME_TEMPLATE_MANAGER.configSchema = RESUME_TEMPLATE_MANAGER.manifest.configSchema as SchemaRecord;

export { RESUME_TEMPLATE_MANAGER };