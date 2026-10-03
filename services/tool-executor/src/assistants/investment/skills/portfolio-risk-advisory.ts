// @ts-nocheck
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { SchemaRecord } from '../../../types';
import { investmentResultSchema } from '../investment-contract';

const portfolioAdvisoryInputSchema: SchemaRecord = createSchemaRecord({
  action: SchemaProps.select(['analyze-portfolio', 'optimize', 'risk-assessment', 'evaluate', 'rebalance', 'factor-exposure', 'scenario-analysis', 'stress-test', 'efficient-frontier', 'risk-budgeting'], { description: 'Action to perform' }),
  holdings: SchemaProps.objectArray(SchemaProps.object({ symbol: SchemaProps.text({ description: 'Asset symbol' }), quantity: SchemaProps.number({ description: 'Holding quantity', minimum: 0 }), value: SchemaProps.number({ description: 'Current holding value', minimum: 0 }), amount: SchemaProps.number({ description: 'Current holding value alias', minimum: 0 }), assetClass: SchemaProps.text({ description: 'Asset class' }), expectedReturn: SchemaProps.number({ description: 'Expected return as a decimal' }) }, { description: 'Portfolio holding' }), { description: 'Portfolio holdings used for analysis' }),
  portfolio: SchemaProps.object({ holdings: SchemaProps.objectArray(SchemaProps.object({ symbol: SchemaProps.text({ description: 'Asset symbol' }), value: SchemaProps.number({ description: 'Current value', minimum: 0 }) }, { description: 'Portfolio holding' }), { description: 'Portfolio holdings' }) }, { description: 'Portfolio object used for risk assessment' }),
  riskTolerance: SchemaProps.select(['Conservative', 'Moderate', 'Aggressive', 'Very Aggressive'], { description: 'Risk tolerance level' }),
  expectedReturns: SchemaProps.object({}, { description: 'Expected returns for assets, keyed by symbol' }),
  covarianceMatrix: SchemaProps.object({}, { description: 'Covariance matrix for assets' }),
  objective: SchemaProps.select(['max-sharpe', 'min-variance', 'max-return', 'risk-budget', 'custom'], { description: 'Optimization objective' }),
  constraints: SchemaProps.object({}, { description: 'Portfolio constraints such as longOnly, maxWeight, and sectorCaps' }),
  views: SchemaProps.object({}, { description: 'Market views for Black-Litterman' }),
  confidence: SchemaProps.object({}, { description: 'Confidence in views' }),
  benchmark: SchemaProps.text({ description: 'Benchmark symbol' }),
  scenarios: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({ description: 'Scenario name' }), impact: SchemaProps.number({ description: 'Scenario impact as a decimal' }) }, { description: 'Stress-test scenario' }), { description: 'Scenarios for stress testing' }),
  confidenceLevel: SchemaProps.number({ description: 'Confidence level for VaR (for example, 0.95)', minimum: 0, maximum: 1 }),
  holdingPeriod: SchemaProps.number({ description: 'Holding period in days', minimum: 0 }),
  volatility: SchemaProps.number({ description: 'Portfolio volatility as a decimal', minimum: 0 }),
  riskFreeRate: SchemaProps.number({ description: 'Risk-free rate as a decimal' }),
  currency: SchemaProps.text({ description: 'Base currency' }),
  methods: SchemaProps.stringArray({ description: 'Risk methods to apply' }),
  symbols: SchemaProps.stringArray({ description: 'Symbols to evaluate' }),
  criteria: SchemaProps.object({}, { description: 'Evaluation criteria keyed by symbol' }),
  weights: SchemaProps.object({}, { description: 'Criteria weights keyed by criterion name' }),
  peerGroup: SchemaProps.text({ description: 'Peer group for comparison' })
}, { required: ['action'] });

