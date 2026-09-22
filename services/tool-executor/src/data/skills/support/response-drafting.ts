import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const RESPONSE_DRAFTING_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'support-response';
const ticketId = input.ticket || '';
const customerMessage = input.customerMessage || '';
const tone = input.tone || 'empathetic';
const template = input.template || '';
const includeKB = input.includeKB !== false;
const suggestedActions = input.suggestedActions || [];
const baseDir = process.env.SUPPORT_HOME || path.join('/tmp/support');
const responsePath = path.join(baseDir, 'responses.json');
const kbPath = path.join(baseDir, 'kb.json');
const templatePath = path.join(baseDir, 'templates.json');
fs.mkdirSync(baseDir, { recursive: true });
function loadJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return []; } }
let kbArticles = [];
if (includeKB && fs.existsSync(kbPath)) { try { kbArticles = JSON.parse(fs.readFileSync(kbPath, 'utf8')); } catch(e) {} }
let templates = [];
if (fs.existsSync(templatePath)) { try { templates = JSON.parse(fs.readFileSync(templatePath, 'utf8')); } catch(e) {} }
function draftResponse(tid, msg, t, tpl, incKb, articles) {
  const tmpl = tpl ? templates.find((x) => (x.name || x.id) === tpl) : null;
  const kbRefs = incKb ? articles.slice(0, 3).map((a) => a.title || a.id) : [];
  const prefix = tmpl ? (tmpl.body || tmpl.content || '') : '';
  const actions = suggestedActions.length ? 'Suggested next steps: ' + suggestedActions.join(', ') + '.' : '';
  const body = [prefix, msg ? 'Regarding your inquiry: ' + msg : '', actions].filter(Boolean).join(' ');
  return { response: body, alternatives: [body.replace(/empathetic/gi, 'professional'), body.replace(/empathetic/gi, 'friendly')], confidence: 0.8, suggestedActions, kbReferences: kbRefs, tone: t, template: tpl || null, createdAt: new Date().toISOString(), source: 'local' };
}
let result;
switch (operation) {
  case 'support-response': {
    const r = draftResponse(ticketId, customerMessage, tone, template, includeKB, kbArticles);
    const store = loadJSON(responsePath); store.push(r);
    fs.writeFileSync(responsePath, JSON.stringify(store, null, 2));
    result = { success: true, operation: 'support-response', data: { response: r, storePath: responsePath } }; break;
  }
  case 'draft-response': {
    const r = draftResponse(ticketId, customerMessage, tone, template, includeKB, kbArticles);
    result = { success: true, operation: 'draft-response', data: { response: r } }; break;
  }
  default: result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));`;

const RESPONSE_DRAFTING = createCodeSkill({
  id: 'response-drafting',
  name: 'Response Drafting',
  description: 'Generate contextual support responses using ticket context, knowledge base articles, and response templates.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: RESPONSE_DRAFTING_SOURCE,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['support-response', 'draft-response'], { description: 'Operation to perform' }),
      ticket: SchemaProps.text({ description: 'Ticket identifier for the response' }),
      customerMessage: SchemaProps.text({ description: 'Customer message to respond to' }),
      tone: SchemaProps.select(['professional', 'friendly', 'empathetic', 'technical'], { description: 'Tone of the generated response', default: 'empathetic' }),
      template: SchemaProps.text({ description: 'Response template to use' }),
      includeKB: SchemaProps.boolean({ description: 'Whether to include knowledge base references', default: true }),
      suggestedActions: SchemaProps.stringArray({ description: 'Suggested next steps' }),
    },
    required: ['operation', 'customerMessage'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      operation: { type: 'string' },
      response: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'operation', 'response'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Draft a response', 'Write a reply', 'Respond to this customer'] },
    { kind: 'schedule', cadence: 'Daily response queue review' },
    { kind: 'event', on: 'New ticket created' },
    { kind: 'event', on: 'Customer replied' },
  ],
});

export { RESPONSE_DRAFTING };
