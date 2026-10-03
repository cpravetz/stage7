import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * DORA metrics from supplied delivery data.
 *
 * v9 §2: `advise`, not `represent` — it computes from numbers the caller
 * supplies and reaches no external system. Reading a repository would need the
 * `gitHubToken` credential, but the metrics themselves are arithmetic on
 * deployment and incident timestamps, so the token is configuration for a
 * caller that already pulls that data, never a dependency of the calculation.
 *
 * The four metrics are only meaningful together. Deployment frequency and lead
 * time for change both go up with throughput; change failure rate and time to
 * restore both go down with quality. Reporting one alone invites the exact
 * misreading DORA was written to prevent, so all four are always reported and
 * the trade-off is named.
 */
const DORA_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string' },
    data: { type: ['object', 'null'] },
    error: { type: ['string', 'null'] },
    present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['id', 'body'],
      },
    },
  },
  required: ['success', 'status', 'data', 'error', 'present'],
};

const CALCULATE_DORA = createDeclarativeCodeSkill({
  id: 'calculate-dora-metrics',
  name: 'Calculate DORA Metrics',
  description:
    'Computes the four DORA metrics — deployment frequency, lead time for change, change failure rate and time to restore — from supplied deployment and incident records, and reports each against its performance band with the trade-off between them named. Computes from what it is given; it does not fetch repository data itself.',
  persistenceEnvVar: 'CTO_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      repoId: { type: 'string', description: 'Repository or service the metrics describe' },
      timeframe: {
        type: 'string',
        enum: ['7d', '30d', '90d', '180d', '365d'],
        description: 'Window the metrics cover',
        default: '90d',
      },
      deployments: {
        type: 'array',
        items: { type: 'object' },
        description: 'Deployment records: timestamp, and leadTimeHours or commit-to-deploy timestamps',
      },
      incidents: {
        type: 'array',
        items: { type: 'object' },
        description: 'Incident records: timestamp and restoreTimestamp or downtimeMinutes',
      },
      daysInWindow: { type: 'number', description: 'Days the window spans; derived from timeframe when omitted' },
    },
    required: ['repoId'],
  },
  outputSchema: DORA_RESULT_SCHEMA,
  triggers: [],
  tier: 'advise',
  domainKnowledge:
    'DORA software delivery performance: deployment frequency, lead time for change, change ' +
    'failure rate and time to restore, their performance bands, and the throughput-versus-stability ' +
    'trade-off between them',
  isSkill: false,
  manifest: {
    configSchema: {
      type: 'object',
      properties: {
        // Declared as a credential, so the key can come from the vault via
        // `vault:<id>` and is never echoed back into emitted output. The
        // calculation below does not read it; a caller that pulls records from
        // the provider itself configures this.
        githubToken: {
          type: 'string',
          description: 'Source system token, when the caller fetches records itself',
        },
        perfBands: {
          type: 'object',
          description: 'Overrides for the performance band boundaries',
        },
      },
    },
    credentialSource: {
      githubToken: {
        configKey: 'githubToken',
        required: false,
        label: 'source system token (set in this tool configuration, or a vault secret)',
      },
    },
    lowerOrderTools: [],
  },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const repoId = String(input.repoId || '').trim();
    if (!repoId) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No repoId was supplied; there is nothing to compute metrics for.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to compute',
            kind: 'text',
            body: 'Supply repoId — the repository or service the metrics describe.',
          },
        ],
      };
    }

    const deployments: Record<string, unknown>[] = Array.isArray(input.deployments)
      ? (input.deployments as Record<string, unknown>[])
      : [];
    const incidents: Record<string, unknown>[] = Array.isArray(input.incidents)
      ? (input.incidents as Record<string, unknown>[])
      : [];
    const DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 };
    const timeframe = String(input.timeframe || '90d');
    const days = Number(input.daysInWindow || DAYS[timeframe] || 90);

    if (!deployments.length) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No deployment records were supplied; none of the four metrics can be computed.',
        present: [
          {
            id: 'notice',
            title: 'No deployment data',
            kind: 'text',
            body:
              'Supply deployments — an array of { timestamp, leadTimeHours } records. Without them, ' +
              'deployment frequency and lead time for change cannot be computed at all.',
          },
        ],
      };
    }

    /* deployment frequency */
    const deployFrequency = deployments.length / days;

    /* lead time for change */
    const leadTimes: number[] = deployments
      .map((d) => {
        const rec = d || {};
        if (rec.leadTimeHours != null) return Number(rec.leadTimeHours);
        const committed = rec.committedAt ? Date.parse(String(rec.committedAt)) : NaN;
        const deployed = rec.timestamp ? Date.parse(String(rec.timestamp)) : NaN;
        if (Number.isNaN(committed) || Number.isNaN(deployed)) return NaN;
        return (deployed - committed) / 3600000;
      })
      .filter((n: number) => !Number.isNaN(n) && n >= 0);
    const leadTimeHours = leadTimes.length
      ? leadTimes.reduce((a: number, b: number) => a + b, 0) / leadTimes.length
      : null;

    /* change failure rate */
    const causing = incidents.filter((i) => {
      const rec = (i || {}) as Record<string, unknown>;
      return rec.causedDeploymentChange === true;
    }).length;
    const changeFailurePct = Math.round((causing / deployments.length) * 1000) / 10;

    /* time to restore */
    const restoreHours: number[] = incidents
      .map((i) => {
        const rec = i || {};
        if (rec.downtimeMinutes != null) return Number(rec.downtimeMinutes) / 60;
        const started = rec.timestamp ? Date.parse(String(rec.timestamp)) : NaN;
        const restored = rec.restoreTimestamp ? Date.parse(String(rec.restoreTimestamp)) : NaN;
        if (Number.isNaN(started) || Number.isNaN(restored)) return NaN;
        return (restored - started) / 3600000;
      })
      .filter((n: number) => !Number.isNaN(n) && n >= 0);
    const mttrHours = restoreHours.length ? restoreHours.reduce((a: number, b: number) => a + b, 0) / restoreHours.length : null;

    // Bands are the widely published DORA thresholds, overridable per team.
    const band = (
      value: number | null,
      elite: number,
      high: number,
      medium: number,
      lowerIsBetter: boolean,
    ): string => {
      if (value == null) return 'unknown';
      if (lowerIsBetter) {
        if (value <= elite) return 'elite';
        if (value <= high) return 'high';
        if (value <= medium) return 'medium';
        return 'low';
      }
      if (value >= elite) return 'elite';
      if (value >= high) return 'high';
      if (value >= medium) return 'medium';
      return 'low';
    };

    const metrics = {
      deploymentFrequency: { value: Math.round(deployFrequency * 100) / 100, unit: 'per day', band: band(deployFrequency, 1, 0.5, 0.25, false) },
      leadTimeForChange: { value: leadTimeHours == null ? null : Math.round(leadTimeHours * 10) / 10, unit: 'hours', band: band(leadTimeHours, 24, 168, 720, true) },
      changeFailureRate: { value: changeFailurePct, unit: 'percent', band: band(changeFailurePct, 5, 15, 30, true) },
      timeToRestore: { value: mttrHours == null ? null : Math.round(mttrHours * 10) / 10, unit: 'hours', band: band(mttrHours, 1, 24, 360, true) },
    };

    const known = Object.values(metrics).filter((m) => m.value != null).length;
    const bands = Object.values(metrics).map((m) => m.band);
    const worst = bands.includes('low') ? 'low' : bands.includes('medium') ? 'medium' : bands.includes('unknown') ? 'unknown' : 'elite';

    const lines: string[] = [];
    lines.push(`DORA Metrics — ${repoId}`);
    lines.push('='.repeat(`DORA Metrics — ${repoId}`.length));
    lines.push('');
    lines.push(`Window: ${timeframe} (${days} days), ${deployments.length} deployment(s), ${incidents.length} incident(s)`);
    lines.push('');
    lines.push('  METRIC                     VALUE        BAND');
    lines.push(`  Deployment frequency       ${String(metrics.deploymentFrequency.value).padEnd(10)} ${metrics.deploymentFrequency.band}`);
    lines.push(`  Lead time for change       ${String(metrics.leadTimeForChange.value ?? 'n/a').padEnd(10)} ${metrics.leadTimeForChange.band}`);
    lines.push(`  Change failure rate        ${String(metrics.changeFailureRate.value).padEnd(10)} ${metrics.changeFailureRate.band}`);
    lines.push(`  Time to restore            ${String(metrics.timeToRestore.value ?? 'n/a').padEnd(10)} ${metrics.timeToRestore.band}`);
    lines.push('');
    lines.push(`Overall band: ${worst} (the weakest of the four — these trade off against each other)`);
    lines.push('');
    lines.push('Deployment frequency and lead time rise together; change failure rate and time');
    lines.push('to restore fall together. A team in the elite band on the first two and the low');
    lines.push('band on the last two has bought speed with stability, and the number that moves');
    lines.push('first will be the one that was traded away.');
    if (known < 4) {
      lines.push('');
      lines.push(`${4 - known} metric(s) could not be computed from the records supplied. They are`);
      lines.push('reported as n/a rather than estimated.');
    }

    ctx.store.save('dora-metrics', [
      ...(ctx.store.load('dora-metrics', []) || []),
      { repoId, timeframe, days, metrics, overallBand: worst, createdAt: new Date().toISOString() },
    ]);

    return {
      success: true,
      status: known === 4 ? 'ok' : 'partial',
      data: { repoId, timeframe, days, deployments: deployments.length, incidents: incidents.length, metrics, overallBand: worst, source: 'supplied-input' },
      error: null,
      present: [{ id: 'dora', title: `DORA Metrics — ${repoId}`, kind: 'text', body: lines.join(NL) }],
    };
  },
});

export { CALCULATE_DORA };