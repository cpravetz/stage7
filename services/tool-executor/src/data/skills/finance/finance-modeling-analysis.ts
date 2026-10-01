// @ts-nocheck
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import { financeResultSchema } from './finance-contract';

const financeModelingAnalysisInputSchema = createSchemaRecord({
  revenue: SchemaProps.number({ description: 'Starting annual revenue', minimum: 0 }),
  costs: SchemaProps.number({ description: 'Starting annual costs', minimum: 0 }),
  periods: SchemaProps.integer({ description: 'Number of projection periods (years)', minimum: 1, maximum: 20, default: 5 }),
  growthRate: SchemaProps.number({ description: 'Annual revenue growth rate (%)', default: 5 }),
  costGrowthRate: SchemaProps.number({ description: 'Annual cost growth rate (%)', default: 3 }),
  taxRate: SchemaProps.number({ description: 'Corporate tax rate (%)', minimum: 0, maximum: 100, default: 21 }),
  discountRate: SchemaProps.number({ description: 'Discount rate for NPV (%)', minimum: 0, maximum: 50, default: 10 }),
  capexSchedule: SchemaProps.objectArray(SchemaProps.number({ description: 'Capital expenditure per period' }), { description: 'Array of capex per period (optional)', default: [] }),
  workingCapitalPct: SchemaProps.number({ description: 'Working capital as % of revenue change', minimum: 0, maximum: 50, default: 10 }),
});

const financeModelingAnalysisOutputSchema = financeResultSchema(
  'Model refresh: per-period projections (revenue, costs, margins, EBIT, NOPAT, capex, working capital, free cash flow), '
  + 'a summary block (NPV, IRR, payback period, total revenue, total costs, total FCF, average margins, ROIC), '
  + 'and base/bull/bear sensitivity results',
);

