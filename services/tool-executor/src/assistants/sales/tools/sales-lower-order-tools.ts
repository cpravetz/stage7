import { Tool } from '../../../types';

const now = () => new Date();

// Both reasoning Tools below feed their `summary` straight into a user-facing
// presentation card, so the model must return only the finished deliverable.
// Without this the raw reasoning trace leaked into the card: a mock-interview
// session opened with the model's "Thinking Process", and its closing lines were
// self-checks about hallucination rather than advice for the candidate.
const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert sales outreach drafter.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the reader in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const SALES_OUTREACH_DRAFTER: Tool = {
  id: 'sales-outreach-drafter',
  domainKnowledge: 'Sales outreach methodology, personalization frameworks, subject-line testing, and sequence design',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Sales Outreach Drafter',
  description: 'Draft sales outreach messages from supplied recipient and variable values. Templates that need an unsupplied variable are skipped and reported rather than filled with invented text, subject variants are deduplicated, and nothing is ever sent.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are drafting sales outreach for the recipient and values described below. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "steps": [\n' +
      '    {\n' +
      '      "step": 1,\n' +
      '      "template": "<templateKey>",\n' +
      '      "templateLabel": "<human label for the template>",\n' +
      '      "subject": "<the chosen subject line>",\n' +
      '      "subjectVariants": ["<subject line>", "<alternate subject line>"],\n' +
      '      "body": "<the full message body as a single string>",\n' +
      '      "channel": "<channel>",\n' +
      '      "delayHours": <number>\n' +
      '    }\n' +
      '  ],\n' +
      '  "customBody": {\n' +
      '    "subject": "<subject>",\n' +
      '    "body": "<body>",\n' +
      '    "subjectVariants": ["<subject>"],\n' +
      '    "template": "custom"\n' +
      '  } | null,\n' +
      '  "skipped": [\n' +
      '    {\n' +
      '      "template": "<templateKey>",\n' +
      '      "label": "<human label>",\n' +
      '      "missingVariables": ["<variableName>"]\n' +
      '    }\n' +
      '  ],\n' +
      '  "unknownTemplateKeys": ["<key>"]\n' +
      '}\n\n' +
      'Rules — follow every one of them. Breaking one is worse than returning an empty list.\n' +
      '1. NEVER invent a value the caller did not supply. Every word in every subject line and every line of every body must trace back to a value present in the supplied input. If a template needs a variable that is missing or null, skip that template entirely and list it in "skipped" with the names of the missing variables.\n' +
      '2. Subject variants must be deduplicated. If two patterns produce the same rendered subject, include it only once. Never include a subject that still contains an unresolved placeholder.\n' +
      '3. A body that would still contain an unresolved placeholder is not a finished draft. Drop it rather than emit it.\n' +
      '4. "steps" is an ordered list. Step 1 has delayHours 0. Each subsequent step adds the supplied sequence delay.\n' +
      '5. "customBody" is populated only when a customTemplate was supplied AND every placeholder in it resolves to a supplied value. Otherwise set it to null.\n' +
      '6. "unknownTemplateKeys" lists any requested template keys that do not correspond to a known template.\n' +
      '7. Nothing is ever sent. This is a draft only.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 4096,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: { type: 'object', properties: { recipient: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, company: { type: 'string' }, industry: { type: 'string' }, title: { type: 'string' }, email: { type: 'string' } } }, template: { type: 'string' }, customTemplate: { type: 'string', multiline: true }, subject: { type: 'string' }, variables: { type: 'object', properties: { valueProp: { type: 'string' }, myCompany: { type: 'string' }, myName: { type: 'string' }, topic: { type: 'string' } } }, sequence: { type: 'array', items: { type: 'string' } }, sequenceDelay: { type: 'number' }, channel: { type: 'string', enum: ['email', 'linkedin', 'sms'] } } },
  outputSchema: { type: 'object', properties: { steps: { type: 'array' }, customBody: { type: ['object', 'null'] }, skipped: { type: 'array' }, unknownTemplateKeys: { type: 'array' } } },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
