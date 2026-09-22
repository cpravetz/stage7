import { Tool } from '../../../types';

const now = () => new Date();

export const CAREER_INTERVIEW_PREP: Tool = {
  id: 'career_interview_prep',
  name: 'Career Interview Prep',
  description: 'Generate interview questions and preparation guidance for a target role and company.',
  type: 'reasoning',
  manifest: { workflowStage: 'prep' },
  reasoningConfig: {
    promptTemplate: 'Prepare interview guidance for company {{input}}. Return focused interview questions, evaluation areas, and preparation advice as plain text.',
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
  id: 'career_advisory',
  name: 'Career Advisory',
  description: 'Provide career, compensation, and learning-plan guidance from supplied role context.',
  type: 'reasoning',
  manifest: { workflowStage: 'prep' },
  reasoningConfig: {
    promptTemplate: 'Provide career advisory guidance for this request: {{input}}. Include practical recommendations, assumptions, and next steps as plain text.',
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