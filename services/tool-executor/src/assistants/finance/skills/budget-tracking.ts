// @ts-nocheck

import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { financeResultSchema } from '../finance-contract';

const BUDGET_LEDGER_ENV = 'FINANCE_ERP_ENDPOINT';
const BUDGET_API_KEY_ENV = 'FINANCE_ERP_API_KEY';

const budgetTrackingInputSchema = createSchemaRecord({
  entity: SchemaProps.text({ description: 'Entity or cost center the budget belongs to' }),
  period: SchemaProps.text({ description: 'Reporting period the budget covers (e.g. 2026-Q3)' }),
  budget: SchemaProps.objectArray(SchemaProps.object({
    category: SchemaProps.text({ description: 'Budget category or account' }),
    budgeted: SchemaProps.number({ description: 'Budgeted amount for the period' }),
  }), { description: 'Budget lines to compare against actuals' }),
  actuals: SchemaProps.objectArray(SchemaProps.object({
    category: SchemaProps.text({ description: 'Budget category or account' }),
    amount: SchemaProps.number({ description: 'Actual amount recorded for the period' }),
  }), { description: 'Actual amounts by category' }),
  periodsElapsed: SchemaProps.number({ description: 'Periods elapsed so far, used for run-rate forecasting', minimum: 0 }),
  periodsTotal: SchemaProps.number({ description: 'Total periods in the budget period, used for run-rate forecasting', minimum: 1 }),
  varianceDirection: SchemaProps.select(['unfavorable-up', 'favorable-up'], {
    description: 'Whether exceeding a category counts as over budget (costs) or under budget (revenue)',
    default: 'unfavorable-up',
  }),
  tolerancePct: SchemaProps.number({ description: 'Absolute variance tolerated before a category is flagged', minimum: 0, maximum: 1, default: 0.05 }),
  system: SchemaProps.select(['netsuite', 'quickbooks', 'xero', 'custom'], { description: 'Accounting system the budget ledger belongs to' }),
  endpoint: SchemaProps.url({ description: 'Budget ledger endpoint override for this call' }),
  dryRun: SchemaProps.boolean({ description: 'Stage the analysis without writing it; defaults to true', default: true }),
  confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live budget-ledger write; required when dryRun is false', default: false }),
});

const budgetTrackingOutputSchema = financeResultSchema(
  'Budget-vs-actual analysis: per-category budget, actual, variance and status; a summary block with totals, '
  + 'consumed percentage and run-rate forecast at completion; the out-of-tolerance categories; and whether '
  + 'anything was actually written to the budget ledger',
);

