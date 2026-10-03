import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { HR_EXTERNAL_OUTPUT_SCHEMA } from '../hr-contract';

const HR_DOMAIN_KNOWLEDGE =
  'Technical and executive recruiting operations, interview panel coordination, ATS scheduling workflows, candidate experience standards';

/**
 * Automated half of the interview-scheduling split.
 *
 * The original Skill declared a configSchema with no required selector, so it
 * could run against any calendar with no defined scope. This half requires
 * `calendarId` and carries the round/time-window policy as configuration, while
 * the candidate itself arrives from the screening event.
 */
const HR_INTERVIEW_SCHEDULING_AUTOMATED = createDeclarativeCodeSkill({
  id: 'hr-interview-scheduling-automated',
  name: 'Interview Scheduling (Automated)',
  description: 'Schedules interviews for candidates that pass screening, against the configured calendar and round policy.',
  persistenceEnvVar: 'HR_HOME',
  // Declared as a credential, not a plain config field, so the secret can be
  // sourced from the vault via `vault:<id>` and is never echoed into output.
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
  },
  configSchema: {
    type: 'object',
    properties: {
    endpoint: SchemaProps.url({ description: 'Applicant tracking system base URL' }),
      calendarId: SchemaProps.text({ description: 'Calendar the interviewer slots are booked on' }),
      roundTypes: SchemaProps.stringArray({ description: 'Interview rounds this Skill may book, e.g. screen, technical, onsite' }),
      timeWindowRules: {
        type: 'object',
        description: 'Window rules the booking must satisfy, e.g. { timezone, durationMinutes, notBefore }',
        properties: {
          timezone: { type: 'string' },
          durationMinutes: { type: 'number' },
          notBefore: { type: 'string' },
          notAfter: { type: 'string' },
        },
      },
    },
    // The required selector. Without it this Skill has no defined scope, which
    // is the wide-scope config the split exists to prevent.
    required: ['calendarId'],
    additionalProperties: false,
  },
  endpointConfigKey: 'endpoint',
  // The screening event's payload is passed through opaquely. Raw internal IDs
  // (candidateId and friends) are not exposed as declared schema keys, which is
  // the convention the other external Skills follow with their `data` wrapper
  // and what the schema-hygiene suites enforce.
  inputSchema: {
    type: 'object',
    properties: {
      candidate: SchemaProps.object(
        {},
        {
          description:
            'Candidate payload from the screening event: { candidateId, candidateName, roundType, interviewers[] }. Declared opaque so raw internal IDs stay out of the user-facing schema, matching the `data` wrapper the other external Skills use. The handler reads these keys directly.',
        },
      ),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live dispatch', default: false }),
    },
  },
  outputSchema: HR_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'aid',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    { kind: 'event', on: 'Candidate passed screening', eventId: 'hr.candidate_assessment.recorded' },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const calendarId = typeof ctx.config?.calendarId === 'string' ? ctx.config.calendarId : '';
    const roundTypes = Array.isArray(ctx.config?.roundTypes) ? ctx.config.roundTypes.map(String) : [];
    const timeWindowRules = (ctx.config?.timeWindowRules ?? {}) as Record<string, unknown>;
    const dryRun = input.dryRun !== false;
    const candidate = (input.candidate ?? {}) as Record<string, any>;
    const roundType = String(candidate.roundType || '');

    const endpoint = String(ctx.config?.endpoint || '');
    const apiKey = (ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '';

    // Describe what is missing in terms the operator can act on, rather than
    // naming a retired environment variable.
    const notConnected = (what: string) => ({
      success: false,
      status: 'not-connected',
      system: 'recruiting-ops',
      action: 'execute',
      data: null,
      error: `Not connected: ${what}`,
      present: [ctx.render.text('not-connected', 'Connection required', `Not connected: ${what}`)],
    });

    if (!endpoint) return notConnected("no applicant tracking system endpoint configured. Set endpoint in this Skill's configuration.");
    if (!apiKey) return notConnected("no applicant tracking system API key configured. Set the apiKey credential for this Skill.");

    // Policy comes from config, so a screening event cannot talk this Skill into
    // booking a round the operator did not enable.
    if (roundTypes.length && roundType && !roundTypes.includes(roundType)) {
      return {
        success: false,
        status: 'skipped',
        system: 'recruiting-ops',
        action: 'execute',
        data: null,
        error: `Round "${roundType}" is not in the configured roundTypes`,
        present: [
          ctx.render.text(
            'notice',
            'Round not configured',
            `Skipped candidate ${candidate.candidateId || '(unknown)'}: round "${roundType}" is not in the configured roundTypes.`,
          ),
        ],
      };
    }

    if (!dryRun && input.confirmation !== true) {
      return {
        success: false,
        status: 'confirmation-required',
        system: 'recruiting-ops',
        action: 'execute',
        data: null,
        error: 'Explicit confirmation required for live dispatch',
        present: [ctx.render.text('notice', 'Confirmation required', 'Explicit confirmation required for live dispatch')],
      };
    }

    const payload = {
      system: 'recruiting-ops',
      action: 'execute',
      data: {
        calendarId,
        roundType: roundType || null,
        candidateId: candidate.candidateId || null,
        candidateName: candidate.candidateName || null,
        interviewers: Array.isArray(candidate.interviewers) ? candidate.interviewers : [],
        timeWindowRules,
      },
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
        present: [ctx.render.text('report', 'Interview Scheduling Result', ['Interview Scheduling', '', 'Error: ' + message, ''])],
      };
    }

    const success = response && response.success === true;
    const status = response && typeof response.status === 'number' ? response.status : 0;
    const responseData = response ? response.data : null;

    // The local record was the one thing the older hr-schedule-interview Skill
    // did that this half did not: it was the only interview scheduler writing a
    // durable local trail, and it was the only one reachable without the ATS
    // endpoint. Keep that behaviour here so removing it loses nothing.
    let storePath: string | null = null;
    if (success) {
      const record = {
        id: 'sched_' + Date.now(),
        candidateId: candidate.candidateId ?? null,
        candidateName: candidate.candidateName ?? null,
        roundType: roundType || null,
        calendarId,
        dryRun,
        confirmed: input.confirmation === true,
        scheduledAt: new Date().toISOString(),
        providerStatus: status,
      };
      const records = ctx.store.load('scheduling', []);
      records.push(record);
      ctx.store.save('scheduling', records);
      storePath = ctx.store.getFilePath('scheduling');
    }

    const lines = [
      'Interview Scheduling',
      '',
      'Calendar: ' + calendarId,
      'Round: ' + (roundType || '(unspecified)'),
      'Candidate: ' + (candidate.candidateId || candidate.candidateName || '(unknown)'),
      'Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live dispatch'),
      'Status: ' + (success ? 'Success' : 'Failed' + (status ? ' (' + status + ')' : '')),
      storePath ? 'Store Path: ' + storePath : '',
      '',
    ].filter(Boolean);

    return {
      success,
      status: dryRun ? 'dry-run' : success ? 'ok' : 'failed',
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: { status, data: responseData },
      error: success ? null : (response?.error || 'HTTP ' + status),
      data: responseData,
      storePath,
      present: [ctx.render.text('report', 'Interview Scheduling Result', lines)],
    };
  },
});

export { HR_INTERVIEW_SCHEDULING_AUTOMATED };