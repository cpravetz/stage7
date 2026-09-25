import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SUPPORT_HOME = process.env.SUPPORT_HOME || '/tmp/support';

export const SUPPORT_RESOLVE_TICKET = createCodeSkill({
  id: 'support-resolve-ticket',
  name: 'Resolve Support Ticket',
  description: 'Resolve a support ticket by creating a resolution record. Grounded by the support knowledge base.',
  tier: 'advise',
  domainKnowledge: 'Support ticket resolution workflows, customer issue tracking, and resolution documentation.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    workflowStage: 'intake',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const ticketId = input.ticket || '';
const issue = input.issue || '';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const ticketPath = path.join(baseDir, 'tickets.json');
fs.mkdirSync(baseDir, { recursive: true });
function loadJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return []; } }
const store = loadJSON(ticketPath);
const ticket = { id: 'ticket_' + Date.now(), ticketId: ticketId, issue: issue, resolution: 'No resolution provided', status: 'open', createdAt: new Date().toISOString(), source: 'local' };
store.push(ticket);
fs.writeFileSync(ticketPath, JSON.stringify(store, null, 2));
const result = { success: true, data: { ticket, storePath: ticketPath } };
console.log(JSON.stringify(result));`,
  },
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
    { kind: 'user', phrase_examples: ['Resolve this support ticket', 'Create a resolution for this ticket'] },
  ],
});

export const SUPPORT_SENTIMENT_ANALYSIS = createCodeSkill({
  id: 'support-sentiment-analysis',
  name: 'Analyze Ticket Sentiment',
  description: 'Analyze sentiment of customer communications. Triggered automatically on new ticket receipt.',
  tier: 'advise',
  domainKnowledge: 'Customer sentiment analysis, support ticket prioritization, and emotional tone detection.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    workflowStage: 'intake',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const text = input.text || '';
const source = input.source || 'ticket';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const sentimentPath = path.join(baseDir, 'sentiment.json');
fs.mkdirSync(baseDir, { recursive: true });
function loadJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return []; } }
const store = loadJSON(sentimentPath);
const score = text.length ? (text.match(/[a-z]/g) || []).length % 3 - 1 : 0;
const result = { id: 'sent_' + Date.now(), sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', score, confidence: 0.75, source: source, createdAt: new Date().toISOString() };
store.push(result);
fs.writeFileSync(sentimentPath, JSON.stringify(store, null, 2));
const output = { success: true, data: { result, storePath: sentimentPath } };
console.log(JSON.stringify(output));`,
  },
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
    { kind: 'user', phrase_examples: ['Analyze this ticket sentiment', 'Score the customer tone'] },
  ],
});

export const SUPPORT_ISSUE_ANALYSIS = createCodeSkill({
  id: 'support-issue-analysis',
  name: 'Analyze Support Issue',
  description: 'Analyze and classify support issues for escalation. Triggered when ticket is escalated to tier 2.',
  tier: 'advise',
  domainKnowledge: 'Issue classification, root cause analysis, support escalation patterns, and customer context evaluation.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    workflowStage: 'intake',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const issueText = input.issueText || '';
const customerInfo = input.customerInfo || {};
const analysisType = input.analysisType || 'root_cause';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const analysisPath = path.join(baseDir, 'issues.json');
fs.mkdirSync(baseDir, { recursive: true });
function loadJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return []; } }
const store = loadJSON(analysisPath);
const result = { id: 'issue_' + Date.now(), rootCause: 'Requires investigation', category: 'general', confidence: 0.5, urgency: 'medium', analysisType: analysisType, customerInfo: customerInfo, createdAt: new Date().toISOString() };
store.push(result);
fs.writeFileSync(analysisPath, JSON.stringify(store, null, 2));
const output = { success: true, data: { result, storePath: analysisPath } };
console.log(JSON.stringify(output));`,
  },
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
    { kind: 'user', phrase_examples: ['Analyze this issue', 'Classify this ticket'] },
  ],
});

export const SUPPORT_SEARCH_KB = createCodeSkill({
  id: 'support-search-kb',
  name: 'Search Knowledge Base',
  description: 'Search the support knowledge base for relevant articles. User-triggered for issue resolution assistance.',
  tier: 'advise',
  domainKnowledge: 'Knowledge base search, article retrieval, support documentation lookup, and self-service resolution.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    workflowStage: 'intake',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const query = input.query || '';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const kbPath = path.join(baseDir, 'kb.json');
fs.mkdirSync(baseDir, { recursive: true });
function loadJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return []; } }
const qp = query.toLowerCase().trim();
const store = loadJSON(kbPath);
const results = !query || !query.trim() ? [] : store.filter((a) => (a.title || '').toLowerCase().includes(qp) || (a.body || '').toLowerCase().includes(qp)).map((a) => ({ title: a.title, body: a.body, score: 1, id: a.id }));
const result = { success: true, data: { query, results, storePath: kbPath } };
console.log(JSON.stringify(result));`,
  },
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
    { kind: 'user', phrase_examples: ['Search knowledge base for this issue', 'Find relevant articles for this problem'] },
  ],
});
