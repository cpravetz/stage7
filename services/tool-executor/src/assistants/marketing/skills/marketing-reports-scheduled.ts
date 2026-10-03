// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

/**
 * Scheduled half of the marketing-center decomposition.
 *
 * Produces the recurring campaign report over the configured campaigns and
 * channels. `campaignIds` is a required selector so the report has a bounded
 * scope rather than reporting on every campaign the account holds.
 */
export const MARKETING_REPORTS_SCHEDULED = createDeclarativeCodeSkill({
  id: 'marketing-reports-scheduled',
  name: 'Marketing Reports',
  description: 'Scheduled campaign report across the configured campaigns and channels, dispatched to the analytics channel.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, manual)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: 'string' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'status'],
  },
  configSchema: {
    type: 'object',
    properties: {
      campaignIds: { type: 'array', items: { type: 'string' }, description: 'Campaigns this report covers' },
      channels: { type: 'array', items: { type: 'string' }, description: 'Channels to report on per campaign' },
      reportCadence: { type: 'string', description: 'Cron expression or schedule id for this report' },
    },
    required: ['campaignIds'],
    additionalProperties: false,
  },
  triggers: [
    { kind: 'schedule', cadence: 'Weekly campaign report' },
  ],
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement',
  manifest: {
    lowerOrderTools: ['marketing-market-research', 'marketing-audience-insights'],
  },
  handler: async function handler(input, ctx) {
    const campaignIds = Array.isArray(ctx.config?.campaignIds) ? ctx.config.campaignIds.map(String) : [];
    const channels = Array.isArray(ctx.config?.channels) ? ctx.config.channels.map(String) : [];
    const reportCadence = typeof ctx.config?.reportCadence === 'string' ? ctx.config.reportCadence : null;
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    if (!campaignIds.length) {
      return {
        success: false,
        status: 'not-configured',
        error: 'No campaigns configured. Set config.campaignIds before this Skill can run.',
        present: [ctx.render.text('notice', 'No campaigns configured', 'Set config.campaignIds before the scheduled marketing report can run.')],
      };
    }

    const reports: Array<Record<string, unknown>> = [];
    // A campaign counts as failed when the call throws OR when the callee comes
    // back having produced nothing. Counting only the throw path let this Skill
    // report success:true while 0 of 2 campaigns actually reported.
    const failed: string[] = [];
    for (const campaignId of campaignIds) {
      try {
        const result = await ctx.delegate('marketing-market-research', { campaignId, channels, reportCadence, runReason });
        const ok = Boolean(result) && result.success !== false;
        if (!ok) failed.push(campaignId);
        reports.push({
          campaignId,
          success: ok,
          status: result?.status ?? null,
          data: result?.data ?? null,
          error: result?.error ?? 'callee returned no report',
        });
      } catch (err) {
        // Recorded rather than swallowed, so a report that covers nothing cannot
        // read as a report that found nothing.
        failed.push(campaignId);
        reports.push({ campaignId, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const succeeded = reports.filter((r) => r.success === true).length;
    return {
      // A run that produced no reports at all is not a clean run, whatever the
      // call path returned.
      success: failed.length === 0 && succeeded > 0,
      status: failed.length === 0 ? (succeeded > 0 ? 'ok' : 'empty') : 'partial',
      data: { campaignIds, channels, reportCadence, runReason, requested: campaignIds.length, succeeded, failed, reports },
      error: failed.length ? `No report for: ${failed.join(', ')}` : null,
      present: [
        ctx.render.text('report', 'Marketing Campaign Report', `${succeeded}/${campaignIds.length} configured campaign(s) reported${failed.length ? `; ${failed.length} failed` : ''}.`),
      ],
    };
  },
});
