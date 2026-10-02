// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

/**
 * User half of the response-drafting split. It was event-triggered
 * ("Ticket classification output is available") while requiring customerMessage,
 * which that event does not supply -- so the trigger promised automation the
 * input schema could not satisfy. This half is now user-triggered, which is what
 * the required input actually implied. The notifier half
 * (response-drafting-notifier) owns the automated path and reads its queued
 * messages from configured stores. The reply composer is inlined in the handler
 * rather than imported, because the sandbox only has `stage7-runtime` available
 * and an imported identifier is an undefined reference there.
 */
const RESPONSE_DRAFTING_USER = createDeclarativeCodeSkill({
  id: 'response-drafting-user',
  name: 'Response Drafting',
  description: 'Draft a support reply to a customer message you supply, using KB articles and response templates.',
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
    {
      kind: 'user',
      phrase_examples: [
        'Draft a reply to this customer',
        'Write a response to this ticket',
        'Help me respond to this message',
      ],
    },
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
      const tmpl = template ? templates.find((x) => (x.name || x.id) === template) : null;
      const kbRefs = includeKB ? kbArticles.slice(0, 3).map((a) => a.title || a.id) : [];
      const prefix = tmpl ? (tmpl.body || tmpl.content || '') : '';
      const actions = suggestedActions.length ? 'Suggested next steps: ' + suggestedActions.join(', ') + '.' : '';
      const body = [prefix, customerMessage ? 'Regarding your inquiry: ' + customerMessage : '', actions].filter(Boolean).join(' ');
      const r = {
        ticketId,
        response: body,
        alternatives: [body.replace(/empathetic/gi, 'professional'), body.replace(/empathetic/gi, 'friendly')],
        confidence: 0.8,
        suggestedActions,
        kbReferences: kbRefs,
        tone,
        template: template || null,
        createdAt: new Date().toISOString(),
        source: 'local',
      };
      const store = ctx.store.load('responses', []); store.push(r);
      ctx.store.save('responses', store);
      const result = {
        success: true,
        data: { response: r, storePath: ctx.store.getFilePath('responses') },
        // Without this the Overview panel shows a completed run with nothing in
        // it: the envelope said success and rendered no block at all.
        present: [
          ctx.render.text('report', 'Drafted Response', [
            'Ticket: ' + (ticketId || '(unspecified)'),
            'Tone: ' + tone,
            r.kbReferences.length ? 'KB references: ' + r.kbReferences.join(', ') : 'KB references: none',
            '',
            r.response || '(no response body produced)',
            '',
            'Alternatives:',
            '  - ' + (r.alternatives[0] || '(none)'),
            '  - ' + (r.alternatives[1] || '(none)'),
            '',
            'Stored at: ' + ctx.store.getFilePath('responses'),
          ]),
        ],
      };

      return result;
    }
  });

export { RESPONSE_DRAFTING_USER };
