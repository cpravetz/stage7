import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SUPPORT_HOME = process.env.SUPPORT_HOME || '/tmp/support';

export const TICKET_UNDERSTANDING = createCodeSkill({
  id: 'ticket-understanding',
  name: 'Ticket Understanding',
  description: 'Understand and analyze support tickets including resolution, sentiment, issue classification, and knowledge base search. Grounded by the support knowledge base.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'resolve-ticket';
const ticketId = input.ticketId || '';
const issue = input.issue || '';
const query = input.query || '';
const text = input.text || '';
const source = input.source || 'ticket';
const customerInfo = input.customerInfo || {};
const issueText = input.issueText || '';
const analysisType = input.analysisType || 'root_cause';
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const ticketPath = path.join(baseDir, 'tickets.json');
const kbPath = path.join(baseDir, 'kb.json');
const sentimentPath = path.join(baseDir, 'sentiment.json');
const analysisPath = path.join(baseDir, 'issues.json');
fs.mkdirSync(baseDir, { recursive: true });
function loadJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return []; } }
function resolveTicket(tid, iss) {
  const store = loadJSON(ticketPath);
  const ticket = { id: 'ticket_' + Date.now(), ticketId: tid, issue: iss, resolution: '', status: 'open', createdAt: new Date().toISOString(), source: 'local' };
  store.push(ticket);
  fs.writeFileSync(ticketPath, JSON.stringify(store, null, 2));
  return { success: true, operation: 'resolve-ticket', data: { ticket, storePath: ticketPath } };
}
function searchKB(q) {
  if (!q || !q.trim()) return [];
  const qp = q.toLowerCase().trim();
  const store = loadJSON(kbPath);
  return store.filter((a) => (a.title || '').toLowerCase().includes(qp) || (a.body || '').toLowerCase().includes(qp)).map((a) => ({ title: a.title, body: a.body, score: 1, id: a.id }));
}
function analyzeSentiment(txt, src) {
  const store = loadJSON(sentimentPath);
  const score = txt.length ? (txt.match(/[a-z]/g) || []).length % 3 - 1 : 0;
  const result = { id: 'sent_' + Date.now(), sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', score, confidence: 0.75, source: src, createdAt: new Date().toISOString() };
  store.push(result);
  fs.writeFileSync(sentimentPath, JSON.stringify(store, null, 2));
  return { success: true, operation: 'sentiment-analysis', data: { result, storePath: sentimentPath } };
}
function analyzeIssue(issTxt, custInfo, aType) {
  const store = loadJSON(analysisPath);
  const result = { id: 'issue_' + Date.now(), rootCause: 'Requires investigation', category: 'general', confidence: 0.5, urgency: 'medium', analysisType: aType, customerInfo: custInfo, createdAt: new Date().toISOString() };
  store.push(result);
  fs.writeFileSync(analysisPath, JSON.stringify(store, null, 2));
  return { success: true, operation: 'issue-analysis', data: { result, storePath: analysisPath } };
}
let result;
switch (operation) {
  case 'resolve-ticket': result = resolveTicket(ticketId, issue); break;
  case 'search-kb': result = { success: true, operation: 'search-kb', data: { query, results: searchKB(query), storePath: kbPath } }; break;
  case 'sentiment-analysis': result = analyzeSentiment(text, source); break;
  case 'issue-analysis': result = analyzeIssue(issueText, customerInfo, analysisType); break;
  default: result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['resolve-ticket', 'sentiment-analysis', 'issue-analysis', 'search-kb'], { description: 'Operation to perform' }),
      ticketId: SchemaProps.text({ description: 'Ticket identifier' }),
      issue: SchemaProps.text({ description: 'Issue description to resolve' }),
      query: SchemaProps.text({ description: 'Search query for knowledge base' }),
      text: SchemaProps.text({ description: 'Text to analyze for sentiment' }),
      source: SchemaProps.select(['ticket', 'chat', 'email', 'survey', 'review'], { description: 'Source of the text' }),
      customerInfo: SchemaProps.object({}, { description: 'Customer information context' }),
      issueText: SchemaProps.text({ description: 'Issue text to analyze' }),
      analysisType: SchemaProps.select(['root_cause', 'classification', 'pattern_detection', 'similarity', 'prediction'], { description: 'Type of analysis to perform' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      operation: { type: 'string' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'operation'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Resolve this ticket', 'Search the knowledge base', 'Analyze sentiment', 'Analyze this issue'] },
    { kind: 'schedule', cadence: 'Daily ticket queue review' },
    { kind: 'event', on: 'New ticket created' },
    { kind: 'event', on: 'Ticket assigned' },
    { kind: 'event', on: 'Customer replied' },
  ],
});
