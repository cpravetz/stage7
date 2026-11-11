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

const CLINICAL_SAFETY_SYSTEM_PROMPT = [
  'You are an expert clinical education and care-plan briefing assistant.',
  'Decision support and education only: do not diagnose, prescribe, or change treatment; a qualified clinician must review all outputs.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
].join(' ');

export const HEALTHCARE_CARE_PLAN_DRAFTER: Tool = {
  id: 'healthcare-care-plan-drafter',
  domainKnowledge: 'Care plan development, medication management, patient education briefing, and plain-language clinical communication',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Healthcare Care Plan Drafter',
  description:
    'Generate a structured, plain-language care-plan educational briefing from supplied condition, goals, medications, and education topics. Produces genuine plain-language explanations and teach-back questions; medication instructions are copied verbatim with a safety note not to change doses. Decision support and education only.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: CLINICAL_SAFETY_SYSTEM_PROMPT,
    promptTemplate:
      'You are drafting a plain-language patient care-plan educational briefing from the supplied input. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "condition": "<condition or care need>",\n' +
      '  "careNeed": "<care need label or null>",\n' +
      '  "goals": [ { "rank": 1, "goal": "<goal>", "measure": "<patient-reported or clinician-defined target>" } ],\n' +
      '  "medications": [ { "name": "<medication or therapy name>", "instruction": "<instruction copied verbatim from supplied input>" } ],\n' +
      '  "education": [ { "topic": "<supplied topic>", "format": "plain-language briefing", "note": "<short note>", "plainLanguageExplanation": "<genuine plain-language explanation a patient could understand for this topic>" } ],\n' +
      '  "briefing": {\n' +
      '    "purpose": "<plain-language purpose of this briefing>",\n' +
      '    "medicationSafety": "Medication details are copied from the supplied plan; do not start, stop, or change a dose from this briefing. A qualified clinician must review all medication instructions.",\n' +
      '    "teachBack": ["<teach-back question 1>", "<teach-back question 2>", "<teach-back question 3>"]\n' +
      '  },\n' +
      '  "disclaimer": "This briefing is for education and decision support only. Do not start, stop, or change treatment from this output. A qualified clinician must review all content.",\n' +
      '  "safetyBoundary": "Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; a qualified clinician must review all outputs."\n' +
      '}\n\n' +
      'Rules — follow every one of them:\n' +
      '1. For each supplied education topic you MUST produce an actual plain-language explanation a patient could understand in "plainLanguageExplanation". Do NOT merely echo the topic names back.\n' +
      '2. "teachBack" must contain concrete teach-back questions that help confirm patient understanding of the plan, goals, medications (if any), and education topics.\n' +
      '3. Medication instructions must be copied verbatim from the supplied input; do not rephrase, add, or infer dosing. Always accompany medications with the safety note not to change doses. If no medications are supplied, return an empty medications array and state in medicationSafety that none were supplied and to verify with the prescribing clinician.\n' +
      '4. Goals must be ranked and include a reasonable patient-reported or clinician-defined measure.\n' +
      '5. Decision support and education only: do not diagnose, prescribe, or change treatment. A qualified clinician must review all outputs.\n' +
      '6. Use only information present in the supplied input; do not invent clinical details.\n\n' +
      'Input:\n{{input}}',
    maxTokens: 4096,
    temperature: 0.3,
    optimizeFor: 'accuracy',
  },
  inputSchema: {
    type: 'object',
    properties: {
      condition: { type: 'string', description: 'Condition or care need supplied by the clinician' },
      careNeed: { type: 'string', description: 'Optional alternate label for the care need' },
      goals: { type: 'array', items: { type: 'string' }, description: 'Patient or clinician goals' },
      medications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Medication or therapy name' },
            instruction: { type: 'string', description: 'Clinician-provided instruction' },
          },
        },
        description: 'Current medications or therapies',
      },
      educationTopics: { type: 'array', items: { type: 'string' }, description: 'Topics to explain to the patient' },
      followUp: { type: 'string', description: 'Clinician-defined follow-up interval' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      condition: { type: 'string' },
      careNeed: { type: ['string', 'null'] },
      goals: { type: 'array' },
      medications: { type: 'array' },
      education: { type: 'array' },
      briefing: { type: 'object' },
      disclaimer: { type: 'string' },
      safetyBoundary: { type: 'string' },
    },
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
