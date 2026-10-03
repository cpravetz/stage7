import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Scheduled half of the genre/market evaluator split.
 *
 * Produces the recurring per-genre market report over the configured genres and
 * regions. It deliberately does not pretend to fetch external trend data: there
 * is no market data provider wired up, so the report says what it is based on
 * rather than implying chart data it does not have.
 */
const SCRIPTWRITING_MARKET_REPORT_SCHEDULED = createDeclarativeCodeSkill({
  id: 'scriptwriting-market-report-scheduled',
  name: 'Genre Market Report',
  description: 'Scheduled genre and region market report built from configured project records, with no external trend data.',
  persistenceEnvVar: 'SCRIPTWRITING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, manual)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the report was generated' },
      data: { type: 'object', description: 'Per-genre and per-region report built from stored project records' },
      error: { type: 'string', description: 'Why no report could be produced' },
    },
    required: ['success'],
  },
  configSchema: {
    type: 'object',
    properties: {
      genres: { type: 'array', items: { type: 'string' }, description: 'Genres this report covers' },
      regions: { type: 'array', items: { type: 'string' }, description: 'Regions this report covers' },
      cadence: { type: 'string', description: 'Cron expression or schedule id for this run' },
    },
    required: ['genres'],
    additionalProperties: false,
  },
  triggers: [
    { kind: 'schedule', cadence: 'Monthly genre market report' },
  ],
  tier: 'advise',
  domainKnowledge: 'Scriptwriting genre conventions, structural readiness analysis, audience alignment',
  isSkill: true,
  handler: async function handler(input, ctx) {
    const genres = Array.isArray(ctx.config?.genres) ? (ctx.config!.genres as unknown[]).map(String) : [];
    const regions = Array.isArray(ctx.config?.regions) ? (ctx.config!.regions as unknown[]).map(String) : [];
    const cadence = typeof ctx.config?.cadence === 'string' ? ctx.config.cadence : null;
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    // The only evidence available is what this Skill has already stored. No
    // external trend data is fetched, and the report must not imply otherwise.
    const projects: Array<Record<string, any>> = ctx.store.load('projects', []);

    const byGenre: Record<string, { projects: number; regions: Record<string, number> }> = {};
    for (const genre of genres) {
      const matching = projects.filter((p) => p && String(p.genre || '') === genre);
      const regionCounts: Record<string, number> = {};
      for (const project of matching) {
        const region = String(project.region || project.audience || 'unspecified');
        regionCounts[region] = (regionCounts[region] || 0) + 1;
      }
      // Restrict the region breakdown to configured regions so the report cannot
      // widen its own scope.
      const scoped: Record<string, number> = {};
      for (const region of regions.length ? regions : Object.keys(regionCounts)) {
        scoped[region] = regionCounts[region] || 0;
      }
      byGenre[genre] = { projects: matching.length, regions: scoped };
    }

    const report = {
      id: `market_report_${Date.now()}`,
      runReason,
      cadence,
      genres,
      regions,
      byGenre,
      projectsExamined: projects.length,
      externalDataFetched: false,
      method: 'local-project-tally',
      disclaimer:
        'Built from locally stored project records only. No external chart, streaming, or sales data was fetched, so this is a demand signal of prior work, not market size.',
      createdAt: new Date().toISOString(),
    };
    ctx.store.save('market-reports', report);

    const covered = genres.filter((g: string) => byGenre[g].projects > 0);
    return {
      success: true,
      data: report,
      present: [
        ctx.render.text(
          'report',
          'Genre Market Report',
          `Covered ${covered.length}/${genres.length} configured genre(s) across ${regions.length || 'all'} region(s), from ${projects.length} stored project record(s). No external trend data was fetched.`,
        ),
      ],
    };
  },
});

export { SCRIPTWRITING_MARKET_REPORT_SCHEDULED };