import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Scheduled half of the compliance-tracking split.
 *
 * The `sources` selector is required so the scan has a bounded scope: an
 * unbounded "scan everything" compliance job is the wide-scope configuration
 * that motivated the split. `policySetId`, `scanWindow` and `notifyOn` narrow it
 * further.
 */
const COMPLIANCE_TRACKING_SCHEDULED = createDeclarativeCodeSkill({
  id: 'compliance-tracking-scheduled',
  name: 'Compliance Audit Sweep',
  description: 'Scheduled compliance scan across configured sources, reporting scope and any findings for review.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, manual, upstream)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          sourcesScanned: { type: 'array' },
          sourcesUnreachable: { type: 'array' },
          policySetId: { type: 'string' },
          scanWindow: { type: 'string' },
          notifyOn: { type: 'array' },
          controlsChecked: { type: 'number' },
          rulesEvaluated: { type: 'number' },
          evaluated: { type: 'boolean' },
          findings: { type: 'array' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  configSchema: {
    type: 'object',
    properties: {
      sources: { type: 'array', items: { type: 'string' }, description: 'Store keys of the systems to scan' },
      policySetId: { type: 'string', description: 'Policy set the scan evaluates against' },
      scanWindow: { type: 'string', description: 'Cron expression or window definition for this run' },
      notifyOn: { type: 'array', items: { type: 'string' }, description: 'Finding severities that should raise a notification' },
    },
    required: ['sources'],
    additionalProperties: false,
  },
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Regulatory compliance frameworks (GDPR, HIPAA, SOX, PCI-DSS, FERPA), audit horizon planning, and compliance risk scorecarding',
  triggers: [
    { kind: 'schedule', cadence: 'Monthly compliance audit (1st of month 06:00)' },
  ],
  async handler(input, ctx) {
    const sources = Array.isArray(ctx.config?.sources) ? (ctx.config!.sources as unknown[]).map(String) : [];
    const policySetId = typeof ctx.config?.policySetId === 'string' ? (ctx.config!.policySetId as string) : undefined;
    const scanWindow = typeof ctx.config?.scanWindow === 'string' ? (ctx.config!.scanWindow as string) : undefined;
    const notifyOn = Array.isArray(ctx.config?.notifyOn) ? (ctx.config!.notifyOn as unknown[]).map(String) : [];
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    const sourcesScanned: string[] = [];
    const sourcesUnreachable: string[] = [];
    let controlsChecked = 0;

    for (const source of sources) {
      const record = ctx.store.load(source, null);
      if (record === null || record === undefined) {
        sourcesUnreachable.push(source);
        continue;
      }
      sourcesScanned.push(source);
      const controls = Array.isArray((record as Record<string, unknown>)?.controls)
        ? ((record as Record<string, unknown>).controls as unknown[]).length
        : Array.isArray(record)
          ? record.length
          : 0;
      controlsChecked += controls;
    }

    // No policy engine is wired up. Say so rather than reporting a green audit:
    // a scheduled job that cannot fail is worse than no job, because it reads
    // as coverage.
    const evaluated = Boolean(policySetId);
    const report = {
      id: `comp_sweep_${Date.now()}`,
      runReason,
      policySetId: policySetId ?? null,
      scanWindow: scanWindow ?? null,
      notifyOn,
      sourcesScanned,
      sourcesUnreachable,
      controlsChecked,
      rulesEvaluated: 0,
      evaluated,
      findings: [],
      createdAt: new Date().toISOString(),
      method: 'scope-reconciliation',
      disclaimer: evaluated
        ? 'Policy set named but no rule engine is wired; controls were counted, not evaluated.'
        : 'No policySetId configured. This run reconciled scope only and evaluated no controls.',
    };
    ctx.store.save('compliance-sweep', report);

    return {
      success: true,
      data: report,
      present: [
        ctx.render.text(
          'report',
          'Compliance Audit Sweep',
          `Reconciled ${sourcesScanned.length} source(s) and ${controlsChecked} control(s). ${evaluated ? 'No rule engine wired, so no controls were evaluated.' : 'No policySetId configured, so no controls were evaluated.'}`,
        ),
      ],
    };
  },
});

export { COMPLIANCE_TRACKING_SCHEDULED };