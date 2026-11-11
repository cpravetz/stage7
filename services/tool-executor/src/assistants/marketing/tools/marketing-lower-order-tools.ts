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

export const MARKETING_CAMPAIGN_PLANNER: Tool = {
  id: 'marketing-campaign-planner',
  domainKnowledge:
    'Marketing campaign planning, channel strategy, budget allocation, timeline phasing, KPI definition, audience targeting, and messaging',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Marketing Campaign Planner',
  description:
    'Plan a marketing campaign by generating timeline phases, channel allocations, KPIs, strategy, audience definition, and messaging from supplied product, budget, and channels.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are planning a marketing campaign from the details supplied below. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "id": "<campaign id string>",\n' +
      '  "product": "<product name or description>",\n' +
      '  "budget": <number>,\n' +
      '  "channels": ["<channel>"],\n' +
      '  "timeline": [\n' +
      '    {\n' +
      '      "phase": "<phase name>",\n' +
      '      "channel": "<channel>",\n' +
      '      "allocation": <number>,\n' +
      '      "duration": "<duration>",\n' +
      '      "activities": ["<activity>"],\n' +
      '      "kpis": ["<kpi name or focus>"]\n' +
      '    }\n' +
      '  ],\n' +
      '  "kpis": [\n' +
      '    { "name": "<kpi name>", "target": "<target value>", "metric": "<metric definition>" }\n' +
      '  ],\n' +
      '  "strategy": "<overall campaign strategy>",\n' +
      '  "audience": "<target audience definition>",\n' +
      '  "messaging": "<core messaging and value proposition>",\n' +
      '  "createdAt": "<ISO-8601 timestamp>",\n' +
      '  "source": "brain"\n' +
      '}\n\n' +
      'Rules — follow every one of them:\n' +
      '1. Generate concrete timeline phases, channel allocations, activities, and phase KPIs from the supplied product, budget, and channels. Do not return empty timeline or kpis arrays.\n' +
      '2. Channel allocations across the timeline must sum to the supplied budget.\n' +
      '3. Generate meaningful campaign-level KPIs with targets and metrics appropriate to the supplied channels and goals.\n' +
      '4. Generate a clear strategy, audience definition, and messaging grounded in the supplied product and channels.\n' +
      '5. Return JSON only.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 4096,
    temperature: 0.4,
    optimizeFor: 'accuracy',
  },
  inputSchema: {
    type: 'object',
    properties: {
      product: { type: 'string' },
      budget: { type: 'number' },
      channels: { type: 'array', items: { type: 'string' } },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      product: { type: 'string' },
      budget: { type: 'number' },
      channels: { type: 'array', items: { type: 'string' } },
      timeline: { type: 'array' },
      kpis: { type: 'array' },
      strategy: { type: 'string' },
      audience: { type: 'string' },
      messaging: { type: 'string' },
      createdAt: { type: 'string' },
      source: { type: 'string' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
