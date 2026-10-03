// @ts-nocheck

import { createExternalActionSkill } from '../../../adk/code-skill-factory';

export const PRODUCT_DATA_ANALYSIS_USER = createExternalActionSkill({
    id: 'product-data-analysis-user',
    tier: 'advise',
    manifest: { actionLabel: 'Analyse product data' },
    isSkill: true,
    name: 'Product Data Analysis',
    description: 'Analyze product metrics, adoption, retention, and funnels. Uses configurable analytics or BI endpoints.',
    system: 'product_analytics',
    action: 'analyze_metrics',
    endpoint: {
      method: 'POST',
      configKey: 'baseUrl',
    },
    auth: {
      type: 'bearer',
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Analytics service base URL' },
        apiToken: { type: 'string', format: 'password', description: 'Bearer token for analytics API (prefer a vault-backed credential source)' },
        dataset: { type: 'string', description: 'Default dataset or table' },
        cohortDefinitions: { type: 'object', description: 'Cohort analysis definitions' },
        retentionModels: { type: 'object', description: 'Retention model configurations' },
        funnelTemplates: { type: 'array', items: { type: 'object' }, description: 'Funnel analysis templates' },
        alertConfigs: { type: 'object', description: 'Alert configuration settings' },
      },
      // Not required at the schema level: this Skill is user-triggered, and a
      // hard config gate refused the run before the handler could report which
      // fields were missing. Left required, an operator with nothing configured
      // got a bare executor error and no rendered output at all.
      required: [],
    },
    credentialSource: {
      // Optional: the Skill's not-connected branch explains what to set, which is
      // more useful to an operator than a refusal with no output.
      token: { configKey: 'apiToken', required: false, label: 'analytics API token (set in this Skill configuration, or a vault secret)' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Metric to analyze' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Dimensions to group the metric by' },
        filters: { type: 'object', description: 'Filter conditions as key-value pairs' },
        startDate: { type: 'string', description: 'Start date for the analysis period (ISO 8601)' },
        endDate: { type: 'string', description: 'End date for the analysis period (ISO 8601)' },
        granularity: { type: 'string', enum: ['day', 'week', 'month', 'quarter'], description: 'Time granularity for the analysis' },
      },
      required: ['metric'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
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
        error: { type: 'string' },
      },
      required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 60000,
  // Was event-triggered on a launch/release event, but it requires a `metric`
  // the event does not supply. The recurring metrics sweep is now
  // product-insights-scheduled, which carries its metric list in config.
  triggers: [{ kind: 'user', phrase_examples: ["Analyze this metric", "Break down activation by plan", "Show me the funnel for this feature"] }],
  });
