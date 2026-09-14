import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const financialModelInputSchema = createSchemaRecord({
  revenue: SchemaProps.number({ description: 'Starting annual revenue', minimum: 0 }),
  costs: SchemaProps.number({ description: 'Starting annual costs', minimum: 0 }),
  periods: SchemaProps.integer({ description: 'Number of projection periods (years)', minimum: 1, maximum: 20, default: 5 }),
  growthRate: SchemaProps.number({ description: 'Annual revenue growth rate (%)', default: 5 }),
  costGrowthRate: SchemaProps.number({ description: 'Annual cost growth rate (%)', default: 3 }),
  taxRate: SchemaProps.number({ description: 'Corporate tax rate (%)', minimum: 0, maximum: 100, default: 21 }),
  discountRate: SchemaProps.number({ description: 'Discount rate for NPV (%)', minimum: 0, maximum: 50, default: 10 }),
  capexSchedule: SchemaProps.objectArray(SchemaProps.number({ description: 'Capital expenditure per period' }), { description: 'Array of capex per period (optional)', default: [] }),
  workingCapitalPct: SchemaProps.number({ description: 'Working capital as % of revenue change', minimum: 0, maximum: 50, default: 10 }),
}, { required: ['revenue', 'costs'] });

const financialModelOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
  model: SchemaProps.object({
    properties: {
      projections: SchemaProps.objectArray(SchemaProps.object({
        period: SchemaProps.integer(),
        revenue: SchemaProps.number(),
        costs: SchemaProps.number(),
        grossProfit: SchemaProps.number(),
        grossMargin: SchemaProps.number(),
        ebitda: SchemaProps.number(),
        ebitdaMargin: SchemaProps.number(),
        depreciation: SchemaProps.number(),
        ebit: SchemaProps.number(),
        nopat: SchemaProps.number(),
        capex: SchemaProps.number(),
        workingCapitalChange: SchemaProps.number(),
        freeCashFlow: SchemaProps.number(),
        cumulativeFCF: SchemaProps.number(),
      })),
      summary: SchemaProps.object({
        npv: SchemaProps.number(),
        irr: SchemaProps.number(),
        paybackPeriod: SchemaProps.number(),
        totalRevenue: SchemaProps.number(),
        totalCosts: SchemaProps.number(),
        totalFCF: SchemaProps.number(),
        avgGrossMargin: SchemaProps.number(),
        avgEbitdaMargin: SchemaProps.number(),
        avgFcfMargin: SchemaProps.number(),
        roic: SchemaProps.number(),
      }),
      sensitivity: SchemaProps.object({
        base: SchemaProps.object({ npv: SchemaProps.number(), irr: SchemaProps.number() }),
        bull: SchemaProps.object({ npv: SchemaProps.number(), irr: SchemaProps.number() }),
        bear: SchemaProps.object({ npv: SchemaProps.number(), irr: SchemaProps.number() }),
      }),
    },
  }),
});

const analyzeInvestmentInputSchema = createSchemaRecord({
  asset: SchemaProps.text({ description: 'Asset or investment identifier' }),
  amount: SchemaProps.number({ description: 'Investment amount', minimum: 0 }),
  horizon: SchemaProps.integer({ description: 'Investment horizon in years', minimum: 1, maximum: 30, default: 10 }),
  expectedReturn: SchemaProps.number({ description: 'Expected annual return (%)', default: 8 }),
  volatility: SchemaProps.number({ description: 'Annual volatility (%)', minimum: 0, maximum: 100, default: 15 }),
  riskFreeRate: SchemaProps.number({ description: 'Risk-free rate (%)', minimum: 0, maximum: 20, default: 4 }),
  correlation: SchemaProps.number({ description: 'Correlation with market (for CAPM)', minimum: -1, maximum: 1, default: 0 }),
  cashFlows: SchemaProps.objectArray(SchemaProps.number({ description: 'Expected cash flows per year' }), { description: 'Optional array of annual cash flows', default: [] }),
}, { required: ['asset', 'amount'] });

const analyzeInvestmentOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
  analysis: SchemaProps.object({
    properties: {
      expectedReturn: SchemaProps.object({
        simple: SchemaProps.number(),
        capm: SchemaProps.number(),
        compounded: SchemaProps.object({
          base: SchemaProps.number(),
          bull: SchemaProps.number(),
          bear: SchemaProps.number(),
        }),
      }),
      riskMetrics: SchemaProps.object({
        var95: SchemaProps.number(),
        var99: SchemaProps.number(),
        sharpeRatio: SchemaProps.number(),
        sortinoRatio: SchemaProps.number(),
        maxDrawdown: SchemaProps.number(),
        downsideDeviation: SchemaProps.number(),
      }),
      monteCarlo: SchemaProps.object({
        percentiles: SchemaProps.object({
          p5: SchemaProps.number(),
          p25: SchemaProps.number(),
          p50: SchemaProps.number(),
          p75: SchemaProps.number(),
          p95: SchemaProps.number(),
        }),
        probabilityOfLoss: SchemaProps.number(),
        expectedShortfall: SchemaProps.number(),
      }),
      scenarios: SchemaProps.object({
        base: SchemaProps.object({ finalValue: SchemaProps.number(), totalReturn: SchemaProps.number(), cagr: SchemaProps.number() }),
        bull: SchemaProps.object({ finalValue: SchemaProps.number(), totalReturn: SchemaProps.number(), cagr: SchemaProps.number() }),
        bear: SchemaProps.object({ finalValue: SchemaProps.number(), totalReturn: SchemaProps.number(), cagr: SchemaProps.number() }),
      }),
      riskClassification: SchemaProps.text(),
      benchmarkComparison: SchemaProps.object({
        excessReturn: SchemaProps.number(),
        informationRatio: SchemaProps.number(),
      }),
    },
  }),
});

const financialModelSkill = createCodeSkill({
  id: 'financial-model',
  name: 'Financial Model',
  description: 'Build a comprehensive financial model with revenue projections, FCFF, NPV, IRR, and sensitivity analysis.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};

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
    period: i,
    revenue: round2(rev),
    costs: round2(cst),
    grossProfit: round2(grossProfit),
    grossMargin: round4(grossMargin),
    ebitda: round2(ebitda),
    ebitdaMargin: round4(ebitdaMargin),
    depreciation: round2(depreciation),
    ebit: round2(ebit),
    nopat: round2(nopat),
    capex: round2(capex),
    workingCapitalChange: round2(workingCapitalChange),
    freeCashFlow: round2(freeCashFlow),
    cumulativeFCF: round2(cumulativeFCF),
  });

  prevRevenue = rev;
}

function npv(cashFlows, rate) {
  return cashFlows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i + 1), 0);
}

