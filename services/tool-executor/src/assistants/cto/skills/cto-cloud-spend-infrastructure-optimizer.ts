// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../../../adk/code-skill-factory';
import { CLOUD_SPEND_TRIGGERS } from '../cto-contract';

export const CTO_CLOUD_SPEND_INFRASTRUCTURE_OPTIMIZER = createDeclarativeCodeSkill({
    id: 'cto-cloud-spend-infrastructure-optimizer',
    name: 'Cloud Spend & Infrastructure Optimizer',
    description: 'Analyze supplied cloud billing and utilization rows to recommend rightsizing and capacity actions.',
    persistenceEnvVar: 'CTO_HOME',
    inputSchema: createSchemaRecord({
      billingRows: SchemaProps.objectArray(SchemaProps.object({
        service: SchemaProps.text({ description: 'Cloud service or account name' }),
        spend: SchemaProps.number({ description: 'Billing amount for the period' }),
        utilization: SchemaProps.number({ description: 'Average resource utilization from 0 to 1' }),
      }), { description: 'Cloud billing and utilization records' }),
      context: SchemaProps.object({}, { description: 'Additional context for cost analysis', additionalProperties: true }),
    }, { required: ['billingRows'] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether optimization completed' }),
      data: SchemaProps.object({}, { description: 'Recommendations and savings estimate' }),
      error: SchemaProps.text({ description: 'Failure message' }),
      present: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text({}),
        title: SchemaProps.text({}),
        kind: SchemaProps.text({}),
        body: SchemaProps.text({}),
      }), { description: 'Pre-formatted user-facing output blocks' }),
    }),
    triggers: CLOUD_SPEND_TRIGGERS,
    tier: 'advise',
    domainKnowledge: 'Cloud cost attribution, rightsizing economics, capacity planning, and infrastructure unit economics',
    manifest: {
      ui: { view: 'cloud-cost-optimizer' }
    },
    handler: async function handler(input, ctx) {
        const rows = Array.isArray(input.billingRows) ? input.billingRows : [];
        if (!rows.length) {
          const result = { success: false, error: 'Not connected: no cloud billing rows were supplied', data: {} };

          return result;
        }
        const recommendations = [];
        const errors = [];
        for (const row of rows) {
          try {
            const result = await ctx.delegate('cto-infrastructure-query', {
              provider: 'cost-optimization',
              query: 'analyze spend for ' + (row.service || 'unknown') + ' with billing ' + (row.spend || 0) + ' and utilization ' + (row.utilization || 0),
              options: { billingRow: row },
            });
            if (result && result.success === false) {
              errors.push({ service: row.service || 'unknown', error: result.error || 'Underlying tool returned failure' });
            }
            recommendations.push(result);
          } catch (e) {
            errors.push({ service: row.service || 'unknown', error: e instanceof Error ? e.message : String(e) });
          }
        }
        const rightsizing = rows.map((row) => {
          const spend = Number(row.spend || 0);
          const utilization = Number(row.utilization || 0);
          const projectedSavings = Math.round(spend * Math.min(0.35, Math.max(0, (1 - utilization) * 0.45)) * 100) / 100;
          return { service: row.service, currentSpend: spend, utilization, projectedSavings, action: utilization < 0.3 ? 'rightsizing or shutdown review' : utilization < 0.6 ? 'reserved capacity review' : 'monitor' };
        });
        const totalProjectedSavings = rightsizing.reduce((sum, item) => sum + item.projectedSavings, 0);
        const result = { success: true, data: { recommendations: rightsizing, totalProjectedSavings, evaluationResults: recommendations, generatedAt: new Date().toISOString() }, error: errors.length ? errors : null };
        const reportLines = [
          'Cloud Spend & Infrastructure Optimization',
          'Billing Rows Analyzed: ' + rows.length,
          'Total Projected Savings: $' + totalProjectedSavings.toFixed(2),
          '',
          'Recommendations:',
        ];
        rightsizing.forEach((item) => {
          reportLines.push('  - ' + item.service + ': Spend $' + item.currentSpend.toFixed(2) + ', Utilization ' + (item.utilization * 100).toFixed(1) + '%, Projected Savings $' + item.projectedSavings.toFixed(2) + ' — ' + item.action);
        });
        if (errors.length) {
          reportLines.push('', 'Errors from underlying queries:');
          errors.forEach((e, i) => {
            reportLines.push('  ' + (i + 1) + '. ' + e.service + ': ' + e.error);
          });
        }

        return result;
      }
    });
