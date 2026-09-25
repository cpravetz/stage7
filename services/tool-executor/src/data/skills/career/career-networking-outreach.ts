import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-networking-outreach: drafts recruiter outreach messages.
// Returns { success, data: { summary, message, options, rationale } }
const CAREER_NETWORKING_OUTREACH_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const targetCompany = input.targetCompany || '';
const targetPerson = input.targetPerson || '';
const relationshipStage = input.relationshipStage || 'cold_outreach';
const channel = input.channel || 'email';

if (!targetCompany) {
  console.log(JSON.stringify({ success: false, error: 'targetCompany is required' }));
  return;
}

const stageTemplates = {
  cold_outreach: { subject: 'Exploring opportunities at ' + targetCompany, tone: 'professional and concise' },
  follow_up: { subject: 'Following up on my application', tone: 'professional and persistent' },
  thank_you: { subject: 'Thank you for your time', tone: 'warm and appreciative' },
  referral_ask: { subject: 'Referral request', tone: 'respectful and direct' },
};
const stage = stageTemplates[relationshipStage] || stageTemplates.cold_outreach;

const message = 'Hi ' + (targetPerson ? targetPerson : 'there') + ',\\n\\n' +
  'I am reaching out because I am interested in opportunities at ' + targetCompany + '. ' +
  'I would welcome the chance to connect and learn more about the team and any open roles.\\n\\n' +
  'Best regards';

console.log(JSON.stringify({
  success: true,
  data: {
    summary: 'Drafted a ' + relationshipStage + ' message for ' + targetCompany + (targetPerson ? ' addressed to ' + targetPerson : ''),
    message,
    channel,
    subject: stage.subject,
    tone: stage.tone,
    options: [message],
    rationale: 'Generated based on relationship stage: ' + relationshipStage,
    generatedAt: new Date().toISOString(),
  },
}));
})();`;

const CAREER_NETWORKING_OUTREACH_INPUT = {
  type: 'object',
  properties: {
    targetCompany: { type: 'string' },
    targetPerson: { type: 'string' },
    relationshipStage: { type: 'string', enum: ['cold_outreach', 'follow_up', 'thank_you', 'referral_ask'] },
    channel: { type: 'string', enum: ['email', 'linkedin'] },
    connectedSendTool: { type: 'string' },
  },
};

const CAREER_NETWORKING_OUTREACH_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        message: { type: 'string' },
        channel: { type: 'string' },
        subject: { type: 'string' },
        tone: { type: 'string' },
        options: { type: 'array' },
        rationale: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_NETWORKING_OUTREACH = createCodeSkill({
  id: 'career-networking-outreach',
  name: 'Networking Outreach',
  description: 'Drafts recruiter outreach messages for cold outreach, follow-ups, thank-you notes, and referral asks across email and LinkedIn.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_NETWORKING_OUTREACH_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Draft outreach',
  },
  inputSchema: CAREER_NETWORKING_OUTREACH_INPUT,
  outputSchema: CAREER_NETWORKING_OUTREACH_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Draft recruiter outreach', 'Write a follow-up message', 'Ask for a referral'] },
  ],
});
CAREER_NETWORKING_OUTREACH.configSchema = CAREER_NETWORKING_OUTREACH.manifest.configSchema as SchemaRecord;

export { CAREER_NETWORKING_OUTREACH };
