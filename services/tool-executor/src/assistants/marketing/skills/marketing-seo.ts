// @ts-nocheck

import { createExternalActionSkill } from '../../../adk/code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from '../marketing-contract';

export const MARKETING_SEO = createExternalActionSkill({
    triggers: [
      { kind: 'schedule', cadence: 'Periodic SEO audit' },
    ],
    id: 'marketing-seo',
    // v9: an aid Skill assembles aids and returns a work product; it does not
// write to an external system. This one reaches a provider and mutates there,
// so it is represent and sits behind the approval gate.
  tier: 'represent',
    manifest: { actionLabel: 'Optimise search presence', emitEvent: 'marketing.search_visibility.optimized' },
    isSkill: true,
    name: 'Marketing SEO',
    description: 'Audit, research, optimize, and track search visibility through a configurable SEO system.',
    system: 'seo',
    // 'optimize' is a change verb, not a read verb. The generated transport POSTs
    // the whole input (url, keywords, content, market, ...) to the provider with no
    // read-only constraint anywhere in the source, and every provider named in
    // configSchema (google-search-console, semrush, ahrefs) exposes a write surface
    // (property settings, sitemap submit, project/metadata changes). `isSkill: false`
    // also means this tool is directly executable with no approval in the path.
    // Gating it here is safe: an approved marketing-center propagates its
    // confirmation into this callee (ToolExecutor.nestedExecutorCallback).
    action: 'optimize-seo',
    endpoint: { configKey: 'MARKETING_SEO_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'MARKETING_SEO_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_SEO_API_KEY', configKey: 'seo.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'SEO platform base URL' },
        apiKey: { type: 'string', description: 'SEO platform API key' },
        provider: { type: 'string', enum: ['semrush', 'ahrefs', 'google-search-console', 'custom'] },
        defaultMarket: { type: 'string' },
        keywordDatabase: { type: 'object', description: 'Keyword database configuration' },
        competitorTracking: { type: 'object', description: 'Competitor tracking settings' },
        technicalAuditConfig: { type: 'object', description: 'Technical SEO audit configuration' },
        rankingRules: { type: 'array', items: { type: 'object' }, description: 'Ranking rule definitions' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL for SEO analysis or optimization' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'List of target keywords' },
        content: { type: 'string', description: 'Content to optimize or analyze' },
        market: { type: 'string', description: 'Target market/region (e.g., US, UK, global)' },
        searchEngine: { type: 'string', description: 'Target search engine (e.g., google, bing, yandex)' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
