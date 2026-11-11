import { Tool } from '../../../types';

const now = () => new Date();

// Both reasoning Tools below feed their `summary` straight into a user-facing
// presentation card, so the model must return only the finished deliverable.
// Without this the raw reasoning trace leaked into the card.
const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const PRODUCT_PRD_GENERATOR: Tool = {
  id: 'product-prd-generator',
  domainKnowledge: 'Product requirements documents: problem statements, goals, user stories, acceptance criteria, technical and data requirements, UX flows, rollout plans.',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Product PRD Generator',
  description: 'Generate a structured product requirements document as JSON from product context supplied by the caller.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are a senior product manager. Generate a complete product requirements document as a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "title": "<string>",\n' +
      '  "problem": "<string>",\n' +
      '  "scope": "<string>",\n' +
      '  "goals": ["<string>", ...],\n' +
      '  "successMetrics": ["<string>", ...],\n' +
      '  "nonGoals": ["<string>", ...],\n' +
      '  "openQuestions": ["<string>", ...],\n' +
      '  "targetUsers": ["<string>", ...],\n' +
      '  "userStories": [\n' +
      '    {\n' +
      '      "id": "<string>",\n' +
      '      "text": "<string>",\n' +
      '      "userType": "<string>",\n' +
      '      "invest": { "independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true, "score": "<string>" },\n' +
      '      "acceptanceCriteria": [\n' +
      '        { "id": "<string>", "storyIndex": <number>, "format": "Given/When/Then", "given": "<string>", "when": "<string>", "then": "<string>", "passed": false, "priority": "must" }\n' +
      '      ],\n' +
      '      "definitionOfDone": "<string>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "technicalRequirements": {\n' +
      '    "functional": [ { "id": "<string>", "category": "<string>", "description": "<string>", "priority": "<string>", "type": "functional" } ],\n' +
      '    "nonFunctional": [ { "id": "<string>", "category": "<string>", "description": "<string>", "priority": "<string>", "type": "non-functional" } ]\n' +
      '  },\n' +
      '  "dataRequirements": {\n' +
      '    "entities": [ { "id": "<string>", "name": "<string>", "attributes": [ { "name": "<string>", "type": "<string>", "required": true, "unique": true, "foreignKey": "<string>", "privacy": "<string>", "retention": "<string>" } ], "privacy": "<string>", "retentionPolicy": "<string>", "anonymization": "<string>" } ],\n' +
      '    "relationships": [],\n' +
      '    "privacy": {}\n' +
      '  },\n' +
      '  "uxRequirements": { "flows": [], "uiComponents": [], "accessibility": "<string>", "states": [] },\n' +
      '  "releaseCriteria": {},\n' +
      '  "dependencies": {},\n' +
      '  "rolloutPlan": { "phases": [], "strategy": "<string>", "rollbackPlan": "<string>", "criteriaPerPhase": [] },\n' +
      '  "assumptions": [],\n' +
      '  "nonGoals": [],\n' +
      '  "openQuestions": []\n' +
      '}\n\n' +
      'Rules — follow every one of them. Breaking one is worse than returning an empty object.\n' +
      '1. NEVER invent a value the caller did not supply. Every field must trace back to the supplied input. If information is missing, leave the field empty or omit it rather than filling in plausible text.\n' +
      '2. Return valid JSON only. No markdown fences, no leading or trailing prose.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 8192,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};

export const PRODUCT_ROADMAP_GENERATOR: Tool = {
  id: 'product-roadmap-generator',
  domainKnowledge: 'Product roadmapping: goals, initiatives, RICE/WSJF prioritization, capacity planning, milestones, risk assessment, themes, OKRs.',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Product Roadmap Generator',
  description: 'Generate a product roadmap with prioritized goals, sequenced initiatives, capacity plan, milestones, risks, OKRs, and themes as JSON.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'You are a senior product manager. Generate a product roadmap as a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "quarter": "<string>",\n' +
      '  "timeHorizon": <number>,\n' +
      '  "capacity": <number>,\n' +
      '  "goals": [\n' +
      '    { "id": "<string>", "text": "<string>", "priority": "<string>", "owner": "<string>", "rice": <number>, "wsjf": <number>, "reach": <number>, "impact": <number>, "confidence": <number>, "effort": <number>, "score": <number>, "okrId": "<string>", "measurableOutcome": "<string>" }\n' +
      '  ],\n' +
      '  "initiatives": [\n' +
      '    { "id": "<string>", "text": "<string>", "goals": ["<string>"], "effort": <number>, "risk": <number>, "dependencies": ["<string>"], "sortedIndex": <number>, "milestones": [], "quarter": <number>, "riskLevel": "<string>" }\n' +
      '  ],\n' +
      '  "themes": ["<string>"],\n' +
      '  "milestones": [],\n' +
      '  "riskAssessment": { "risks": [], "dependencyChains": <number>, "maxDependencyDepth": <number>, "resourceConflicts": [], "criticalPath": [] },\n' +
      '  "okrs": [],\n' +
      '  "metrics": {}\n' +
      '}\n\n' +
      'Rules — follow every one of them. Breaking one is worse than returning an empty object.\n' +
      '1. NEVER invent a value the caller did not supply. Every field must trace back to the supplied input. If information is missing, leave the field empty or omit it rather than filling in plausible text.\n' +
      '2. Return valid JSON only. No markdown fences, no leading or trailing prose.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 8192,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
