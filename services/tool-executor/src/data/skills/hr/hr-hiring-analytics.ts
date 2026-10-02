// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, hrResultSchema } from './hr-contract';

// ============================================================================
// SKILL 5: hr-hiring-analytics (Advise)
// Schedule trigger: "Weekly hiring pipeline report"
// ============================================================================

export const HR_HIRING_ANALYTICS = createDeclarativeCodeSkill({
  id: 'hr-hiring-analytics',
  name: 'Hiring Pipeline Analytics',
  description: 'Evaluates team headcount needs, attrition trends, and market salary data. Generates hiring metrics, pipeline reports, and diversity analytics. Runs weekly.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      dateRange: SchemaProps.object({
        start: SchemaProps.text({ description: 'Start date for analysis period in ISO 8601 format' }),
        end: SchemaProps.text({ description: 'End date for analysis period in ISO 8601 format' }),
      }, { description: 'Date range for the analysis period' }),
      data: SchemaProps.object({}, { description: 'Hiring records for analytics (optional inline override)' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: [],
  },
  outputSchema: hrResultSchema('Hiring analytics report with candidate counts by stage, time-to-fill, and diversity metrics'),
  tier: 'advise',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    { kind: 'schedule', cadence: 'Weekly hiring pipeline report' },
  ],
  isSkill: true,
  async handler(input, ctx) {
    function computeAnalytics(records: any[]) {
      const totalCandidates = records.length;
      const byStage: Record<string, number> = {};
      records.forEach((r) => { const stage = (r && r.stage) || 'unknown'; byStage[stage] = (byStage[stage] || 0) + 1; });
      const avgTimeToFill = records.length ? records.reduce((sum, r) => sum + ((r && r.timeToFill) || 0), 0) / records.length : 0;
      const diversity = { underrepresented: records.filter((r) => r && r.diversityCategory).length, total: totalCandidates };
      return { totalCandidates, byStage, avgTimeToFill: Math.round(avgTimeToFill * 10) / 10, diversity };
    }

    // Inline data overrides the persisted collection so the same skill can be
    // exercised against a supplied sample without touching the store.
    const inlineData = input.data || null;
    const analyticsPath = ctx.store.getFilePath('analytics');
    const store = inlineData ? (Array.isArray(inlineData) ? inlineData : []) : ctx.store.load('analytics', []);

    if (!store.length) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: ' + 'no hiring analytics records found in ' + analyticsPath,
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: ' + 'no hiring analytics records found in ' + analyticsPath)],
};
    }

    const report = computeAnalytics(store);
    const generatedAt = new Date().toISOString();

    const lines = [
      'Hiring Pipeline Analytics Report',
      'Generated: ' + generatedAt,
      '',
      'Total Candidates: ' + report.totalCandidates,
      '',
      'By Stage:',
    ];
    for (const stage of Object.keys(report.byStage)) {
      lines.push('  ' + stage + ': ' + report.byStage[stage]);
    }
    lines.push('');
    lines.push('Average Time to Fill: ' + report.avgTimeToFill + ' days');
    lines.push('');
    lines.push('Diversity: ' + report.diversity.underrepresented + ' of ' + report.diversity.total + ' candidates from underrepresented groups');
    lines.push('');
    lines.push('Source: Local data analysis (no external market data queried)');
    lines.push('Scope: Computed from records in ' + analyticsPath + (inlineData ? ' (inline data override)' : ''));

    return {
      success: true,
      status: 'ok',
      data: { report, generatedAt },
      error: null,
      present: [ctx.render.text('report', 'Hiring Analytics', lines)],
    };
  },
});
