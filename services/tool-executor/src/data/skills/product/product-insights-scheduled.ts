// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../code-skill-factory';

export const PRODUCT_INSIGHTS_SCHEDULED = createDeclarativeCodeSkill({
    id: 'product-insights-scheduled',
    name: 'Product Insights (Scheduled)',
    description: 'Scheduled metrics sweep over the configured metrics and segments, reporting movement against configured thresholds.',
    persistenceEnvVar: 'STORAGE_DIR',
    tier: 'advise',
    isSkill: true,
    domainKnowledge: 'Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation',
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
    // Required selector. The user half names its own metric per run; the
    // scheduled half must be told what it watches or it cannot be bounded.
    configSchema: {
      type: 'object',
      properties: {
        metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics this sweep watches' },
        segments: { type: 'array', items: { type: 'string' }, description: 'Segments to break each metric down by' },
        cadence: { type: 'string', description: 'Cron expression or schedule id for this run' },
        thresholds: { type: 'object', description: 'Alert thresholds keyed by metric name' },
      },
      required: ['metrics'],
      additionalProperties: false,
    },
    triggers: [{ kind: 'schedule', cadence: 'Hourly metrics sweep' }],
    async handler(input, ctx) {
      // Scope comes from config, not from the caller.
      const metrics = Array.isArray(ctx.config?.metrics) ? ctx.config.metrics.map(String) : [];
      const segments = Array.isArray(ctx.config?.segments) ? ctx.config.segments.map(String) : [];
      const thresholds = (ctx.config?.thresholds ?? {}) as Record<string, unknown>;
      const cadence = typeof ctx.config?.cadence === 'string' ? ctx.config.cadence : null;

      if (!metrics.length) {
        return {
          success: false,
          status: 'not-configured',
          error: 'No metrics configured. Set config.metrics before this Skill can run.',
          present: [ctx.render.text('notice', 'No metrics configured', 'Set config.metrics before the scheduled insights sweep can run.')],
        };
      }

      const endpoint = String(ctx.config?.endpoint || '');
      if (!endpoint) {
        return {
          success: false,
          status: 'not-connected',
          error: 'Not connected: no analytics platform endpoint configured. Set endpoint in this Skill\'s configuration.',
          present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no analytics platform endpoint configured. Set endpoint in this Skill\'s configuration.')],
        };
      }

      const results: Array<Record<string, unknown>> = [];
      const unreachable: string[] = [];
      for (const metric of metrics) {
        try {
          const response = await ctx.delegate('api_client', {
            path: endpoint,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
              system: 'product_analytics',
              action: 'analyze_metrics',
              data: { metric, segments, thresholds: thresholds[metric] ?? null },
              cadence,
            },
            acceptErrorResponses: true,
          });
          results.push({ metric, status: response?.status ?? 0, success: response?.success === true, data: response?.data ?? null });
        } catch (err) {
          // One metric failing must not be reported as a clean sweep.
          unreachable.push(metric);
          results.push({ metric, error: err instanceof Error ? err.message : String(err) });
        }
      }

      const succeeded = results.filter((r) => r.success === true).length;
      return {
        success: unreachable.length === 0,
        status: unreachable.length === 0 ? 'ok' : 'partial',
        data: { metrics, segments, cadence, requested: metrics.length, succeeded, unreachable, results },
        error: unreachable.length ? `Could not query: ${unreachable.join(', ')}` : null,
        present: [
          ctx.render.text('report', 'Product Insights Sweep', `${succeeded}/${metrics.length} configured metric(s) returned data${unreachable.length ? `; ${unreachable.length} unreachable` : ''}.`),
        ],
      };
    },
  });
