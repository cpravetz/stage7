// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const RESPONSE_DRAFTING = createDeclarativeCodeSkill({
  id: 'response-drafting',
  name: 'Response Drafting',
  description: 'Generate contextual support responses using ticket context, knowledge base articles, and response templates.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'aid',
  domainKnowledge: 'Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage',
  inputSchema: {
    type: 'object',
    properties: {
      ticket: SchemaProps.text({ description: 'Ticket identifier for the response' }),
      customerMessage: SchemaProps.text({ description: 'Customer message to respond to' }),
      tone: SchemaProps.select(['professional', 'friendly', 'empathetic', 'technical'], { description: 'Tone of the generated response', default: 'empathetic' }),
      template: SchemaProps.text({ description: 'Response template to use' }),
      includeKB: SchemaProps.boolean({ description: 'Whether to include knowledge base references', default: true }),
      suggestedActions: SchemaProps.stringArray({ description: 'Suggested next steps' }),
    },
    required: ['customerMessage'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      response: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'response'],
  },
  triggers: [
    { kind: 'event', on: 'Ticket classification output is available' },
  ],
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
      const ticketId = input.ticket || '';
      const customerMessage = input.customerMessage || '';
      const tone = input.tone || 'empathetic';
      const template = input.template || '';
      const includeKB = input.includeKB !== false;
      const suggestedActions = input.suggestedActions || [];

      let kbArticles = [];
      kbArticles = (includeKB) ? ctx.store.load('kb', []) : [];
      let templates = [];
      templates = ctx.store.load('templates', []);
      function draftResponse(tid, msg, t, tpl, incKb, articles) {
        const tmpl = tpl ? templates.find((x) => (x.name || x.id) === tpl) : null;
        const kbRefs = incKb ? articles.slice(0, 3).map((a) => a.title || a.id) : [];
        const prefix = tmpl ? (tmpl.body || tmpl.content || '') : '';
        const actions = suggestedActions.length ? 'Suggested next steps: ' + suggestedActions.join(', ') + '.' : '';
        const body = [prefix, msg ? 'Regarding your inquiry: ' + msg : '', actions].filter(Boolean).join(' ');
        return { response: body, alternatives: [body.replace(/empathetic/gi, 'professional'), body.replace(/empathetic/gi, 'friendly')], confidence: 0.8, suggestedActions, kbReferences: kbRefs, tone: t, template: tpl || null, createdAt: new Date().toISOString(), source: 'local' };
      }
      const r = draftResponse(ticketId, customerMessage, tone, template, includeKB, kbArticles);
      const store = ctx.store.load('responses', []); store.push(r);
      ctx.store.save('responses', store);
      const result = { success: true, data: { response: r, storePath: ctx.store.getFilePath('responses') } };

      return result;
    }
  });

export { RESPONSE_DRAFTING };
