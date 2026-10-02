// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, HR_EXTERNAL_OUTPUT_SCHEMA } from './hr-contract';

// ============================================================================
// SKILL 3: hr-draft-jd-interview-kit (Aid)
// User trigger
// ============================================================================

export const HR_DRAFT_JD_INTERVIEW_KIT = createDeclarativeCodeSkill({
  // Declared as a credential, not a plain config field, so the secret can be
  // sourced from the vault via `vault:<id>` and is never echoed into output.
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
  },
  id: 'hr-draft-jd-interview-kit',
  name: 'Draft Job Description & Interview Kit',
  description: 'Generates structured job descriptions, interview scorecards, role-specific behavioral questions, and rubric guides.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultSource: SchemaProps.text({ description: 'Default sourcing channel for job descriptions' }),
      apiVersion: SchemaProps.text({ description: 'API version for recruiting operations' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
      retryAttempts: SchemaProps.number({ description: 'Retry attempts on failure', default: 3 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      data: SchemaProps.object({}, { description: 'Payload data for job description or interview kit generation' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live dispatch', default: false }),
    },
    required: ['data'],
  },
  outputSchema: HR_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'aid',
  confirmBeforeSend: true,
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    { kind: 'user', phrase_examples: ['Draft job description', 'Create interview scorecard', 'Generate interview kit'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const dryRun = input.dryRun !== false;
    const data = input.data || {};
    const endpoint = String(ctx.config?.defaultEndpoint || '');
    const apiKey = (ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '';

    if (!endpoint) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: no applicant tracking system endpoint configured. Set defaultEndpoint in this Skill\'s configuration.',
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no applicant tracking system endpoint configured. Set defaultEndpoint in this Skill\'s configuration.')],
};
    }
    if (!apiKey) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: no applicant tracking system API key configured. Set the apiKey credential for this Skill.',
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no applicant tracking system API key configured. Set the apiKey credential for this Skill.')],
};
    }

    if (!dryRun && input.confirmation !== true) {
      return {
  success: false,
  status: 'confirmation-required',
  data: null,
  error: 'Explicit confirmation required for live dispatch',
  present: [ctx.render.text('notice', 'Confirmation required', 'Explicit confirmation required for live dispatch')],
  system: 'recruiting-ops',
  action: 'execute'
};
    }

    const payload = {
      system: 'recruiting-ops',
      action: 'execute',
      data,
      filters: input.filters || {},
      pagination: input.pagination || {},
      dryRun,
    };

    // The API key travels in the delegated request headers and is never echoed
    // back: only a redacted copy appears in the recorded request block.
    let response: any;
    try {
      response = await ctx.delegate('api_client', {
        path: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: payload,
        acceptErrorResponses: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: 'error',
        system: 'recruiting-ops',
        action: 'execute',
        request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
        response: null,
        error: message,
        data: null,
        present: [ctx.render.text('report', 'JD & Interview Kit Result', ['Job Description & Interview Kit Generation', '', 'Error: ' + message, ''])],
      };
    }

    const success = response && response.success === true;
    const status = response && typeof response.status === 'number' ? response.status : 0;
    const responseData = response ? response.data : null;
    const lines = [
      'Job Description & Interview Kit Generation',
      '',
      'Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live dispatch'),
      'Endpoint: ' + endpoint,
      'Status: ' + (success ? 'Success' : 'Failed' + (status ? ' (' + status + ')' : '')),
      '',
    ];

    return {
      success,
      status: dryRun ? 'dry-run' : (success ? 'ok' : 'failed'),
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: { status, data: responseData },
      error: success ? null : ((response && response.error) || 'HTTP ' + status),
      data: responseData,
      present: [ctx.render.text('report', 'JD & Interview Kit Result', lines)],
    };
  },
});
