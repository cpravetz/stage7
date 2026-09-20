import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EDUCATION_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

export const LEARNER_INSIGHT = createExternalActionSkill({
  id: 'education_learner_insight',
  name: 'Learner Insight',
  description: 'Analyze learning analytics, learning styles, performance, progress, and motivation from connected LMS/assessment platforms. Hybrid: pulls real data then reasons on it.',
  system: 'education_analytics',
  action: 'analyze_learner',
  endpoint: { envVar: 'EDUCATION_LMS_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EDUCATION_LMS_ACCESS_TOKEN' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'LMS/analytics platform base URL' },
      token: { type: 'string', description: 'LMS bearer token' },
      provider: { type: 'string', enum: ['canvas', 'google-classroom', 'schoology', 'brightspace', 'powerschool', 'infinite-campus', 'custom'], description: 'LMS provider' },
      defaultCourseId: { type: 'string', description: 'Default course context' },
      dataSources: { type: 'array', items: { type: 'string' }, description: 'Enabled data sources: assignments, grades, attendance, discussions, logins, assessments' },
      analyticsTypes: { type: 'array', items: { type: 'string' }, enum: ['learning-styles', 'performance', 'progress', 'motivation', 'engagement', 'at-risk'], description: 'Analytics modules enabled' },
      gradebookMapping: { type: 'object', description: 'Gradebook category mapping' },
    },
    required: ['baseUrl', 'token', 'provider'],
  },
  credentialSource: {
    token: { envVar: 'EDUCATION_LMS_ACCESS_TOKEN', configKey: 'education.lms.token' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['learning-styles', 'performance', 'progress', 'motivation', 'engagement', 'at-risk', 'comprehensive'], { description: 'Analysis type' }),
      learner: SchemaProps.text({ description: 'Select learner' }),
      courseId: { type: 'string', description: 'Course identifier' },
      dateRange: { type: 'object', description: 'Analysis period' },
      includeComparisons: { type: 'boolean', description: 'Include class/cohort comparisons', default: true },
      metrics: SchemaProps.stringArray({ description: 'Specific metrics to analyze' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing' }),
    },
    required: ['operation', 'learner'],
  },
  outputSchema: EDUCATION_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  triggers: [
    { kind: 'user', phrase_examples: ['Analyze learner progress', 'Review student performance', 'Identify engagement risks'] },
    { kind: 'schedule', cadence: 'Weekly student progress rollup' },
    { kind: 'event', on: 'Assignment submission, grade, attendance, or assessment result is recorded' },
    { kind: 'data', condition: 'Engagement, performance, or progress crosses an at-risk threshold' },
  ],
});
