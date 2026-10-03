// This Support intake Skill takes the ticket as its input and there is no wired
// helpdesk connector that supplies it, so a person is the only possible invoker.
// It was Event-triggered, which left it unreachable as bound (design 0.3/0.14).
// Its three lower-order steps live in ../tools/ticket-analysis.ts.
// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

export const SUPPORT_RESOLVE_TICKET = createDeclarativeCodeSkill({
  id: 'support-resolve-ticket',
  name: 'Resolve Support Ticket',
  description: 'Resolve a support ticket by creating a resolution record. Grounded by the support knowledge base.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'advise',
  domainKnowledge: 'Support ticket resolution workflows, customer issue tracking, and resolution documentation.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket: SchemaProps.text({ description: 'Ticket identifier' }),
      issue: SchemaProps.text({ description: 'Issue description to resolve' }),
    },
    required: ['ticket', 'issue'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Resolve this support ticket', 'Walk me through this ticket', 'Draft the resolution for this issue'] },
  ],
  isSkill: true,
  manifest: {
    // Understanding a ticket means reading the thread, classifying the issue and
    // finding prior handling. Those three live in ../tools and are this Skill's own
    // work, so they sit behind it rather than floating free as entry points.
    lowerOrderTools: ['support-search-kb', 'support-issue-analysis', 'support-sentiment-analysis'],
    actionLabel: 'Resolve support ticket',
  },
  handler: async function handler(input, ctx) {
      const ticketId = input.ticket || '';
      const issue = input.issue || '';

      const store = ctx.store.load('tickets', []);
      const ticket = { id: 'ticket_' + Date.now(), ticketId: ticketId, issue: issue, resolution: 'No resolution provided', status: 'open', createdAt: new Date().toISOString(), source: 'local' };
      store.push(ticket);
      ctx.store.save('tickets', store);
      const result = { success: true, data: { ticket, storePath: ctx.store.getFilePath('tickets') } };

      return result;
    }
  });
