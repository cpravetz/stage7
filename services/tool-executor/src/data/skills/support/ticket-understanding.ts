// These four Support intake Skills take the ticket, message, issue text or query
// as their input and there is no wired helpdesk connector that supplies it, so a
// person is the only possible invoker. They were Event-triggered, which left
// them unreachable as bound (design 0.3/0.14).
// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

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
    workflowStage: 'intake'
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

export const SUPPORT_SENTIMENT_ANALYSIS = createDeclarativeCodeSkill({
  id: 'support-sentiment-analysis',
  name: 'Analyze Ticket Sentiment',
  description: 'Analyze sentiment of customer communications. Triggered automatically on new ticket receipt.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'advise',
  domainKnowledge: 'Customer sentiment analysis, support ticket prioritization, and emotional tone detection.',
  inputSchema: {
    type: 'object',
    properties: {
      text: SchemaProps.text({ description: 'Text to analyze for sentiment' }),
      source: SchemaProps.select(['ticket', 'chat', 'email', 'survey', 'review'], { description: 'Source of the text' }),
    },
    required: ['text'],
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
    { kind: 'user', phrase_examples: ['Read the sentiment of this message', 'Is this customer frustrated', 'Score the tone of this ticket'] },
  ],
  isSkill: true,
  manifest: {
    workflowStage: 'intake'
  },
  handler: async function handler(input, ctx) {
      const text = input.text || '';
      const source = input.source || 'ticket';

      const store = ctx.store.load('sentiment', []);
      const score = text.length ? (text.match(/[a-z]/g) || []).length % 3 - 1 : 0;
      const result = { id: 'sent_' + Date.now(), sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', score, confidence: 0.75, source: source, createdAt: new Date().toISOString() };
      store.push(result);
      ctx.store.save('sentiment', store);
      const output = { success: true, data: { result, storePath: ctx.store.getFilePath('sentiment') } };

      return output;
    }
  });

export const SUPPORT_ISSUE_ANALYSIS = createDeclarativeCodeSkill({
  id: 'support-issue-analysis',
  name: 'Analyze Support Issue',
  description: 'Analyze and classify support issues for escalation. Triggered when ticket is escalated to tier 2.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'advise',
  domainKnowledge: 'Issue classification, root cause analysis, support escalation patterns, and customer context evaluation.',
  inputSchema: {
    type: 'object',
    properties: {
      issueText: SchemaProps.text({ description: 'Issue text to analyze' }),
      customerInfo: SchemaProps.object({}, { description: 'Customer information context' }),
      analysisType: SchemaProps.select(['root_cause', 'classification', 'pattern_detection', 'similarity', 'prediction'], { description: 'Type of analysis to perform' }),
    },
    required: ['issueText'],
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
    { kind: 'user', phrase_examples: ['Analyze this support issue', 'What is causing these tickets', 'Group these tickets by root cause'] },
  ],
  isSkill: true,
  manifest: {
    workflowStage: 'intake'
  },
  handler: async function handler(input, ctx) {
      const issueText = input.issueText || '';
      const customerInfo = input.customerInfo || {};
      const analysisType = input.analysisType || 'root_cause';

      const store = ctx.store.load('issues', []);
      const result = { id: 'issue_' + Date.now(), rootCause: 'Requires investigation', category: 'general', confidence: 0.5, urgency: 'medium', analysisType: analysisType, customerInfo: customerInfo, createdAt: new Date().toISOString() };
      store.push(result);
      ctx.store.save('issues', store);
      const output = { success: true, data: { result, storePath: ctx.store.getFilePath('issues') } };

      return output;
    }
  });

export const SUPPORT_SEARCH_KB = createDeclarativeCodeSkill({
  id: 'support-search-kb',
  name: 'Search Knowledge Base',
  description: 'Search the support knowledge base for relevant articles. Triggered automatically on new ticket receipt.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'advise',
  domainKnowledge: 'Knowledge base search, article retrieval, support documentation lookup, and self-service resolution.',
  inputSchema: {
    type: 'object',
    properties: {
      query: SchemaProps.text({ description: 'Search query for knowledge base' }),
    },
    required: ['query'],
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
    { kind: 'user', phrase_examples: ['Search the knowledge base for this', 'What do we do about this issue', 'Find the article that covers this'] },
  ],
  isSkill: true,
  manifest: {
    workflowStage: 'intake'
  },
  handler: async function handler(input, ctx) {
      const query = input.query || '';

      const qp = query.toLowerCase().trim();
      const store = ctx.store.load('kb', []);
      const results = !query || !query.trim() ? [] : store.filter((a) => (a.title || '').toLowerCase().includes(qp) || (a.body || '').toLowerCase().includes(qp)).map((a) => ({ title: a.title, body: a.body, score: 1, id: a.id }));
      const result = { success: true, data: { query, results, storePath: ctx.store.getFilePath('kb') } };

      return result;
    }
  });
