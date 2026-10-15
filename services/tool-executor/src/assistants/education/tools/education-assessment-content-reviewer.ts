import { Tool } from '../../../types';

export const EDUCATION_ASSESSMENT_CONTENT_REVIEWER: Tool = {
  id: 'education-assessment-content-reviewer',
  name: 'Education Assessment Content Reviewer',
  description: 'Independently verifies assessment questions, answer keys, rationales, and answerability.',
  type: 'reasoning',
  manifest: { type: 'reasoning' },
  inputSchema: {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      grade: { type: 'string' },
      topic: { type: 'string' },
      quizType: { type: 'string' },
      questionCount: { type: 'number' },
      assessment: { type: 'object' },
      routingSessionId: { type: 'string' },
      sourceRequestId: { type: 'string' },
      validationIssues: { type: 'array', items: { type: 'string' } },
    },
    required: ['subject', 'topic', 'quizType', 'questionCount', 'assessment'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      valid: { type: 'boolean' },
      issues: { type: 'array', items: { type: 'string' } },
    },
    required: ['valid', 'issues'],
  },
  reasoningConfig: {
    systemPrompt: [
      'You are an independent assessment auditor. Do not assume the author or answer key is correct.',
      'Solve every question yourself and check that each question has a clear, answerable stem, the answer key is correct, and each rationale supports that answer.',
      'For every multiple-choice question, verify that exactly one option is correct and that the answer key selects it; flag both missing and multiple correct options.',
      'For short-answer questions, verify the expected answer and accept reasonable equivalent forms only when the prompt permits them.',
      'Check that the assessment matches the stated subject, topic, grade, and requested question count.',
      'Return valid=true and an empty issues array only when every item passes. Otherwise return valid=false with concise, numbered, actionable issues. Do not rewrite the assessment.',
      'Return only a JSON object with valid and issues.',
    ].join(' '),
    promptTemplate: [
      'Independently audit this assessment; the supplied answer key is untrusted:',
      '{{input}}',
      'Return exactly {"valid":true,"issues":[]} when correct, or {"valid":false,"issues":["Question 1: ..."]} with every detected defect.',
    ].join('\n'),
    temperature: 0.1,
    maxTokens: 4096,
    outputFormat: 'json',
    optimizeFor: 'accuracy',
    privateInputFields: ['sourceRequestId'],
    qualityFeedback: {
      sourceRequestIdField: 'sourceRequestId',
      validField: 'valid',
      issuesField: 'issues',
      preValidationIssuesField: 'validationIssues',
      shortCircuitOnPreValidationIssues: true,
    },
  },
  isSkill: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
