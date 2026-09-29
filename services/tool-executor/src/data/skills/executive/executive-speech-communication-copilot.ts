import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';
import { executiveResultSchema } from './executive-contract';

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return;
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    property.order = typeof property.order === 'number' ? property.order : index + 1;
    property.hint = property.hint || property.description || 'See the tool documentation for details.';
  });
  return schema;
}

const EXECUTIVE_HOME = process.env.EXECUTIVE_HOME || '/tmp/executive';
const SAFETY_BOUNDARY = 'Executive communication advisory only: drafts are for review and editing; do not send without human approval.';

const SPEECH_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(SAFETY_BOUNDARY)};

  function fail(status, message, title, extra) {
    const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
    if (extra) { for (const key in extra) { base[key] = extra[key]; } }
    console.log(JSON.stringify(base));
  }

  const occasion = input.occasion || '';
  const audience = input.audience || '';
  const keyMessages = Array.isArray(input.keyMessages) ? input.keyMessages : [];
  const tone = input.tone || 'executive';
  const length = input.length || 'medium';
  const format = input.format || 'speech';
  const executiveId = input.executiveId || '';
  const context = input.context || '';
  const constraints = Array.isArray(input.constraints) ? input.constraints : [];

  if (!occasion && !audience && keyMessages.length === 0) {
    fail('not-connected', 'Not connected: provide at least occasion, audience, or key messages', 'Input required');
    return;
  }

  const baseDir = process.env.EXECUTIVE_HOME || '/tmp/executive';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'speech-communication-copilot.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  let structuredOutput;
  let presentBody;

  switch (format) {
    case 'speech': {
      const wordTarget = length === 'short' ? '300-500' : length === 'medium' ? '600-1000' : '1200-2000';
      const lines = [
        'Executive Speech Draft',
        '======================',
        '',
        'Occasion: ' + (occasion || 'unspecified'),
        'Audience: ' + (audience || 'unspecified'),
        'Tone: ' + tone,
        'Target length: ' + wordTarget + ' words',
        'Format: Speech / Keynote',
        '',
        'Key messages (' + keyMessages.length + '):',
      ];

      keyMessages.forEach(function(msg, i) {
        lines.push('  ' + (i + 1) + '. ' + String(msg));
      });

      if (constraints.length > 0) {
        lines.push('');
        lines.push('Constraints:');
        constraints.forEach(function(c) { lines.push('  - ' + String(c)); });
      }

      lines.push('');
      lines.push('Context: ' + (context || 'not provided'));
      lines.push('');
      lines.push('--- DRAFT STRUCTURE ---');
      lines.push('');
      lines.push('1. Opening (hook + purpose): [1-2 paragraphs]');
      lines.push('2. Key Message 1: ' + (keyMessages[0] || '[message 1]') + ' [supporting story/data]');
      if (keyMessages.length > 1) lines.push('3. Key Message 2: ' + (keyMessages[1] || '[message 2]') + ' [supporting story/data]');
      if (keyMessages.length > 2) lines.push('4. Key Message 3: ' + (keyMessages[2] || '[message 3]') + ' [supporting story/data]');
      lines.push('');
      lines.push('5. Transition to close: [bridge to call-to-action]');
      lines.push('6. Closing (call-to-action + vision): [1-2 paragraphs]');
      lines.push('');
      lines.push('--- NOTES FOR SPEAKER ---');
      lines.push('- Practice opening and close aloud');
      lines.push('- Mark pauses and emphasis points');
      lines.push('- Time your delivery; adjust for ' + wordTarget + ' word target');
      if (tone === 'inspirational') lines.push('- Use rhetorical devices: anaphora, triads, contrast');
      if (tone === 'authoritative') lines.push('- Lead with conclusions; use definitive language');
      if (tone === 'conversational') lines.push('- Use inclusive language (we, our); invite dialogue');
      lines.push('');
      lines.push(SAFETY);

      structuredOutput = { format: 'speech', occasion, audience, tone, length, keyMessages, constraints, context, executiveId };
      presentBody = lines.join(NL);
      break;
    }

    case 'board-comm': {
      const lines = [
        'Board Communication Draft',
        '=========================',
        '',
        'Subject: ' + (input.subject || occasion || 'Board Communication'),
        'Audience: ' + (audience || 'Board of Directors'),
        'Tone: ' + tone,
        'Priority: ' + (input.priority || 'standard'),
        '',
        'Key messages (' + keyMessages.length + '):',
      ];

      keyMessages.forEach(function(msg, i) {
        lines.push('  ' + (i + 1) + '. ' + String(msg));
      });

      if (constraints.length > 0) {
        lines.push('');
        lines.push('Constraints / Compliance:');
        constraints.forEach(function(c) { lines.push('  - ' + String(c)); });
      }

      lines.push('');
      lines.push('Context: ' + (context || 'not provided'));
      lines.push('');
      lines.push('--- DRAFT STRUCTURE ---');
      lines.push('');
      lines.push('1. Executive Summary (2-3 sentences): [the bottom line up front]');
      lines.push('2. Context / Background: [why this matters now]');
      lines.push('3. Analysis / Options: [key data, tradeoffs, recommendation]');
      lines.push('4. Decision Requested: [specific ask of the board]');
      lines.push('5. Risks & Mitigation: [top 3 risks]');
      lines.push('6. Appendix: [supporting data, available on request]');
      lines.push('');
      lines.push(SAFETY);

      structuredOutput = { format: 'board-comm', occasion, audience, tone, keyMessages, constraints, context, executiveId, priority: input.priority };
      presentBody = lines.join(NL);
      break;
    }

    case 'stakeholder-message': {
      const channel = input.channel || 'email';
      const lines = [
        'Stakeholder Message Draft',
        '=========================',
        '',
        'Occasion: ' + (occasion || 'unspecified'),
        'Audience: ' + (audience || 'unspecified'),
        'Channel: ' + channel,
        'Tone: ' + tone,
        '',
        'Key messages (' + keyMessages.length + '):',
      ];

      keyMessages.forEach(function(msg, i) {
        lines.push('  ' + (i + 1) + '. ' + String(msg));
      });

      lines.push('');
      lines.push('Context: ' + (context || 'not provided'));
      lines.push('');
      lines.push('--- DRAFT STRUCTURE ---');
      lines.push('');
      lines.push('Subject Line: [clear, specific, ' + (channel === 'email' ? 'under 50 chars' : 'concise') + ']');
      lines.push('');
      lines.push('Opening: [acknowledge context, state purpose in 1-2 sentences]');
      lines.push('');
      lines.push('Body:');
      keyMessages.forEach(function(msg, i) {
        lines.push('  ' + (i + 1) + '. ' + String(msg) + ' [expand with context, data, or story]');
      });
      lines.push('');
      lines.push('Call to Action: [specific next step for recipient]');
      lines.push('');
      lines.push('Closing: [professional sign-off appropriate to ' + tone + ' tone]');
      lines.push('');
      lines.push(SAFETY);

      structuredOutput = { format: 'stakeholder-message', occasion, audience, channel, tone, keyMessages, constraints, context, executiveId };
      presentBody = lines.join(NL);
      break;
    }

    case 'crisis-statement': {
      const lines = [
        'Crisis / Sensitive Communication Draft',
        '======================================',
        '',
        'Occasion: ' + (occasion || 'Crisis response'),
        'Audience: ' + (audience || 'all stakeholders'),
        'Tone: ' + (tone || 'empathetic-authoritative'),
        'Urgency: ' + (input.urgency || 'immediate'),
        '',
        'Key messages (' + keyMessages.length + '):',
      ];

      keyMessages.forEach(function(msg, i) {
        lines.push('  ' + (i + 1) + '. ' + String(msg));
      });

      lines.push('');
      lines.push('Constraints / Legal:');
      constraints.forEach(function(c) { lines.push('  - ' + String(c)); });
      if (constraints.length === 0) lines.push('  [Legal review required before release]');

      lines.push('');
      lines.push('Context: ' + (context || 'not provided'));
      lines.push('');
      lines.push('--- DRAFT STRUCTURE ---');
      lines.push('');
      lines.push('1. Acknowledgment: [what happened, direct and factual]');
      lines.push('2. Impact: [who is affected, how]');
      lines.push('3. Action: [what we are doing right now]');
      lines.push('4. Commitment: [what we will do, by when]');
      lines.push('5. Contact: [how affected parties can reach us]');
      lines.push('');
      lines.push('--- CRISIS COMMUNICATION PRINCIPLES ---');
      lines.push('- Be first, be right, be credible');
      lines.push('- Express genuine empathy before facts');
      lines.push('- Avoid speculation; state only confirmed information');
      lines.push('- Commit to transparency and timeline for updates');
      lines.push('');
      lines.push(SAFETY);

      structuredOutput = { format: 'crisis-statement', occasion, audience, tone, urgency: input.urgency, keyMessages, constraints, context, executiveId };
      presentBody = lines.join(NL);
      break;
    }

    default:
      fail('error', 'Unknown format: ' + format, 'Invalid format');
      return;
  }

  const result = { ...structuredOutput, draft: presentBody };
  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

  console.log(JSON.stringify({
    success: true,
    status: 'ok',
    data: result,
    error: null,
    present: [{ id: 'speech-draft', title: 'Executive Communication Draft', kind: 'text', body: presentBody }],
  }));
})();`;

const SPEECH_INPUT = createSchemaRecord({
  occasion: SchemaProps.text({ description: 'Event or occasion (e.g., "Annual All-Hands", "Board Meeting Q3", "Crisis Response")' }),
  audience: SchemaProps.text({ description: 'Target audience (e.g., "All employees", "Board of Directors", "Investors", "Customers")' }),
  keyMessages: SchemaProps.stringArray({ description: 'Core messages to convey (3-5 max)' }),
  tone: SchemaProps.select(['executive', 'inspirational', 'authoritative', 'conversational', 'empathetic-authoritative', 'visionary'], { description: 'Communication tone', default: 'executive' }),
  length: SchemaProps.select(['short', 'medium', 'long'], { description: 'Target length', default: 'medium' }),
  format: SchemaProps.select(['speech', 'board-comm', 'stakeholder-message', 'crisis-statement'], { description: 'Communication format', default: 'speech' }),
  executiveId: SchemaProps.text({ description: 'Executive identifier' }),
  context: SchemaProps.text({ description: 'Additional context, background, or constraints', multiline: true }),
  constraints: SchemaProps.stringArray({ description: 'Legal, compliance, or stylistic constraints' }),
  subject: SchemaProps.text({ description: 'Subject line (for board/stakeholder formats)' }),
  channel: SchemaProps.select(['email', 'slack', 'letter', 'video-script', 'linkedin'], { description: 'Delivery channel (for stakeholder-message)' }),
  priority: SchemaProps.select(['standard', 'urgent', 'confidential'], { description: 'Priority level (for board-comm)' }),
  urgency: SchemaProps.select(['immediate', 'within-hour', 'today', 'this-week'], { description: 'Urgency level (for crisis-statement)' }),
}, { required: [] });

const SPEECH_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to EXECUTIVE_HOME' }),
});

export const SPEECH_COMMUNICATION_COPILOT = createCodeSkill({
  id: 'executive-speech-communication-copilot',
  name: 'Speech & Communication Co-Pilot',
  description: 'Draft executive speeches, board communications, stakeholder messages, and leadership communications with tone, structure, and messaging guidance.',
  tier: 'aid',
  domainKnowledge: 'Executive communication strategy, speechwriting, board governance communication, crisis communication, stakeholder messaging frameworks',
  manifest: { sourceCode: SPEECH_SOURCE, configSchema: SPEECH_CONFIG, persistenceEnv: 'EXECUTIVE_HOME', ui: { view: 'speech-communication-copilot' } },
  inputSchema: SPEECH_INPUT,
  outputSchema: executiveResultSchema('Speech and communication drafts with structure and messaging guidance'),
  triggers: [{ kind: 'user', phrase_examples: ['Draft a speech for', 'Write a board communication', 'Create a stakeholder message', 'Prepare crisis communication', 'Help me communicate'] }],
  isSkill: true,
});

SPEECH_COMMUNICATION_COPILOT.configSchema = SPEECH_CONFIG;
withUxMetadata(SPEECH_COMMUNICATION_COPILOT.inputSchema as SchemaRecord);
if (SPEECH_COMMUNICATION_COPILOT.configSchema) withUxMetadata(SPEECH_COMMUNICATION_COPILOT.configSchema);
