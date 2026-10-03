// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, HR_EXTERNAL_OUTPUT_SCHEMA } from '../hr-contract';

// ============================================================================
// SKILL 4: hr-interview-scheduling-user (Aid)
// User trigger: an operator books an interview by hand. The automated half
// (interview-scheduling-automated) owns the screening-event path and carries the
// calendar/round policy as configuration.
// ============================================================================

export const HR_INTERVIEW_SCHEDULING_USER = createDeclarativeCodeSkill({
  // Declared as a credential, not a plain config field, so the secret can be
  // sourced from the vault via `vault:<id>` and is never echoed into output.
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
  },
  id: 'hr-interview-scheduling-user',
  name: 'Interview Scheduling',
  description: 'Coordinates with ATS, calendar, and email systems to book an interview you are scheduling by hand.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
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
      data: SchemaProps.object({}, { description: 'Scheduling payload data' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live dispatch', default: false }),
    },
    required: ['data'],
  },
  outputSchema: HR_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'aid',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Schedule an interview for this candidate',
        'Book an onsite for this shortlist',
        'Set up the next round with this interviewer',
      ],
    },
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
        present: [ctx.render.text('report', 'Interview Scheduling Trigger Result', ['Interview Scheduling Trigger', '', 'Error: ' + message, ''])],
      };
    }

    const success = response && response.success === true;
    const status = response && typeof response.status === 'number' ? response.status : 0;
    const responseData = response ? response.data : null;
    const lines = [
      'Interview Scheduling Trigger',
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
      present: [ctx.render.text('report', 'Interview Scheduling Trigger Result', lines)],
    };
  },
});