const financeModelingAnalysisSkill = createDeclarativeCodeSkill({
  id: 'finance-modeling-analysis',
  name: 'Finance Modeling & Analysis',
  description: 'Produce financial models with revenue projections, FCFF, NPV, IRR, and sensitivity analysis, refreshed on a schedule.',
  persistenceEnvVar: 'FINANCE_HOME',
  tier: 'advise',
  domainKnowledge: 'Corporate finance principles, US GAAP/IFRS standards, financial modeling, and capital allocation strategies',
  inputSchema: financeModelingAnalysisInputSchema,
  outputSchema: financeModelingAnalysisOutputSchema,
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
      function round2(n) { return Math.round(n * 100) / 100; }
      function round4(n) { return Math.round(n * 10000) / 10000; }

      const revenue = input.revenue || 0;
      const costs = input.costs || 0;
      const periods = Math.max(1, Math.min(20, Math.floor(input.periods || 5)));
      const growthRate = (input.growthRate || 5) / 100;
      const costGrowthRate = (input.costGrowthRate || 3) / 100;
      const taxRate = (input.taxRate || 21) / 100;
      const discountRate = (input.discountRate || 10) / 100;
      const capexSchedule = Array.isArray(input.capexSchedule) ? input.capexSchedule : [];
      const workingCapitalPct = (input.workingCapitalPct || 10) / 100;

      const projections = [];
      let cumulativeFCF = 0;
      let prevRevenue = revenue;

      for (let i = 1; i <= periods; i++) {
        const rev = revenue * Math.pow(1 + growthRate, i);
        const cst = costs * Math.pow(1 + costGrowthRate, i);
        const grossProfit = rev - cst;
        const grossMargin = rev > 0 ? grossProfit / rev : 0;
        const ebitda = grossProfit;
        const ebitdaMargin = rev > 0 ? ebitda / rev : 0;
        const depreciation = capexSchedule[i - 1] || (rev * 0.05);
        const ebit = ebitda - depreciation;
        const nopat = ebit * (1 - taxRate);
        const capex = capexSchedule[i - 1] || 0;
        const workingCapitalChange = (rev - prevRevenue) * workingCapitalPct;
        const freeCashFlow = nopat + depreciation - capex - workingCapitalChange;
        cumulativeFCF += freeCashFlow;
        projections.push({
          period: i, revenue: round2(rev), costs: round2(cst), grossProfit: round2(grossProfit),
          grossMargin: round4(grossMargin), ebitda: round2(ebitda), ebitdaMargin: round4(ebitdaMargin),
          depreciation: round2(depreciation), ebit: round2(ebit), nopat: round2(nopat),
          capex: round2(capex), workingCapitalChange: round2(workingCapitalChange),
          freeCashFlow: round2(freeCashFlow), cumulativeFCF: round2(cumulativeFCF),
        });
        prevRevenue = rev;
      }

      function npv(cashFlows, rate) {
        return cashFlows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i + 1), 0);
      }
      function irr(cashFlows, guess = 0.1) {
        let rate = guess;
        for (let iter = 0; iter < 100; iter++) {
          let npvVal = 0; let dnpv = 0;
          for (let i = 0; i < cashFlows.length; i++) {
            const denom = Math.pow(1 + rate, i + 1);
            npvVal += cashFlows[i] / denom;
            dnpv -= (i + 1) * cashFlows[i] / (denom * (1 + rate));
          }
          if (Math.abs(dnpv) < 1e-10) break;
          const newRate = rate - npvVal / dnpv;
          if (Math.abs(newRate - rate) < 1e-6) { rate = newRate; break; }
          rate = newRate;
          if (rate < -0.99) { rate = -0.99; break; }
          if (rate > 10) { rate = 10; break; }
        }
        return rate;
      }

      const fcfSeries = projections.map(p => p.freeCashFlow);
      const npvVal = npv(fcfSeries, discountRate);
      const irrVal = irr(fcfSeries);
      let paybackPeriod = null; let cum = 0;
      for (let i = 0; i < fcfSeries.length; i++) {
        cum += fcfSeries[i];
        if (cum >= 0) { paybackPeriod = i + 1; break; }
      }
      const totalRevenue = projections.reduce((s, p) => s + p.revenue, 0);
      const totalCosts = projections.reduce((s, p) => s + p.costs, 0);
      const totalFCF = projections.reduce((s, p) => s + p.freeCashFlow, 0);
      const avgGrossMargin = projections.reduce((s, p) => s + p.grossMargin, 0) / periods;
      const avgEbitdaMargin = projections.reduce((s, p) => s + p.ebitdaMargin, 0) / periods;
      const avgFcfMargin = totalRevenue > 0 ? totalFCF / totalRevenue : 0;
      const investedCapital = projections.reduce((s, p) => s + p.capex, 0) + projections[0].revenue * workingCapitalPct;
      const roic = investedCapital > 0 ? projections[projections.length - 1].nopat / investedCapital : 0;

      // Returns the NPV and IRR of the scenario's own cash flow series. Returning the base series here
      // would make bull, base and bear report identical numbers, which reads as a sensitivity analysis
      // while carrying no sensitivity at all.
      function runScenario(growthAdj, costAdj) {
        const series = []; let prevRev = revenue;
        for (let i = 1; i <= periods; i++) {
          const rev = revenue * Math.pow(1 + growthRate + growthAdj, i);
          const cst = costs * Math.pow(1 + costGrowthRate + costAdj, i);
          const ebitda = rev - cst; const dep = capexSchedule[i - 1] || (rev * 0.05);
          const ebit = ebitda - dep; const nopat = ebit * (1 - taxRate);
          const capex = capexSchedule[i - 1] || 0;
          const wcChange = (rev - prevRev) * workingCapitalPct;
          series.push(nopat + dep - capex - wcChange); prevRev = rev;
        }
        return { npv: npv(series, discountRate), irr: irr(series) };
      }

      const sensitivity = { base: runScenario(0, 0), bull: runScenario(0.02, -0.01), bear: runScenario(-0.02, 0.01) };
      const model = {
        projections,
        summary: { npv: round2(npvVal), irr: round4(irrVal), paybackPeriod: paybackPeriod ? round2(paybackPeriod) : null,
          totalRevenue: round2(totalRevenue), totalCosts: round2(totalCosts), totalFCF: round2(totalFCF),
          avgGrossMargin: round4(avgGrossMargin), avgEbitdaMargin: round4(avgEbitdaMargin), avgFcfMargin: round4(avgFcfMargin), roic: round4(roic) },
        sensitivity: { base: { npv: round2(sensitivity.base.npv), irr: round4(sensitivity.base.irr) },
          bull: { npv: round2(sensitivity.bull.npv), irr: round4(sensitivity.bull.irr) },
          bear: { npv: round2(sensitivity.bear.npv), irr: round4(sensitivity.bear.irr) } },
      };

      // Persist model to a local store so UX and follow-up skills can retrieve it.
      let store = { models: [], lastUpdated: new Date().toISOString() };
      try { store = ctx.store.load('models', null) || store; } catch (e) {}
      const entry = { id: 'fm_' + Buffer.from(String(new Date().getTime())).toString('base64').slice(0, 12), createdAt: new Date().toISOString(), inputs: input, model };
      store.models.push(entry);
      try { ctx.store.save('models', store); } catch (e) {}

      // Build a human-readable summary derived from the computed model (honest, deterministic)
      const lines = [];
      lines.push('Financial Model (derived from supplied inputs):');
      lines.push('NPV: ' + model.summary.npv + ' | IRR: ' + model.summary.irr + ' | Payback (yrs): ' + (model.summary.paybackPeriod || 'N/A'));
      lines.push('Total Revenue (proj): ' + model.summary.totalRevenue + ' | Total FCF (proj): ' + model.summary.totalFCF);
      lines.push('Average gross margin: ' + model.summary.avgGrossMargin + ' | Average EBITDA margin: ' + model.summary.avgEbitdaMargin);
      lines.push('Sensitivity (NPV): base=' + model.sensitivity.base.npv + ', bull=' + model.sensitivity.bull.npv + ', bear=' + model.sensitivity.bear.npv);
      lines.push('\nNote: All values are computed locally from the provided inputs; this is not third-party market data.');

      const present = [{ id: 'finance-modeling-analysis', title: 'Financial Model Summary', kind: 'text', body: lines.join('\n') }];
    }
  });

financeModelingAnalysisSkill.triggers = [
  { kind: 'schedule', cadence: 'periodic model refresh' },
];

export { financeModelingAnalysisSkill };