const PORTFOLIO_RISK_ADVISORY = createDeclarativeCodeSkill({
  id: 'portfolio-risk-advisory',
  name: 'Portfolio & Risk Advisory',
  description: 'Comprehensive portfolio analysis, optimization, risk assessment (VaR, stress testing), and investment evaluation using quantitative models and factor analysis.',
  persistenceEnvVar: 'INVESTMENT_HOME',
  tier: 'advise',
  domainKnowledge: 'Portfolio construction, value-at-risk and stress testing, factor analysis, and quantitative allocation methods',
  inputSchema: portfolioAdvisoryInputSchema,
  outputSchema: investmentResultSchema('Portfolio analysis results including allocation, returns, VaR, and evaluation scores'),
  triggers: [
    { kind: 'event', on: 'market data update' },
    { kind: 'user', phrase_examples: ["Analyze my portfolio", "Optimize allocation", "Assess portfolio risk", "Run stress test", "Evaluate securities", "Check efficient frontier"] }
  ],
  isSkill: true,
  manifest: {
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';

      const store = ctx.store.load('portfolio-advisory', []);

      function fmtPct(v) { return v == null ? 'N/A' : (v * 100).toFixed(1) + '%'; }
      function fmtMoney(v) { return v == null ? 'N/A' : '$' + Number(v).toFixed(2); }
      function fmtNum(v, d) { return v == null ? 'N/A' : Number(v).toFixed(d || 2); }
      function roundMoney(value) { return Math.round((Number(value) || 0) * 100) / 100; }

      function formatAllocation(result) {
        const L = [];
        L.push('Total value: ' + fmtMoney(result.totalValue));
        L.push('Risk tolerance: ' + result.riskTolerance);
        if (result.expectedReturn !== null) L.push('Expected return: ' + fmtPct(result.expectedReturn));
        L.push('Sharpe ratio: ' + fmtNum(result.sharpeRatio));
        L.push('Max drawdown: ' + fmtNum(result.maxDrawdown));
        const allocKeys = Object.keys(result.allocation || {});
        if (allocKeys.length) {
          L.push('');
          L.push('Allocation by asset class:');
          allocKeys.forEach(function (k) { L.push('  ' + k + ': ' + fmtPct(result.allocation[k])); });
        }
        L.push('');
        L.push('Holdings: ' + (result.holdings ? result.holdings.length : 0) + ' positive-value holdings.');
        return L;
      }

      function formatWeights(result) {
        const L = [];
        L.push('Objective: ' + result.objective);
        const weightKeys = Object.keys(result.weights || {});
        if (weightKeys.length) {
          L.push('Allocation (starting):');
          weightKeys.forEach(function (k) { L.push('  ' + k + ': ' + fmtPct(result.weights[k])); });
        }
        L.push('Expected return: ' + fmtPct(result.expectedReturn));
        L.push('Volatility: ' + fmtPct(result.volatility));
        L.push('Sharpe ratio: ' + fmtNum(result.sharpeRatio));
        const constraintKeys = Object.keys(result.constraints || {});
        if (constraintKeys.length) {
          L.push('Constraints applied:');
          constraintKeys.forEach(function (k) {
            var v = result.constraints[k];
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              L.push('  ' + k + ': ' + v);
            } else if (v && typeof v === 'object') {
              L.push('  ' + k + ': ' + Object.keys(v).map(function (sk) { return sk + '=' + v[sk]; }).join(', '));
            }
          });
        }
        return L;
      }

      function formatRisk(result) {
        const L = [];
        L.push('Portfolio value: ' + fmtMoney(result.portfolioValue));
        L.push('Confidence level: ' + fmtPct(result.confidenceLevel));
        L.push('Holding period: ' + (result.holdingPeriod ? result.holdingPeriod + ' days' : 'N/A'));
        const varKeys = Object.keys(result.results || {});
        if (varKeys.length) {
          L.push('');
          L.push('Risk metrics:');
          varKeys.forEach(function (k) {
            const metric = result.results[k];
            if (metric && typeof metric === 'object' && 'varAmount' in metric) {
              L.push('  ' + k + ': VaR = ' + fmtMoney(metric.varAmount));
            } else if (metric && typeof metric === 'object') {
              L.push('  ' + k + ': ' + Object.keys(metric).map(function (mk) { return mk + '=' + metric[mk]; }).join(', '));
            } else {
            }
          });
        }
        const weightEntries = Array.isArray(result.weights) ? result.weights : Object.values(result.weights || {});
        if (weightEntries.length) {
          L.push('');
          L.push('Weights:');
          weightEntries.slice(0, 5).forEach(function (w) { L.push('  ' + (w.symbol || 'unknown') + ': ' + fmtPct(w.weight)); });
          if (weightEntries.length > 5) L.push('  ... and ' + (weightEntries.length - 5) + ' more.');
        }
        return L;
      }

      function formatEvaluation(result) {
        const L = [];
        const criteriaKeys = Object.keys(result.criteria || {});
        const weightKeys = Object.keys(result.weights || {});
        L.push('Evaluated ' + (result.scores ? result.scores.length : 0) + ' investments.');
        if (criteriaKeys.length) L.push('Criteria: ' + criteriaKeys.join(', '));
        if (weightKeys.length) L.push('Weights: ' + weightKeys.map(function (k) { return k + ' = ' + result.weights[k]; }).join(', '));
        const ranked = result.ranked || [];
        if (ranked.length) {
          L.push('');
          L.push('Ranking (best first):');
          ranked.forEach(function (item) { L.push('  ' + item.symbol + ': ' + fmtNum(item.score, 4)); });
        }
        return L;
      }

      function formatNotice(result) {
        const L = [];
        if (result.notice) L.push(result.notice);
        L.push('Source: ' + result.source);
        return L;
      }

      async function analyzePortfolio(holdings, riskTolerance) {
        const validHoldings = Array.isArray(holdings) ? holdings.filter(h => h && Number(h.value ?? h.amount) > 0) : [];
        const totalValue = validHoldings.reduce((sum, h) => sum + Number(h.value ?? h.amount), 0);
        const allocation = {};
        validHoldings.forEach(h => {
          const assetClass = h.assetClass || h.class || 'Unspecified';
          allocation[assetClass] = (allocation[assetClass] || 0) + Number(h.value ?? h.amount);
        });
        Object.keys(allocation).forEach(key => { allocation[key] = totalValue > 0 ? allocation[key] / totalValue : 0; });
        const suppliedReturns = validHoldings.filter(h => Number.isFinite(Number(h.expectedReturn)));
        const expectedReturn = totalValue > 0 && suppliedReturns.length ? suppliedReturns.reduce((sum, h) => sum + Number(h.expectedReturn) * Number(h.value ?? h.amount), 0) / totalValue : null;
        const risk = riskTolerance || 'unspecified';
        return {
          totalValue,
          allocation,
          risk,
          expectedReturn,
          sharpeRatio: null,
          maxDrawdown: null,
          holdings: validHoldings,
          riskTolerance: risk,
          source: 'local-input',
          notice: validHoldings.length ? 'Metrics are calculated only from supplied holdings; Sharpe ratio and drawdown require supplied return history.' : 'No positive-value holdings were supplied; no allocation or portfolio metrics were calculated.'
        };
      }

      async function optimizePortfolio(params) {
        const { expectedReturns, covarianceMatrix, objective = 'max-sharpe', constraints = {} } = params;
        const assets = Object.keys(expectedReturns || {});
        const weights = {};
        assets.forEach(a => { weights[a] = assets.length ? 1 / assets.length : 0; });
        const suppliedReturns = assets.map(a => Number(expectedReturns[a]));
        const expectedReturn = suppliedReturns.length && suppliedReturns.every(Number.isFinite) ? suppliedReturns.reduce((sum, value) => sum + value, 0) / suppliedReturns.length : null;
        const diagonal = covarianceMatrix && typeof covarianceMatrix === 'object' ? assets.map(a => Number((covarianceMatrix[a] && covarianceMatrix[a][a]) ?? (covarianceMatrix[a] && covarianceMatrix[a][a + ':' + a]))) : [];
        const volatility = diagonal.length && diagonal.every(Number.isFinite) ? Math.sqrt(diagonal.reduce((sum, value) => sum + value, 0) / diagonal.length) : null;
        const riskFreeRate = Number(params.riskFreeRate ?? 0);
        const sharpeRatio = expectedReturn !== null && volatility !== null && volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : null;
        return {
          weights,
          expectedReturn,
          volatility,
          sharpeRatio,
          objective,
          constraints,
          source: 'supplied-input',
          notice: assets.length ? 'Equal-weight starting allocation derived from supplied expected returns; no optimization service is connected.' : 'No expected returns were supplied; no allocation or performance metrics were calculated.'
        };
      }

      async function assessRisk(params) {
        const portfolio = params.portfolio || params.holdings || [];
        let holdings = portfolio;
        if (portfolio && typeof portfolio === 'object' && !Array.isArray(portfolio) && Array.isArray(portfolio.holdings)) {
          holdings = portfolio.holdings;
        }
        const values = holdings.map(p => Number(p.value ?? p.amount ?? 0)).filter(value => Number.isFinite(value) && value > 0);
        const portfolioValue = values.reduce((sum, value) => sum + value, 0) || null;
        const weights = portfolioValue ? holdings.map(p => ({ symbol: p.symbol || p.asset || 'unknown', weight: (Number(p.value ?? p.amount ?? 0) / portfolioValue) })) : [];
        const volatility = Number(params.volatility);
        const holdingPeriod = Number.isFinite(Number(params.holdingPeriod)) ? Number(params.holdingPeriod) : null;
        const confidenceLevel = Number.isFinite(Number(params.confidenceLevel)) ? Number(params.confidenceLevel) : null;
        const results = {};
        const hasVolatility = Number.isFinite(volatility) && volatility >= 0 && portfolioValue;
        if (params.methods?.includes('var-parametric') && hasVolatility && holdingPeriod !== null && confidenceLevel !== null) {
          const z = confidenceLevel >= 0.99 ? 2.326 : confidenceLevel >= 0.95 ? 1.645 : 1.282;
          results['var-parametric'] = { varAmount: roundMoney(portfolioValue * volatility * z * Math.sqrt(holdingPeriod / 252)), confidenceLevel, holdingPeriod, method: 'Supplied-volatility parametric estimate' };
        }
        if (params.methods?.includes('stress-test')) {
          const scenarios = Array.isArray(params.scenarios) ? params.scenarios : [];
          results['stress-test'] = scenarios.map(s => ({ name: s.name || 'supplied-scenario', impact: Number.isFinite(Number(s.impact)) ? Number(s.impact) : null }));
        }
        return {
          portfolioValue,
          weights,
          confidenceLevel: Number.isFinite(confidenceLevel) ? confidenceLevel : null,
          holdingPeriod: Number.isFinite(holdingPeriod) ? holdingPeriod : null,
          results,
          source: 'supplied-input',
          notice: portfolioValue ? 'Risk figures use only supplied portfolio values, volatility, and scenarios.' : 'No positive portfolio values were supplied; no risk metrics were calculated.'
        };
      }

      async function evaluateInvestment(params) {
        const symbols = params.symbols || [];
        const criteria = params.criteria || {};
        const weights = params.weights || {};
        const scored = symbols.map(symbol => {
          const symbolCriteria = criteria[symbol] || {};
          const entries = Object.entries(symbolCriteria).filter(([, value]) => Number.isFinite(Number(value)));
          const totalWeight = entries.reduce((sum, [key]) => sum + (Number(weights[key]) || 0), 0);
          const score = entries.length && totalWeight > 0 ? entries.reduce((sum, [key, value]) => sum + Number(value) * (Number(weights[key]) || 0), 0) / totalWeight : null;
          return { symbol, score, factors: score === null ? null : Object.fromEntries(entries), source: score === null ? 'insufficient-input' : 'supplied-input' };
        });
        const ranked = scored.filter(item => item.score !== null).sort((a, b) => b.score - a.score);
        return { scores: scored, ranked, criteria, weights, source: 'supplied-input', notice: ranked.length ? 'Scores are weighted calculations from supplied criteria and weights.' : 'No numeric criteria were supplied; no ranking was produced.' };
      }

      function buildPresent(action, result) {
        const lines = [];
        if (action === 'analyze-portfolio') {
          lines.push('Portfolio Analysis');
          lines.push('=================');
          lines.push('');
          formatAllocation(result).forEach(function (l) { lines.push(l); });
        } else if (action === 'optimize' || action === 'rebalance' || action === 'efficient-frontier' || action === 'risk-budgeting') {
          lines.push('Portfolio Optimization');
          lines.push('======================');
          lines.push('');
          formatWeights(result).forEach(function (l) { lines.push(l); });
        } else if (action === 'risk-assessment' || action === 'stress-test') {
          lines.push('Risk Assessment');
          lines.push('===============');
          lines.push('');
          formatRisk(result).forEach(function (l) { lines.push(l); });
        } else if (action === 'evaluate' || action === 'factor-exposure' || action === 'scenario-analysis') {
          lines.push('Investment Evaluation');
          lines.push('=====================');
          lines.push('');
          formatEvaluation(result).forEach(function (l) { lines.push(l); });
        }
        lines.push('');
        formatNotice(result).forEach(function (l) { lines.push(l); });
        return [{ id: 'report', title: action, kind: 'text', body: lines.join(NL) }];
      }

      try {
        const action = input.action;
        let result;
        switch (action) {
          case 'analyze-portfolio':
            result = await analyzePortfolio(input.holdings || [], input.riskTolerance);
            break;
          case 'optimize':
          case 'rebalance':
          case 'efficient-frontier':
          case 'risk-budgeting':
            result = await optimizePortfolio(input);
            break;
          case 'risk-assessment':
          case 'stress-test':
            result = await assessRisk(input);
            break;
          case 'evaluate':
          case 'factor-exposure':
          case 'scenario-analysis':
            result = await evaluateInvestment(input);
            break;
          default:
            throw new Error('Unknown action: ' + action);
        }
        const record = { id: 'adv_' + Date.now(), action, input, result, createdAt: new Date().toISOString() };
        store.push(record);
        ctx.store.save('portfolio-advisory', store);
        result.storePath = ctx.store.getFilePath('portfolio-advisory');
        const present = buildPresent(action, result);
        return { success: true, status: 'ok', data: result, error: null, present: present };
      } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        return { success: false, status: 'error', data: null, error: msg, present: [{
          id: 'error',
          title: 'Error',
          kind: 'text',
          body: 'Portfolio advisory action "' + (input.action || '(unspecified)') + '" failed: ' + msg
        }] };
      }
    }
  });

export { PORTFOLIO_RISK_ADVISORY };
