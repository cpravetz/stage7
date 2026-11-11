import { Tool } from '../../../types';

const now = () => new Date();

const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const SALES_LEAD_DEAL_ADVISOR: Tool = {
  id: 'sales-lead-deal-advisor',
  domainKnowledge: 'Sales qualification frameworks, lead scoring rubrics, and pipeline prioritization',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Sales Lead Deal Advisor',
  description: 'Score, rank, and sequence supplied leads using a genuine qualification rubric and produce per-lead rationale, capacity notes, and risks.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are advising on the supplied leads and deal context. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "scoredLeads": [\n' +
      '    {\n' +
      '      "id": "<lead id>",\n' +
      '      "name": "<lead name>",\n' +
      '      "title": "<lead title>",\n' +
      '      "seniority": "<assessed seniority>",\n' +
      '      "companySize": "<company size>",\n' +
      '      "annualRevenue": <number|null>,\n' +
      '      "engagementScore": <number>,\n' +
      '      "behavioralScore": <number>,\n' +
      '      "totalScore": <number>,\n' +
      '      "rank": <number>,\n' +
      '      "rationale": "<written rationale for this lead>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "capacityPlan": "<capacity notes>",\n' +
      '  "prioritizedSequence": ["<lead id or name in recommended order>"],\n' +
      '  "risks": ["<risk>"],\n' +
      '  "summary": "<overall summary>"\n' +
      '}\n\n' +
      'Rules — follow every one of them.\n' +
      '1. Score and rank the supplied leads using a genuine qualification rubric that weighs seniority, firmographic fit, engagement signals, and behavioral intent.\n' +
      '2. Produce a written rationale per lead explaining how those factors drove its score and rank.\n' +
      '3. Produce a prioritized sequence, capacity notes, and risks grounded in the supplied input.\n' +
      '4. Never emit identical scores for every lead. Differentiate scores based on the supplied evidence; if leads are genuinely similar, explain the distinguishing factors in their rationales and reflect any small differences in scoring.\n' +
      '5. Use only information present in the supplied input; do not invent facts or external data.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 4096,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: {
    type: 'object',
    properties: {
      leads: { type: 'array', items: { type: 'object' } },
      weights: { type: 'object' },
      threshold: { type: 'number' },
      hotThreshold: { type: 'number' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      scoredLeads: { type: 'array' },
      capacityPlan: { type: 'string' },
      prioritizedSequence: { type: 'array' },
      risks: { type: 'array' },
      summary: { type: 'string' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
