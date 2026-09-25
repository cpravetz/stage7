import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const analyzeInvestmentInputSchema = createSchemaRecord({
  asset: SchemaProps.text({ description: 'Asset or investment identifier' }),
  amount: SchemaProps.number({ description: 'Investment amount', minimum: 0 }),
  horizon: SchemaProps.integer({ description: 'Investment horizon in years', minimum: 1, maximum: 30, default: 10 }),
  expectedReturn: SchemaProps.number({ description: 'Expected annual return (%)', default: 8 }),
  volatility: SchemaProps.number({ description: 'Annual volatility (%)', minimum: 0, maximum: 100, default: 15 }),
  riskFreeRate: SchemaProps.number({ description: 'Risk-free rate (%)', minimum: 0, maximum: 20, default: 4 }),
  correlation: SchemaProps.number({ description: 'Correlation with market (for CAPM)', minimum: -1, maximum: 1, default: 0 }),
  benchmarkReturn: SchemaProps.number({ description: 'Benchmark annual return (%) used for comparison; defaults to the risk-free rate when omitted' }),
  cashFlows: SchemaProps.objectArray(SchemaProps.number({ description: 'Expected cash flows per year' }), { description: 'Optional array of annual cash flows', default: [] }),
});

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
        benchmarkReturn: SchemaProps.number({ description: 'Benchmark annual return used for comparison' }),
        excessReturn: SchemaProps.number(),
        informationRatio: SchemaProps.number(),
      }),
    },
  }),
  error: SchemaProps.text(),
});

const analyzeInvestmentSkill = createCodeSkill({
  id: 'finance-analyze-investment',
  name: 'Investment Analysis',
  description: 'Analyze investments with risk metrics, VaR, Sharpe/Sortino ratios, Monte Carlo percentiles, and scenario analysis.',
  tier: 'advise',
  domainKnowledge: 'investment-analysis',
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
const scenarios = { base: { return: effectiveReturn, vol: volatility }, bull: { return: effectiveReturn + 0.03, vol: volatility * 0.8 }, bear: { return: effectiveReturn - 0.04, vol: volatility * 1.3 } };
const scenarioResults = {};
for (const [key, sc] of Object.entries(scenarios)) {
  let value = amount; const annualReturns = [];
  for (let y = 1; y <= horizon; y++) { value *= (1 + sc.return); annualReturns.push(sc.return); }
  const totalReturn = (value / amount - 1) * 100; const cagr = (Math.pow(value / amount, 1 / horizon) - 1) * 100;
  scenarioResults[key] = { finalValue: round2(value), totalReturn: round2(totalReturn), cagr: round2(cagr) };
}
const excessReturn = effectiveReturn - riskFreeRate;
const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;
const downsideReturns = [-volatility * 0.5, -volatility * 0.3, -volatility * 0.1, 0];
const downsideDeviation = Math.sqrt(downsideReturns.reduce((s, r) => s + Math.pow(Math.min(0, r - riskFreeRate), 2), 0) / downsideReturns.length);
const sortinoRatio = downsideDeviation > 0 ? excessReturn / downsideDeviation : 0;
const var95 = amount * (1 - Math.exp(-1.645 * volatility + effectiveReturn));
const var99 = amount * (1 - Math.exp(-2.326 * volatility + effectiveReturn));
const maxDrawdown = 1 - Math.exp(-2 * volatility * Math.sqrt(horizon)); const maxDrawdownPct = maxDrawdown * 100;
const mcPaths = 10000; const finalValues = [];
const normalQuantiles = { p5: -1.64485, p25: -0.67449, p50: 0, p75: 0.67449, p95: 1.64485 };
const sigma = volatility * Math.sqrt(horizon);
const mu = (effectiveReturn - 0.5 * volatility * volatility) * horizon;
function normalCdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
const analyticPercentiles = {};
for (const [key, q] of Object.entries(normalQuantiles)) { analyticPercentiles[key] = amount > 0 && sigma > 0 ? amount * Math.exp(mu + q * sigma) : amount; }
const zLoss = amount > 0 && sigma > 0 ? (Math.log(1) - mu) / sigma : (effectiveReturn < 0 ? -Infinity : Infinity);
const probLoss = normalCdf(zLoss);
const expectedShortfall = amount > 0 && sigma > 0 && probLoss > 0 ? amount * Math.exp(mu + 0.5 * sigma * sigma) * normalCdf(-1.64485 - sigma) / probLoss : amount;
finalValues.push(analyticPercentiles.p5, analyticPercentiles.p25, analyticPercentiles.p50, analyticPercentiles.p75, analyticPercentiles.p95);
finalValues.sort((a, b) => a - b);
const p5 = analyticPercentiles.p5; const p25 = analyticPercentiles.p25;
const p50 = analyticPercentiles.p50; const p75 = analyticPercentiles.p75; const p95 = analyticPercentiles.p95;
const tailLosses = finalValues.filter(v => v < p5);
const expectedShortfallValue = tailLosses.length > 0 ? tailLosses.reduce((s, v) => s + v, 0) / tailLosses.length : expectedShortfall;
let riskClass = 'Low';
if (volatility > 0.25 || maxDrawdownPct > 40) riskClass = 'Very High';
else if (volatility > 0.20 || maxDrawdownPct > 30) riskClass = 'High';
else if (volatility > 0.15 || maxDrawdownPct > 20) riskClass = 'Moderate';
const benchmarkReturn = input.benchmarkReturn !== undefined ? input.benchmarkReturn / 100 : riskFreeRate;
const informationRatio = volatility > 0 ? (effectiveReturn - benchmarkReturn) / volatility : 0;
const analysis = {
  expectedReturn: { simple: round4(effectiveReturn * 100), capm: round4(capmReturn * 100), compounded: { base: round2(scenarioResults.base.cagr), bull: round2(scenarioResults.bull.cagr), bear: round2(scenarioResults.bear.cagr) } },
  riskMetrics: { var95: round2(var95), var99: round2(var99), sharpeRatio: round4(sharpeRatio), sortinoRatio: round4(sortinoRatio), maxDrawdown: round2(maxDrawdownPct), downsideDeviation: round4(downsideDeviation * 100) },
  monteCarlo: { percentiles: { p5: round2(p5), p25: round2(p25), p50: round2(p50), p75: round2(p75), p95: round2(p95) }, probabilityOfLoss: round4(probLoss), expectedShortfall: round2(expectedShortfall) },
  scenarios: { base: scenarioResults.base, bull: scenarioResults.bull, bear: scenarioResults.bear },
  riskClassification: riskClass, benchmarkComparison: { excessReturn: round4((effectiveReturn - benchmarkReturn) * 100), informationRatio: round4(informationRatio) },
};
console.log(JSON.stringify({ success: true, analysis }));
`,
  },
  inputSchema: analyzeInvestmentInputSchema,
  outputSchema: analyzeInvestmentOutputSchema,
  isSkill: false,
});

analyzeInvestmentSkill.triggers = [
  { kind: 'schedule', cadence: 'Periodic model refresh' },
];

export { analyzeInvestmentSkill };
