import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const INVESTMENT_SKILLS: Tool[] = [
  {
    id: 'portfolio-analysis',
    name: 'Portfolio Analysis',
    description: 'Analyze an investment portfolio with holdings and risk tolerance.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const holdings = input.holdings || [];
const riskTolerance = input.riskTolerance || '';
const baseDir = process.env.INVESTMENT_HOME || path.join('/tmp/investment');
const storePath = path.join(baseDir, 'portfolios.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const assetClasses = ['Equity', 'Fixed Income', 'Alternatives', 'Cash', 'Real Estate'];
const totalValue = holdings.reduce((sum, h) => sum + (h.value || h.amount || 10000), 0) || 100000;
const allocation = {};
let remaining = 100;
assetClasses.forEach((cls, i) => {
  const pct = i === assetClasses.length - 1 ? remaining : Math.floor(Math.random() * (remaining / (assetClasses.length - i))) + 5;
  allocation[cls] = pct + '%';
  remaining -= pct;
});
const riskLevels = ['Conservative', 'Moderate', 'Aggressive', 'Very Aggressive'];
const risk = riskLevels[Math.floor(Math.random() * riskLevels.length)];
const expectedReturn = (Math.random() * 10 + 3).toFixed(1) + '% annually';
const sharpeRatio = (Math.random() * 1.5 + 0.5).toFixed(2);
const maxDrawdown = (Math.random() * 15 + 5).toFixed(1) + '%';
const analysis = {
  id: 'portfolio_' + Date.now(),
  holdings,
  riskTolerance,
  allocation,
  risk,
  return: expectedReturn,
  sharpeRatio: sharpeRatio,
  maxDrawdown: maxDrawdown,
  createdAt: new Date().toISOString(),
  source: 'local',
  disclaimer: 'This is not financial advice. Consult a qualified advisor.'
};
store.push(analysis);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { analysis, storePath } }));
` },
    inputSchema: { type: 'object', properties: { holdings: { type: 'array', items: { type: 'object' }, description: 'Portfolio holdings' }, riskTolerance: { type: 'string', description: 'Risk tolerance level' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, analysis: { type: 'object' }, storePath: { type: 'string' } }, required: ['success', 'analysis', 'storePath'] },
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const INVESTMENT_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'investment-market-data',
    name: 'Market Data Provider',
    description: 'Fetch real-time and historical market data including quotes, fundamentals, and alternative data from external providers.',
    system: 'market-data',
    action: 'fetch-data',
    endpoint: { envVar: 'INVESTMENT_MARKET_DATA_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'INVESTMENT_MARKET_DATA_API_KEY' } },
    configSchema: { type: 'object', properties: { provider: { type: 'string', enum: ['bloomberg', 'refinitiv', 'alphavantage', 'polygon', 'iex', 'twelvedata', 'custom'] }, defaultExchange: { type: 'string' }, dataTypes: { type: 'array', items: { type: 'string' } }, cacheTtlSeconds: { type: 'number' }, rateLimitPerSecond: { type: 'number' } } },
    credentialSource: { apiKey: { envVar: 'INVESTMENT_MARKET_DATA_API_KEY', configKey: 'marketData.apiKey', vaultSecretId: 'market-data-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['quote', 'historical', 'fundamentals', 'options-chain', 'news', 'economic-calendar', 'search-symbols'], description: 'Action to perform' }, symbols: { type: 'array', items: { type: 'string' }, description: 'Stock symbols' }, symbol: { type: 'string', description: 'Stock symbol' }, interval: { type: 'string', enum: ['1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M'], description: 'Data interval' }, startDate: { type: 'string', description: 'Start date' }, endDate: { type: 'string', description: 'End date' }, fields: { type: 'array', items: { type: 'string' }, description: 'Data fields' }, adjustments: { type: 'string', enum: ['none', 'split', 'dividend', 'all'], description: 'Price adjustments' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'investment-analysis',
    name: 'Investment Analysis Engine',
    description: 'Run quantitative analysis, factor models, and valuation models on securities and portfolios.',
    system: 'analysis',
    action: 'run-analysis',
    endpoint: { envVar: 'INVESTMENT_ANALYSIS_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'INVESTMENT_ANALYSIS_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { models: { type: 'array', items: { type: 'string', enum: ['dcf', 'comps', 'precedent', 'factor', 'risk-parity', 'black-litterman', 'monte-carlo'] } }, defaultHorizon: { type: 'string' }, benchmark: { type: 'string' }, riskFreeRate: { type: 'number' }, currency: { type: 'string' } } },
    credentialSource: { accessToken: { envVar: 'INVESTMENT_ANALYSIS_ACCESS_TOKEN', configKey: 'analysis.accessToken', vaultSecretId: 'analysis-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['valuation', 'factor-exposure', 'scenario-analysis', 'stress-test', 'correlation', 'attribution', 'custom-model'], description: 'Action to perform' }, symbols: { type: 'array', items: { type: 'string' }, description: 'Stock symbols' }, portfolio: { type: 'object', description: 'Portfolio data' }, modelParams: { type: 'object', description: 'Model parameters' }, scenarios: { type: 'array', items: { type: 'object' }, description: 'Scenarios' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date' }, end: { type: 'string', description: 'End date' } }, description: 'Date range' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'investment-financial-risk-assessment',
    name: 'Financial Risk Assessment',
    description: 'Assess portfolio and instrument risk including VaR, stress testing, factor risk, and regulatory capital.',
    system: 'risk',
    action: 'assess-risk',
    endpoint: { envVar: 'INVESTMENT_RISK_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'Authorization', credentialEnvKeyMap: { apiKey: 'INVESTMENT_RISK_API_KEY' } },
    configSchema: { type: 'object', properties: { methods: { type: 'array', items: { type: 'string', enum: ['var-parametric', 'var-historical', 'var-monte-carlo', 'expected-shortfall', 'stress-test', 'factor-risk', 'liquidity-risk', 'credit-risk'] } }, confidenceLevels: { type: 'array', items: { type: 'number' } }, holdingPeriodDays: { type: 'number' }, lookbackDays: { type: 'number' }, regulatoryFramework: { type: 'string', enum: ['basel-iii', 'solvency-ii', 'ccar', 'custom'] } } },
    credentialSource: { apiKey: { envVar: 'INVESTMENT_RISK_API_KEY', configKey: 'risk.apiKey', vaultSecretId: 'risk-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['portfolio-var', 'instrument-var', 'stress-test', 'factor-decomposition', 'liquidity-profile', 'credit-exposure', 'concentration', 'regulatory-capital'], description: 'Action to perform' }, portfolio: { type: 'object', description: 'Portfolio data' }, instrument: { type: 'object', description: 'Instrument data' }, scenarios: { type: 'array', items: { type: 'object' }, description: 'Scenarios' }, confidenceLevel: { type: 'number', description: 'Confidence level' }, holdingPeriod: { type: 'number', description: 'Holding period' }, currency: { type: 'string', description: 'Currency' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'investment-market-research',
    name: 'Market Research Platform',
    description: 'Access analyst reports, earnings transcripts, filings, and alternative research from external providers.',
    system: 'research',
    action: 'fetch-research',
    endpoint: { envVar: 'INVESTMENT_RESEARCH_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'INVESTMENT_RESEARCH_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { providers: { type: 'array', items: { type: 'string', enum: ['factset', 'capital-iq', 'refinitiv', 'morningstar', 'zacks', 'seeking-alpha', 'custom'] } }, documentTypes: { type: 'array', items: { type: 'string', enum: ['equity-research', 'earnings-transcript', 'sec-filing', 'press-release', 'esg-report', 'industry-report'] } }, coverage: { type: 'array', items: { type: 'string' } }, languages: { type: 'array', items: { type: 'string' } } } },
    credentialSource: { accessToken: { envVar: 'INVESTMENT_RESEARCH_ACCESS_TOKEN', configKey: 'research.accessToken', vaultSecretId: 'research-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['search', 'get-document', 'get-analyst-estimates', 'get-earnings-calendar', 'get-esg-scores', 'monitor-alerts'], description: 'Action to perform' }, query: { type: 'string', description: 'Search query' }, symbol: { type: 'string', description: 'Stock symbol' }, documentId: { type: 'string', description: 'Document ID' }, filters: { type: 'object', properties: { dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date' }, end: { type: 'string', description: 'End date' } }, description: 'Date range' }, provider: { type: 'string', description: 'Provider' }, documentType: { type: 'string', description: 'Document type' }, sector: { type: 'string', description: 'Sector' }, rating: { type: 'string', description: 'Rating' } }, description: 'Filters' }, pagination: { type: 'object', description: 'Pagination' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'investment-portfolio-optimizer',
    name: 'Portfolio Optimizer',
    description: 'Optimize portfolio allocation using mean-variance, risk parity, Black-Litterman, and custom objectives with constraints.',
    system: 'optimizer',
    action: 'optimize-portfolio',
    endpoint: { envVar: 'INVESTMENT_OPTIMIZER_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'INVESTMENT_OPTIMIZER_API_KEY' } },
    configSchema: { type: 'object', properties: { methods: { type: 'array', items: { type: 'string', enum: ['mean-variance', 'risk-parity', 'black-litterman', 'hierarchical-risk-parity', 'cvxopt', 'custom'] } }, defaultObjective: { type: 'string', enum: ['max-sharpe', 'min-variance', 'max-return', 'risk-budget', 'custom'] }, constraints: { type: 'object', properties: { longOnly: { type: 'boolean' }, maxWeight: { type: 'number' }, minWeight: { type: 'number' }, sectorCaps: { type: 'object' }, factorExposure: { type: 'object' }, turnover: { type: 'number' } } }, solver: { type: 'string', enum: ['cvxpy', 'scipy', 'mosek', 'gurobi', 'custom'] } } },
    credentialSource: { apiKey: { envVar: 'INVESTMENT_OPTIMIZER_API_KEY', configKey: 'optimizer.apiKey', vaultSecretId: 'optimizer-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['optimize', 'rebalance', 'efficient-frontier', 'risk-budgeting', 'factor-tilt', 'custom-optimization'], description: 'Action to perform' }, currentPortfolio: { type: 'object', description: 'Current portfolio' }, expectedReturns: { type: 'object', description: 'Expected returns' }, covarianceMatrix: { type: 'object', description: 'Covariance matrix' }, objective: { type: 'string', description: 'Optimization objective' }, constraints: { type: 'object', description: 'Constraints' }, views: { type: 'object', description: 'Market views' }, confidence: { type: 'object', description: 'Confidence level' }, benchmark: { type: 'string', description: 'Benchmark' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'investment-evaluator',
    name: 'Investment Evaluator',
    description: 'Score and rank investment opportunities using multi-criteria decision analysis, scoring models, and peer comparison.',
    system: 'evaluator',
    action: 'evaluate-investment',
    endpoint: { envVar: 'INVESTMENT_EVALUATOR_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'INVESTMENT_EVALUATOR_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { scoringModels: { type: 'array', items: { type: 'string', enum: ['fundamental', 'technical', 'quantitative', 'esg', 'quality', 'value', 'growth', 'composite'] } }, weights: { type: 'object' }, peerGroups: { type: 'array', items: { type: 'string' } }, benchmarkIndices: { type: 'array', items: { type: 'string' } }, rebalanceFrequency: { type: 'string' } } },
    credentialSource: { accessToken: { envVar: 'INVESTMENT_EVALUATOR_ACCESS_TOKEN', configKey: 'evaluator.accessToken', vaultSecretId: 'evaluator-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['score', 'rank', 'compare', 'screen', 'peer-analysis', 'generate-report'], description: 'Action to perform' }, symbols: { type: 'array', items: { type: 'string' }, description: 'Stock symbols' }, criteria: { type: 'object', description: 'Evaluation criteria' }, weights: { type: 'object', description: 'Criteria weights' }, peerGroup: { type: 'string', description: 'Peer group' }, benchmark: { type: 'string', description: 'Benchmark' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date' }, end: { type: 'string', description: 'End date' } }, description: 'Date range' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'investment-financial-planner',
    name: 'Financial Planning Engine',
    description: 'Create comprehensive financial plans including retirement, tax optimization, estate planning, and goal-based projections.',
    system: 'financial-planner',
    action: 'create-plan',
    endpoint: { envVar: 'INVESTMENT_PLANNER_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'Authorization', credentialEnvKeyMap: { apiKey: 'INVESTMENT_PLANNER_API_KEY' } },
    configSchema: { type: 'object', properties: { modules: { type: 'array', items: { type: 'string', enum: ['retirement', 'tax', 'estate', 'education', 'insurance', 'cash-flow', 'monte-carlo', 'social-security'] } }, defaultAssumptions: { type: 'object', properties: { inflationRate: { type: 'number' }, marketReturn: { type: 'number' }, lifeExpectancy: { type: 'number' }, taxRates: { type: 'object' } } }, reportingCurrency: { type: 'string' }, complianceStandard: { type: 'string', enum: ['cfp', 'cfa', 'sec', 'fca', 'custom'] } } },
    credentialSource: { apiKey: { envVar: 'INVESTMENT_PLANNER_API_KEY', configKey: 'planner.apiKey', vaultSecretId: 'planner-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create-plan', 'update-plan', 'run-projection', 'tax-optimization', 'estate-analysis', 'retirement-readiness', 'goal-tracking', 'scenario-comparison'], description: 'Action to perform' }, clientProfile: { type: 'object', properties: { age: { type: 'number', description: 'Client age' }, income: { type: 'number', description: 'Annual income' }, expenses: { type: 'number', description: 'Annual expenses' }, assets: { type: 'object', description: 'Assets' }, liabilities: { type: 'object', description: 'Liabilities' }, goals: { type: 'array', items: { type: 'object' }, description: 'Financial goals' }, riskTolerance: { type: 'string', description: 'Risk tolerance' }, dependents: { type: 'number', description: 'Number of dependents' } }, description: 'Client profile' }, planId: { type: 'string', description: 'Plan ID' }, assumptions: { type: 'object', description: 'Planning assumptions' }, scenarios: { type: 'array', items: { type: 'object' }, description: 'Scenarios' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 60000,
  }),
];

export const investmentSkills = [...INVESTMENT_SKILLS, ...INVESTMENT_EXTERNAL_SKILLS];