const budgetTrackingSkill = createDeclarativeCodeSkill({
  id: 'budget-tracking',
  name: 'Budget Tracking',
  description: 'Track budget vs. actuals across categories, deriving variance, exception categories and a run-rate forecast, then stage that analysis for the configured accounting ERP behind an explicit confirmation gate. With no endpoint configured it reports the variance it computed and marks the write as not connected rather than inventing a ledger result.',
  persistenceEnvVar: 'STORAGE_DIR',
  tier: 'represent',
  domainKnowledge: 'Corporate finance principles, US GAAP/IFRS standards, operating budget models, and budget-variance analysis',
  inputSchema: budgetTrackingInputSchema,
  outputSchema: budgetTrackingOutputSchema,
  triggers: [
    { kind: 'schedule', cadence: 'periodic budget-vs-actual monitoring' },
  ],
  isSkill: true,
  manifest: {
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "ERP service API key, needed only for a live write (set in this Skill configuration, or a vault secret)" },
  },
    configSchema: createSchemaRecord({
      endpointUrl: SchemaProps.url({ description: 'Accounting ERP endpoint URL; may also be supplied at runtime through ' + BUDGET_LEDGER_ENV }),
      system: SchemaProps.select(['netsuite', 'quickbooks', 'xero', 'custom'], { description: 'Accounting system the budget ledger belongs to' }),
      defaultDryRun: SchemaProps.boolean({ description: 'Default budget tracking to dry-run', default: true }),
    }),
    endpointConfigKey: 'endpointUrl',
    // The key is optional (`required: false`): it is only needed for a live external

    // write, so gating on it would block the analysis-only and dry-run paths that

    // report what this Skill can honestly compute without one.
    persistenceEnv: 'FINANCE_HOME',
    timeoutMs: 30000
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const ENDPOINT_ENV = "FINANCE_ERP_ENDPOINT";
      const API_KEY_ENV = "FINANCE_ERP_API_KEY";

      function round2(n) { return Math.round(n * 100) / 100; }
      function round4(n) { return Math.round(n * 10000) / 10000; }
      function num(value) { return typeof value === 'number' && isFinite(value) ? value : null; }

      const dryRun = input.dryRun === true || input.dryRun === undefined;
      const liveRequested = input.dryRun === false;
      const confirmed = input.confirmation === true;

      const budgetLines = Array.isArray(input.budget) ? input.budget : [];
      const actualLines = Array.isArray(input.actuals) ? input.actuals : [];

      // Actuals are indexed by category so a line matches regardless of the order the two schedules
      // arrive in. Duplicate actual categories sum rather than overwrite.
      const actualByCategory = {};
      actualLines.forEach(function (line) {
        if (!line || typeof line !== 'object') return;
        const category = String(line.category || 'uncategorised');
        const amount = num(line.amount);
        if (amount === null) return;
        actualByCategory[category] = round2((actualByCategory[category] || 0) + amount);
      });

      // For a cost line, spending more than budget is the unfavourable direction. A revenue line reads
      // the other way round, so the caller declares which one this schedule is.
      const overIsFavourable = input.varianceDirection === 'favorable-up';
      const tolerance = typeof input.tolerancePct === 'number' ? input.tolerancePct : 0.05;

      const categories = [];
      budgetLines.forEach(function (line, index) {
        if (!line || typeof line !== 'object') return;
        const category = String(line.category || ('line ' + (index + 1)));
        const budgeted = num(line.budgeted) === null ? 0 : num(line.budgeted);
        const actual = actualByCategory[category] === undefined ? 0 : actualByCategory[category];
        const variance = round2(actual - budgeted);
        const variancePct = budgeted > 0 ? round4(variance / budgeted) : null;
        // A variance is adverse when it moves against the declared direction: overspending a cost line,
        // or undershooting a revenue line. Only an adverse variance beyond tolerance is reported as an
        // exception.
        const adverse = overIsFavourable ? variance < 0 : variance > 0;
        let status = 'on-track';
        if (budgeted <= 0) status = 'no-budget';
        else if (Math.abs(variancePct) > tolerance) status = adverse ? 'over' : 'under';
        categories.push({
          category: category,
          budgeted: round2(budgeted),
          actual: round2(actual),
          variance: variance,
          variancePct: variancePct,
          consumedPct: budgeted > 0 ? round4(actual / budgeted) : null,
          status: status,
        });
      });

      const totalBudgeted = round2(categories.reduce(function (sum, c) { return sum + c.budgeted; }, 0));
      const totalActual = round2(categories.reduce(function (sum, c) { return sum + c.actual; }, 0));
      const totalVariance = round2(totalActual - totalBudgeted);
      const totalVariancePct = totalBudgeted > 0 ? round4(totalVariance / totalBudgeted) : null;

      // Periods elapsed lets a run-rate project a full-period actual from a partial one. A tick on day 3
      // of a 30-day period should not read as a 90% overrun.
      const periodsElapsed = num(input.periodsElapsed);
      const periodsTotal = num(input.periodsTotal);
      const paceKnown = periodsElapsed !== null && periodsTotal !== null && periodsTotal > 0 && periodsElapsed > 0;
      const paceFraction = paceKnown ? Math.min(1, periodsElapsed / periodsTotal) : null;
      const forecastAtCompletion = paceFraction && paceFraction > 0 ? round2(totalActual / paceFraction) : null;
      const forecastVariance = forecastAtCompletion === null ? null : round2(forecastAtCompletion - totalBudgeted);

      const exceptions = categories.filter(function (c) { return c.status === 'over'; });
      const unmatchedActuals = Object.keys(actualByCategory).filter(function (category) {
        return !categories.some(function (c) { return c.category === category; });
      });

      const analysis = {
        entity: input.entity || null,
        period: input.period || null,
        categories: categories,
        summary: {
          totalBudgeted: totalBudgeted,
          totalActual: totalActual,
          totalVariance: totalVariance,
          totalVariancePct: totalVariancePct,
          consumedPct: totalBudgeted > 0 ? round4(totalActual / totalBudgeted) : null,
          forecastAtCompletion: forecastAtCompletion,
          forecastVariance: forecastVariance,
          periodsElapsed: periodsElapsed,
          periodsTotal: periodsTotal,
          categoryCount: categories.length,
          exceptionCount: exceptions.length,
        },
        exceptions: exceptions,
        unmatchedActuals: unmatchedActuals,
      };

      function renderAnalysis(a) {
        const lines = [];
        lines.push('Budget vs. actual' + (a.period ? ' - ' + a.period : ''));
        if (a.entity) lines.push('Entity: ' + a.entity);
        lines.push('');
        if (!a.categories.length) {
          lines.push('No budget lines were supplied, so no variance could be computed.');
        } else {
          a.categories.forEach(function (c) {
            const pct = c.variancePct === null ? 'n/a' : (c.variancePct * 100).toFixed(1) + '%';
            lines.push('  ' + c.category + ': budget ' + c.budgeted + ', actual ' + c.actual
              + ', variance ' + c.variance + ' (' + pct + ') - ' + c.status);
          });
        }
        lines.push('');
        lines.push('Total: budget ' + a.summary.totalBudgeted + ', actual ' + a.summary.totalActual
          + ', variance ' + a.summary.totalVariance);
        if (a.summary.forecastAtCompletion !== null) {
          lines.push('Run-rate forecast at completion: ' + a.summary.forecastAtCompletion
            + ' (variance ' + a.summary.forecastVariance + ')');
        }
        if (a.exceptions.length) {
          lines.push('');
          lines.push('Categories outside tolerance: ' + a.exceptions.map(function (c) { return c.category; }).join(', '));
        }
        if (a.unmatchedActuals.length) {
          lines.push('');
          lines.push('Actuals with no matching budget line: ' + a.unmatchedActuals.join(', '));
        }
        return lines;
      }

      function renderRequest(a) {
        return [
          'Destination: ' + (input.system || 'accounting ERP') + ' budget ledger',
          'Period: ' + (a.period || 'unspecified'),
          'Categories submitted: ' + a.categories.length,
        ];
      }

      const endpoint = String(input.endpoint || ctx.config?.endpointUrl || '').trim();
      const analysisLines = renderAnalysis(analysis);

      if (!budgetLines.length) {
        return { success: false, status: 'blocked', data: { analysis: analysis, sent: false }, error: 'No budget lines were supplied, so no budget-variance analysis could be produced.', present: [{ id: 'budget-tracking-blocked', title: 'Budget tracking has nothing to compare', kind: 'text', body: analysisLines.join(NL) }] };
        return;
      }

      if (!endpoint) {
        return { success: false, status: 'not-connected', data: { analysis: analysis, endpoint: null, sent: false }, error: 'Not connected: ' + ENDPOINT_ENV + ' is not configured', present: [{ id: 'budget-tracking-summary', title: 'Budget vs. actual', kind: 'text', body: analysisLines.concat([
            '',
            'No accounting ERP is configured, so nothing was written. Set ' + ENDPOINT_ENV
            + ' to push this variance analysis into the budget ledger.',
          ]).join(NL) }] };
        return;
      }

      if (liveRequested && !confirmed) {
        return { success: false, status: 'confirmation-required', data: { analysis: analysis, endpoint: endpoint, sent: false }, error: 'Confirmation required before writing to the budget ledger', present: [{ id: 'budget-tracking-staged', title: 'Budget ledger write staged', kind: 'text', body: renderRequest(analysis).concat([
            '',
            'This write was not sent: a live budget-ledger write needs dryRun false and confirmation true.',
          ]).join(NL) }] };
        return;
      }

      if (dryRun) {
        return { success: true, status: 'dry-run', data: { analysis: analysis, endpoint: endpoint, sent: false }, error: null, present: [{ id: 'budget-tracking-staged', title: 'Budget ledger write staged', kind: 'text', body: renderRequest(analysis).concat([
            '',
            'Dry run: the variance analysis above was computed locally and nothing was sent.',
          ]).join(NL) }] };
        return;
      }

      const headers = { 'Content-Type': 'application/json' };
            // Secrets arrive through ctx.credentials, resolved from this Skill's
      // credentialSource, never from the process environment.
      const apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '').trim();
      if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
      const body = JSON.stringify({ operation: 'budget-tracking', entity: input.entity || null, period: input.period || null, analysis: analysis });

      try {
        const res = await fetch(endpoint, { method: 'POST', headers: headers, body: body });
        const responseText = await res.text();
        let responseData = null;
        if (responseText) { try { responseData = JSON.parse(responseText); } catch (e) { responseData = { text: responseText }; } }

        const sendLines = renderRequest(analysis).concat(['', 'Endpoint responded: ' + res.status, ''], analysisLines);
        return { success: res.ok, status: res.ok ? 'ok' : 'failed', data: { analysis: analysis, endpoint: endpoint, sent: true, responseStatus: res.status, responseData: responseData }, error: res.ok ? null : 'The budget ledger endpoint responded with status ' + res.status, present: [{ id: 'budget-tracking-summary', title: 'Budget vs. actual', kind: 'text', body: sendLines.join(NL) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, status: 'failed', data: { analysis: analysis, endpoint: endpoint, sent: true }, error: message, present: [{ id: 'budget-tracking-failed', title: 'Budget ledger write failed', kind: 'text',
            body: ['The budget ledger endpoint could not be reached: ' + message, '', 'The variance analysis was not written.', '']
              .concat(analysisLines).join(NL) }] };
      }
    }
  });
budgetTrackingSkill.configSchema = createSchemaRecord({
      endpointUrl: SchemaProps.url({ description: 'Accounting ERP endpoint URL; may also be supplied at runtime through ' + BUDGET_LEDGER_ENV }),
      system: SchemaProps.select(['netsuite', 'quickbooks', 'xero', 'custom'], { description: 'Accounting system the budget ledger belongs to' }),
      defaultDryRun: SchemaProps.boolean({ description: 'Default budget tracking to dry-run', default: true }),
    });

export { budgetTrackingSkill };
