// @ts-nocheck

import { createExternalActionSkill } from '../../../adk/code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from '../marketing-contract';

export const MARKETING_MARKET_RESEARCH = createExternalActionSkill({
    triggers: [
      { kind: 'user', phrase_examples: ["Research market", "Competitor analysis", "Market survey"] },
    ],
    id: 'marketing-market-research',
    tier: 'aid',
    manifest: { actionLabel: 'Research the market' },
    isSkill: true,
    name: 'Marketing Market Research',
    description: 'Search markets, competitors, trends, and customer signals through configurable research providers.',
    system: 'research',
    action: 'market-research',
    endpoint: { configKey: 'MARKETING_RESEARCH_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: 'MARKETING_RESEARCH_ACCESS_TOKEN' },
    },
    credentialSource: {
      accessToken: { envVar: 'MARKETING_RESEARCH_ACCESS_TOKEN', configKey: 'research.accessToken' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Market research system base URL' },
        accessToken: { type: 'string', description: 'Research provider access token' },
        providers: { type: 'array', items: { type: 'string' } },
        defaultMarkets: { type: 'array', items: { type: 'string' } },
        researchMethodologies: { type: 'array', items: { type: 'string' }, description: 'Available research methodologies' },
        dataSources: { type: 'array', items: { type: 'object' }, description: 'Configured data sources' },
        trendModels: { type: 'array', items: { type: 'string' }, description: 'Trend analysis models' },
        reportTemplates: { type: 'array', items: { type: 'string' }, description: 'Available report templates' },
      },
      required: ['baseUrl', 'accessToken'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Research query or topic' },
        market: { type: 'string', description: 'Target market/region to research' },
        competitors: { type: 'array', items: { type: 'string' }, description: 'List of competitor names or domains to analyze' },
        dateRange: { type: 'object', description: 'Date range for research (e.g., { start: "2024-01-01", end: "2024-12-31" })' },
        filters: { type: 'object', description: 'Additional filters for the research query' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
