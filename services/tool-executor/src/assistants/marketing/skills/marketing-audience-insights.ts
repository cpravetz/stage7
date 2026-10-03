// @ts-nocheck
import { createExternalActionSkill } from '../../../adk/code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from '../marketing-contract';

export const MARKETING_AUDIENCE_INSIGHTS = createExternalActionSkill({
    triggers: [
      { kind: 'schedule', cadence: 'Ongoing audience segment monitoring' },
    ],
    id: 'marketing-audience-insights',
    name: 'Marketing Audience Insights',
    description: 'Segment audiences and analyze demographics, behavior, preferences, and campaign response signals.',
    system: 'audience-insights',
    action: 'analyze-audience',
    endpoint: { configKey: 'MARKETING_AUDIENCE_INSIGHTS_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'MARKETING_AUDIENCE_INSIGHTS_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_AUDIENCE_INSIGHTS_API_KEY', configKey: 'audienceInsights.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Audience insights platform base URL' },
        apiKey: { type: 'string', description: 'Audience insights API key' },
        provider: { type: 'string', enum: ['google-analytics', 'segment', 'salesforce', 'custom'] },
        defaultSegment: { type: 'string' },
        segmentationModels: { type: 'array', items: { type: 'string' }, description: 'Available segmentation models' },
        behaviorPredictors: { type: 'array', items: { type: 'object' }, description: 'Behavior predictor configurations' },
        privacyControls: { type: 'object', description: 'Privacy and compliance controls' },
        enrichmentSources: { type: 'array', items: { type: 'string' }, description: 'Data enrichment sources' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        audienceId: { type: 'string', description: 'Identifier of the audience segment to analyze' },
        demographics: { type: 'object', description: 'Demographic filters (age, gender, location, income, etc.)' },
        behaviors: { type: 'array', items: { type: 'object' }, description: 'Behavioral signals to analyze (purchases, page views, engagement)' },
        campaign: { type: 'string', description: 'Associated campaign identifier for response analysis' },
        dateRange: { type: 'object', description: 'Date range for analysis (e.g., { start: "2024-01-01", end: "2024-12-31" })' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