function irr(cashFlows, guess = 0.1) {
  let rate = guess;
  for (let iter = 0; iter < 100; iter++) {
    let npvVal = 0;
    let dnpv = 0;
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

let paybackPeriod = null;
let cum = 0;
for (let i = 0; i < fcfSeries.length; i++) {
  cum += fcfSeries[i];
  if (cum >= 0) {
    paybackPeriod = i + 1;
    break;
  }
}

const totalRevenue = projections.reduce((s, p) => s + p.revenue, 0);
const totalCosts = projections.reduce((s, p) => s + p.costs, 0);
const totalFCF = projections.reduce((s, p) => s + p.freeCashFlow, 0);
const avgGrossMargin = projections.reduce((s, p) => s + p.grossMargin, 0) / periods;
const avgEbitdaMargin = projections.reduce((s, p) => s + p.ebitdaMargin, 0) / periods;
const avgFcfMargin = totalRevenue > 0 ? totalFCF / totalRevenue : 0;

const investedCapital = projections.reduce((s, p) => s + p.capex, 0) + projections[0].revenue * workingCapitalPct;
const roic = investedCapital > 0 ? projections[projections.length - 1].nopat / investedCapital : 0;

function runScenario(growthAdj, costAdj) {
  let cumFCF = 0;
  let prevRev = revenue;
  for (let i = 1; i <= periods; i++) {
    const rev = revenue * Math.pow(1 + growthRate + growthAdj, i);
    const cst = costs * Math.pow(1 + costGrowthRate + costAdj, i);
    const ebitda = rev - cst;
    const dep = capexSchedule[i - 1] || (rev * 0.05);
    const ebit = ebitda - dep;
    const nopat = ebit * (1 - taxRate);
    const capex = capexSchedule[i - 1] || 0;
    const wcChange = (rev - prevRev) * workingCapitalPct;
    const fcf = nopat + dep - capex - wcChange;
    cumFCF += fcf;
    prevRev = rev;
  }
  return { npv: npv(fcfSeries.map((_, i) => {
    const rev = revenue * Math.pow(1 + growthRate + growthAdj, i + 1);
    const cst = costs * Math.pow(1 + costGrowthRate + costAdj, i + 1);
    const ebitda = rev - cst;
    const dep = capexSchedule[i] || (rev * 0.05);
    const ebit = ebitda - dep;
    const nopat = ebit * (1 - taxRate);
    const capex = capexSchedule[i] || 0;
    const wcChange = (rev - (i === 0 ? revenue : revenue * Math.pow(1 + growthRate + growthAdj, i))) * workingCapitalPct;
    return nopat + dep - capex - wcChange;
  }), discountRate), irr: irr(fcfSeries.map((_, i) => {
    const rev = revenue * Math.pow(1 + growthRate + growthAdj, i + 1);
    const cst = costs * Math.pow(1 + costGrowthRate + costAdj, i + 1);
    const ebitda = rev - cst;
    const dep = capexSchedule[i] || (rev * 0.05);
    const ebit = ebitda - dep;
    const nopat = ebit * (1 - taxRate);
    const capex = capexSchedule[i] || 0;
    const wcChange = (rev - (i === 0 ? revenue : revenue * Math.pow(1 + growthRate + growthAdj, i))) * workingCapitalPct;
    return nopat + dep - capex - wcChange;
  })) };
}

const sensitivity = {
  base: runScenario(0, 0),
  bull: runScenario(0.02, -0.01),
  bear: runScenario(-0.02, 0.01),
};

const model = {
  projections,
  summary: {
    npv: round2(npvVal),
    irr: round4(irrVal),
    paybackPeriod: paybackPeriod ? round2(paybackPeriod) : null,
    totalRevenue: round2(totalRevenue),
    totalCosts: round2(totalCosts),
    totalFCF: round2(totalFCF),
    avgGrossMargin: round4(avgGrossMargin),
    avgEbitdaMargin: round4(avgEbitdaMargin),
    avgFcfMargin: round4(avgFcfMargin),
    roic: round4(roic),
  },
  sensitivity: {
    base: { npv: round2(sensitivity.base.npv), irr: round4(sensitivity.base.irr) },
    bull: { npv: round2(sensitivity.bull.npv), irr: round4(sensitivity.bull.irr) },
    bear: { npv: round2(sensitivity.bear.npv), irr: round4(sensitivity.bear.irr) },
  },
};

console.log(JSON.stringify({ success: true, model }));
`,
  },
  inputSchema: financialModelInputSchema,
  outputSchema: financialModelOutputSchema,
});

const analyzeInvestmentSkill = createCodeSkill({
  id: 'analyze-investment',
  name: 'Analyze Investment',
  description: 'Analyze an investment with risk metrics, VaR, Sharpe/Sortino ratios, Monte Carlo percentiles, and scenario analysis.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

const asset = input.asset || '';
const amount = input.amount || 0;
const horizon = Math.max(1, Math.min(30, Math.floor(input.horizon || 10)));
const expectedReturn = (input.expectedReturn || 8) / 100;
const volatility = (input.volatility || 15) / 100;
const riskFreeRate = (input.riskFreeRate || 4) / 100;
const correlation = input.correlation !== undefined ? input.correlation : 0;
const cashFlows = Array.isArray(input.cashFlows) ? input.cashFlows : [];

const capmReturn = riskFreeRate + correlation * (expectedReturn - riskFreeRate);
const effectiveReturn = correlation !== 0 ? capmReturn : expectedReturn;

const scenarios = {
  base: { return: effectiveReturn, vol: volatility },
  bull: { return: effectiveReturn + 0.03, vol: volatility * 0.8 },
  bear: { return: effectiveReturn - 0.04, vol: volatility * 1.3 },
};

const scenarioResults = {};
for (const [key, sc] of Object.entries(scenarios)) {
  let value = amount;
  const annualReturns = [];
  for (let y = 1; y <= horizon; y++) {
    const yearlyReturn = sc.return;
    value *= (1 + yearlyReturn);
    annualReturns.push(yearlyReturn);
  }
  const totalReturn = (value / amount - 1) * 100;
  const cagr = (Math.pow(value / amount, 1 / horizon) - 1) * 100;
  scenarioResults[key] = {
    finalValue: round2(value),
    totalReturn: round2(totalReturn),
    cagr: round2(cagr),
  };
}

const excessReturn = effectiveReturn - riskFreeRate;
const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;

const downsideReturns = [-volatility * 0.5, -volatility * 0.3, -volatility * 0.1, 0];
const downsideDeviation = Math.sqrt(downsideReturns.reduce((s, r) => s + Math.pow(Math.min(0, r - riskFreeRate), 2), 0) / downsideReturns.length);
const sortinoRatio = downsideDeviation > 0 ? excessReturn / downsideDeviation : 0;

const var95 = amount * (1 - Math.exp(-1.645 * volatility + effectiveReturn));
const var99 = amount * (1 - Math.exp(-2.326 * volatility + effectiveReturn));

const maxDrawdown = 1 - Math.exp(-2 * volatility * Math.sqrt(horizon));
const maxDrawdownPct = maxDrawdown * 100;

const mcPaths = 10000;
const finalValues = [];
for (let p = 0; p < mcPaths; p++) {
  let val = amount;
  for (let y = 0; y < horizon; y++) {
    const z = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
    const annualRet = effectiveReturn + z * volatility;
    val *= (1 + annualRet);
  }
  finalValues.push(val);
}
finalValues.sort((a, b) => a - b);
const p5 = finalValues[Math.floor(mcPaths * 0.05)];
const p25 = finalValues[Math.floor(mcPaths * 0.25)];
const p50 = finalValues[Math.floor(mcPaths * 0.50)];
const p75 = finalValues[Math.floor(mcPaths * 0.75)];
const p95 = finalValues[Math.floor(mcPaths * 0.95)];
const probLoss = finalValues.filter(v => v < amount).length / mcPaths;
const tailLosses = finalValues.filter(v => v < p5);
const expectedShortfall = tailLosses.length > 0 ? tailLosses.reduce((s, v) => s + v, 0) / tailLosses.length : p5;

let riskClass = 'Low';
if (volatility > 0.25 || maxDrawdownPct > 40) riskClass = 'Very High';
else if (volatility > 0.20 || maxDrawdownPct > 30) riskClass = 'High';
else if (volatility > 0.15 || maxDrawdownPct > 20) riskClass = 'Moderate';

const benchmarkReturn = 0.07;
const informationRatio = volatility > 0 ? (effectiveReturn - benchmarkReturn) / volatility : 0;

const analysis = {
  expectedReturn: {
    simple: round4(effectiveReturn * 100),
    capm: round4(capmReturn * 100),
    compounded: {
      base: round2(scenarioResults.base.cagr),
      bull: round2(scenarioResults.bull.cagr),
      bear: round2(scenarioResults.bear.cagr),
    },
  },
  riskMetrics: {
    var95: round2(var95),
    var99: round2(var99),
    sharpeRatio: round4(sharpeRatio),
    sortinoRatio: round4(sortinoRatio),
    maxDrawdown: round2(maxDrawdownPct),
    downsideDeviation: round4(downsideDeviation * 100),
  },
  monteCarlo: {
    percentiles: {
      p5: round2(p5),
      p25: round2(p25),
      p50: round2(p50),
      p75: round2(p75),
      p95: round2(p95),
    },
    probabilityOfLoss: round4(probLoss),
    expectedShortfall: round2(expectedShortfall),
  },
  scenarios: {
    base: scenarioResults.base,
    bull: scenarioResults.bull,
    bear: scenarioResults.bear,
  },
  riskClassification: riskClass,
  benchmarkComparison: {
    excessReturn: round4((effectiveReturn - benchmarkReturn) * 100),
    informationRatio: round4(informationRatio),
  },
};

console.log(JSON.stringify({ success: true, analysis }));
`,
  },
  inputSchema: analyzeInvestmentInputSchema,
  outputSchema: analyzeInvestmentOutputSchema,
});

export const financeSkills = [financialModelSkill, analyzeInvestmentSkill];
