import { Tool } from '../../../types';

const now = () => new Date();

export const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const SUPPORT_RESPONSE_DRAFTER: Tool = {
  id: 'support-response-drafter',
  name: 'Support Response Drafter',
  description: 'Draft a customer support reply using the provided message, tone, knowledge base references, and response template material.',
  type: 'reasoning',
  tier: 'aid',
  schemaVersion: 1,
  isSkill: false,
  manifest: {},
  domainKnowledge: 'Customer support response drafting: empathetic, clear replies grounded in provided KB material and templates.',
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'Draft a customer support reply. Use only the material provided below.\n\n' +
      'Customer message: {{input.customerMessage}}\n' +
      'Tone: {{input.tone}}\n' +
      'Ticket ID: {{input.ticket}}\n' +
      'Knowledge base article titles (use only these as references, if relevant): {{input.kbArticles}}\n' +
      'Response template body (use as guidance/material if provided): {{input.tmplBody}}\n' +
      'Suggested actions: {{input.suggestedActions}}\n' +
      'Other context: {{input}}\n\n' +
      'Return a JSON object with this exact shape:\n' +
      '{\n' +
      '  "ticketId": string,\n' +
      '  "response": string,\n' +
      '  "alternatives": string[],\n' +
      '  "confidence": number,\n' +
      '  "suggestedActions": string[],\n' +
      '  "kbReferences": string[],\n' +
      '  "tone": string,\n' +
      '  "template": string | null,\n' +
      '  "createdAt": string,\n' +
      '  "source": string\n' +
      '}\n\n' +
      'Write the response using only the provided customer message, KB article titles, and template material. Do not invent policies, facts, or KB content. ' +
      'Set kbReferences to the subset of provided KB article titles actually used. Set source to "brain". Output only the JSON object.',
    maxTokens: 2048,
    temperature: 0.4,
    optimizeFor: 'accuracy',
    outputFormat: 'json',
  },
  inputSchema: {
    type: 'object',
    properties: {
      ticket: { type: 'string' },
      customerMessage: { type: 'string' },
      tone: { type: 'string' },
      template: { type: 'string' },
      includeKB: { type: 'boolean' },
      suggestedActions: { type: 'array', items: { type: 'string' } },
      kbArticles: { type: 'array' },
      tmplBody: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      ticketId: { type: 'string' },
      response: { type: 'string' },
      alternatives: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      suggestedActions: { type: 'array', items: { type: 'string' } },
      kbReferences: { type: 'array', items: { type: 'string' } },
      tone: { type: 'string' },
      template: { type: ['string', 'null'] },
      createdAt: { type: 'string' },
      source: { type: 'string' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
};
