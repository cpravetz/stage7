import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const OUTREACH_DRAFTING_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.SALES_HOME || path.join('/tmp/sales');
const storePath = path.join(baseDir, 'outreach-drafts.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const defaultTemplates = { cold: 'Hi {{firstName}},\\n\\nI noticed {{company}} is tackling {{industry}} challenges. At {{myCompany}} we help teams like yours {{valueProp}}. Would you have 15 min this week to explore a fit?\\n\\nBest,\\n{{myName}}', followup: 'Hi {{firstName}},\\n\\nFollowing up on my note about {{valueProp}}. Happy to jump on a quick call if helpful.\\n\\n{{myName}}', nurture: 'Hi {{firstName}},\\n\\nSharing a quick resource on {{topic}} that might be relevant to {{company}}. Let me know if you have questions.\\n\\n{{myName}}' };
const subjectVariants = { cold: ['Quick question about {{industry}}', '{{firstName}}, {{company}} + {{myCompany}}?', 'Curious about your {{industry}} stack'], followup: ['Following up on {{topic}}', 'Re: {{subject}}', 'Quick follow-up'], nurture: ['Resource on {{topic}}', '{{firstName}}, thought you might find this useful'] };
function render(text, variables) { return String(text || '').replace(/{{(\\w+)}}/g, (m, key) => variables[key] != null ? variables[key] : m); }
const recipient = input.recipient || {};
const variables = input.variables || {};
const templateKey = input.template || 'cold';
const template = defaultTemplates[templateKey] || input.customTemplate || defaultTemplates.cold;
const baseVars = Object.assign({ company: recipient.company || 'your company', firstName: recipient.firstName || 'there', industry: recipient.industry || 'your', valueProp: variables.valueProp || 'deliver value', myCompany: variables.myCompany || 'our team', myName: variables.myName || 'Your team' }, variables);
const body = render(template, baseVars);
const subjects = (subjectVariants[templateKey] || ['Outreach']).map((s) => render(s, Object.assign({ subject: input.subject || '' }, baseVars)));
const sequence = input.sequence || [templateKey];
const sequenceSteps = sequence.map((step, idx) => ({ step: idx + 1, template: step, subject: subjects[idx] || subjects[0], body: render(defaultTemplates[step] || template, Object.assign({ subject: input.subject || '' }, baseVars)), delayHours: (idx + 1) * Number(input.sequenceDelay || 48) }));
const draft = { id: 'draft_' + Date.now(), recipient, template: templateKey, subject: subjects[0], subjectVariants: subjects, body, sequenceSteps, channel: input.channel || 'email', createdAt: new Date().toISOString(), source: 'reasoning', rationale: 'Drafted ' + templateKey + ' template for ' + (recipient.firstName || 'recipient') + ' at ' + (recipient.company || 'company') + '. Body=' + body.length + ' chars, ' + subjects.length + ' subject variants.' };
store.push(draft);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { draft, storePath } }));
return draft;`;

const OUTREACH_DRAFTING = createCodeSkill({
  id: 'outreach-drafting',
  name: 'Outreach Drafting',
  description: 'Draft personalized sales outreach emails with templated bodies, A/B subject variants, and multi-step sequences. Runs reasoning-only on local data; no external API required.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: OUTREACH_DRAFTING_SOURCE },
  inputSchema: {
    type: 'object',
    properties: {
      recipient: SchemaProps.object({ firstName: SchemaProps.text({ description: 'Recipient first name' }), lastName: SchemaProps.text({ description: 'Recipient last name' }), company: SchemaProps.text({ description: 'Recipient company' }), industry: SchemaProps.text({ description: 'Recipient industry' }), title: SchemaProps.text({ description: 'Recipient job title' }), email: SchemaProps.email({ description: 'Recipient email address' }) }, { description: 'Intended recipient of the outreach' }),
      template: SchemaProps.select(['cold', 'followup', 'nurture'], { description: 'Email template to use' }),
      customTemplate: SchemaProps.text({ description: 'Custom template body with {{variable}} placeholders', multiline: true }),
      subject: SchemaProps.text({ description: 'Override subject line' }),
      variables: SchemaProps.object({ valueProp: SchemaProps.text({ description: 'Value proposition to insert' }), myCompany: SchemaProps.text({ description: 'Sender company name' }), myName: SchemaProps.text({ description: 'Sender name' }), topic: SchemaProps.text({ description: 'Topic or resource name' }) }, { description: 'Variables for template rendering' }),
      sequence: SchemaProps.stringArray({ description: 'Sequence of template keys for multi-step outreach' }),
      sequenceDelay: SchemaProps.number({ description: 'Hours between sequence steps', default: 48 }),
      channel: SchemaProps.select(['email', 'linkedin', 'sms'], { description: 'Outreach channel' }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object', description: 'Generated email draft with subject variants and sequence steps' },
      storePath: { type: 'string' },
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Draft an outreach email', 'Write a follow-up', 'Create an email sequence'] },
  ],
});

export { OUTREACH_DRAFTING };
