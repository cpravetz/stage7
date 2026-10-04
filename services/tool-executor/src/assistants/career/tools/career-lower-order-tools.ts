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

export const CAREER_INTERVIEW_PREP: Tool = {
  id: 'career-interview-prep',
  domainKnowledge: 'Interview preparation: role- and company-specific question sets, likely follow-ups, and preparation guidance.',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Career Interview Prep',
  description: 'Generate interview questions and preparation guidance for a target role and company.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'Prepare interview guidance for company {{input}}. Return focused interview questions, evaluation areas, and preparation advice as plain text. Output only that guidance: no preamble, no analysis of the request, and no closing remarks about your own answer.',
    maxTokens: 2048,
    temperature: 0.4,
    optimizeFor: 'accuracy',
  },
  inputSchema: { type: 'object', properties: { targetRole: { type: 'string' }, company: { type: 'string' }, stage: { type: 'string' } } },
  outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};

export const CAREER_ADVISORY: Tool = {
  id: 'career-advisory',
  domainKnowledge: 'Career advisory context: role expectations, market positioning, and the trade-offs behind a job-search decision.',
  tier: 'advise',
  schemaVersion: 1,
  name: 'Career Advisory',
  description: 'Provide career, compensation, and learning-plan guidance from supplied role context.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate:
      'Provide career advisory guidance for this request: {{input}}. Include practical recommendations, assumptions, and next steps as plain text. Output only that guidance: no preamble, no analysis of the request, and no closing remarks about your own answer.',
    maxTokens: 2048,
    temperature: 0.4,
    optimizeFor: 'accuracy',
  },
  inputSchema: { type: 'object', properties: { question: { type: 'string' }, targetRole: { type: 'string' }, company: { type: 'string' }, jobDescription: { type: 'string', multiline: true } } },
  outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
