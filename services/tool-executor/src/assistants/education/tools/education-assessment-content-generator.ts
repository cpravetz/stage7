import { Tool } from '../../../types';

export const EDUCATION_ASSESSMENT_CONTENT_GENERATOR: Tool = {
  id: 'education-assessment-content-generator',
  name: 'Education Assessment Content Generator',
  description: 'Generates grade-appropriate assessment questions and a complete answer key from a subject, topic, and learning context.',
  type: 'reasoning',
  manifest: { type: 'reasoning' },
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string' },
      subject: { type: 'string' },
      grade: { type: 'string' },
      topic: { type: 'string' },
      quizType: { type: 'string' },
      difficulty: { type: 'string' },
      questionCount: { type: 'number' },
      standards: { type: 'array', items: { type: 'string' } },
      objectives: { type: 'array', items: { type: 'string' } },
      learnerProfile: { type: 'object' },
      validationIssues: { type: 'array', items: { type: 'string' } },
      previousResponse: { type: 'string' },
      routingSessionId: { type: 'string' },
    },
    required: ['task', 'subject', 'topic', 'quizType', 'difficulty', 'questionCount'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'number' },
            type: { type: 'string' },
            bloomLevel: { type: 'string' },
            stem: { type: 'string' },
            choices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  text: { type: 'string' },
                },
                required: ['label', 'text'],
              },
            },
            points: { type: 'number' },
          },
          required: ['number', 'type', 'stem', 'points'],
        },
      },
      answerKey: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'number' },
            answer: { type: 'string' },
            rationale: { type: 'string' },
          },
          required: ['number', 'answer', 'rationale'],
        },
      },
    },
    required: ['questions', 'answerKey'],
  },
  reasoningConfig: {
    systemPrompt: [
      'You are an experienced educator creating an accurate, grade-appropriate assessment.',
      'Use the supplied subject, topic, objectives, standards, and learner profile.',
      'Return only a JSON object with questions and answerKey arrays; do not include markdown or prose outside the JSON.',
      'Create exactly questionCount questions numbered contiguously from 1, and exactly one answer-key entry per question with the same number.',
      'Every question needs a clear, answerable stem, question type, points, and an age-appropriate Bloom level.',
      'For multiple-choice quizzes, every question must have exactly four distinct choices labelled A, B, C, and D; the answer-key answer must be exactly one of those labels and include a rationale.',
      'For quantitative questions, calculate every answer and rationale exactly, then cross-check that the answer key and rationale agree.',
      'For math multiple-choice questions, solve each stem exactly before writing choices. Exactly one choice may be mathematically correct; distractors must be distinct incorrect values, not equivalent fractions or alternate forms of the correct answer.',
      'When repairing a validation issue about multiple correct choices, replace the ambiguous distractors, then recompute the answer key and rationale from the final choices.',
      'For all other quiz types, provide a complete expected answer and rationale, not a placeholder or a note that an answer key is available elsewhere.',
      'Do not use ellipses, bracketed placeholders, TODOs, or generic template text. Keep facts accurate; do not invent curriculum-standard codes.',
    ].join(' '),
    promptTemplate: [
      'Draft the assessment described by this input:',
      '{{input}}',
      'If validationIssues is present, repair previousResponse to address every issue while preserving valid content. Return a complete replacement JSON object.',
      'Required JSON shape: {"questions":[{"number":1,"type":"multiple-choice or short-answer","bloomLevel":"Understand","stem":"...","choices":[{"label":"A","text":"..."}],"points":2}],"answerKey":[{"number":1,"answer":"A or a complete expected response","rationale":"Why this answer is correct"}]}.',
    ].join('\n'),
    temperature: 0.3,
    maxTokens: 8192,
    outputFormat: 'json',
    optimizeFor: 'accuracy',
  },
  isSkill: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
