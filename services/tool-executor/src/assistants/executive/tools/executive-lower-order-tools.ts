import { Tool } from '../../../types';

const now = () => new Date();

// Both reasoning Tools below feed their `summary` straight into a user-facing
// presentation card, so the model must return only the finished deliverable.
// Without this the raw reasoning trace leaked into the card: a mock-interview
// session opened with the model's "Thinking Process", and its closing lines were
// self-checks about hallucination rather than advice for the candidate.
const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const EXECUTIVE_COMMUNICATION_DRAFTER: Tool = {
  id: 'executive-communication-drafter',
  domainKnowledge:
    'Executive communication strategy, speechwriting, board governance communication, crisis communication, stakeholder messaging frameworks',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Executive Communication Drafter',
  description:
    'Draft executive speeches, board communications, stakeholder messages, and crisis statements from supplied occasion, audience, key messages, tone, and context.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are drafting an executive communication from the details supplied below. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "format": "<speech | board-comm | stakeholder-message | crisis-statement>",\n' +
      '  "occasion": "<occasion>",\n' +
      '  "audience": "<audience>",\n' +
      '  "tone": "<tone>",\n' +
      '  "length": "<short | medium | long>",\n' +
      '  "keyMessages": ["<key message>"],\n' +
      '  "constraints": ["<constraint>"],\n' +
      '  "context": "<additional context>",\n' +
      '  "subject": "<subject line or null>",\n' +
      '  "channel": "<delivery channel or null>",\n' +
      '  "priority": "<priority or null>",\n' +
      '  "urgency": "<urgency or null>",\n' +
      '  "draft": "<the fully-written communication text appropriate to the format>"\n' +
      '}\n\n' +
      'Rules — follow every one of them:\n' +
      '1. "draft" must be the complete, fully-written communication (speech body, board memo, stakeholder message, or crisis statement) appropriate to the requested format, occasion, audience, key messages, tone, length, context, and constraints.\n' +
      '2. Write the actual prose from the supplied details. Never emit a structure template, outline skeleton, or any text with [placeholder] brackets.\n' +
      '3. Include every supplied key message meaningfully in the draft. Reflect the requested tone, length, and any supplied constraints.\n' +
      '4. Echo back format, occasion, audience, tone, length, keyMessages, constraints, context, subject, channel, priority, and urgency from the input (use null for fields not supplied).\n' +
      '5. Return JSON only.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 4096,
    temperature: 0.4,
    optimizeFor: 'accuracy',
  },
  inputSchema: {
    type: 'object',
    properties: {
      occasion: { type: 'string' },
      audience: { type: 'string' },
      keyMessages: { type: 'array', items: { type: 'string' } },
      tone: { type: 'string' },
      length: { type: 'string' },
      format: { type: 'string' },
      context: { type: 'string', multiline: true },
      constraints: { type: 'array', items: { type: 'string' } },
      subject: { type: 'string' },
      channel: { type: 'string' },
      priority: { type: 'string' },
      urgency: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      format: { type: 'string' },
      occasion: { type: 'string' },
      audience: { type: 'string' },
      tone: { type: 'string' },
      length: { type: 'string' },
      keyMessages: { type: 'array', items: { type: 'string' } },
      constraints: { type: 'array', items: { type: 'string' } },
      context: { type: 'string' },
      subject: { type: ['string', 'null'] },
      channel: { type: ['string', 'null'] },
      priority: { type: ['string', 'null'] },
      urgency: { type: ['string', 'null'] },
      draft: { type: 'string' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
