import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';
import { investmentResultSchema } from './investment-contract';

const INVESTMENT_HOME = process.env.INVESTMENT_HOME || '/tmp/investment';

const researchPlanningInputSchema = createSchemaRecord({
  action: SchemaProps.select(['search', 'get-document', 'get-analyst-estimates', 'get-earnings-calendar', 'get-esg-scores', 'monitor-alerts', 'create-plan', 'update-plan', 'run-projection', 'tax-optimization', 'estate-analysis', 'retirement-readiness', 'goal-tracking', 'scenario-comparison'], { description: 'Action to perform' }),
  query: SchemaProps.text({ description: 'Search query' }),
  symbol: SchemaProps.text({ description: 'Stock symbol' }),
  documentId: SchemaProps.text({ description: 'Document ID to retrieve' }),
  documents: SchemaProps.objectArray(SchemaProps.object({ id: SchemaProps.text({ description: 'Document identifier' }), title: SchemaProps.text({ description: 'Document title' }), type: SchemaProps.text({ description: 'Document type' }), provider: SchemaProps.text({ description: 'Document provider' }), date: SchemaProps.text({ description: 'Document date' }), rating: SchemaProps.text({ description: 'Document rating' }), summary: SchemaProps.text({ description: 'Document summary' }), sector: SchemaProps.text({ description: 'Document sector' }) }, { description: 'Research document supplied by the caller' }), { description: 'Research documents supplied by the caller' }),
  filters: SchemaProps.object({
    dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Date range for research filters' }),
    provider: SchemaProps.text({ description: 'Provider filter' }),
    documentType: SchemaProps.text({ description: 'Document type filter' }),
    sector: SchemaProps.text({ description: 'Sector filter' }),
    rating: SchemaProps.text({ description: 'Rating filter' })
  }, { description: 'Filters for research queries' }),
  pagination: SchemaProps.object({ page: SchemaProps.number({ description: 'One-based page number', minimum: 1 }), limit: SchemaProps.number({ description: 'Maximum results per page', minimum: 1 }) }, { description: 'Pagination parameters' }),
  clientProfile: SchemaProps.object({
    age: SchemaProps.number({ description: 'Client age' }),
    income: SchemaProps.number({ description: 'Annual income' }),
    expenses: SchemaProps.number({ description: 'Annual expenses' }),
    assets: SchemaProps.object({ total: SchemaProps.number({ description: 'Total asset value' }) }, { description: 'Assets breakdown' }),
    liabilities: SchemaProps.object({}, { description: 'Liabilities breakdown' }),
    goals: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({ description: 'Goal name' }), target: SchemaProps.number({ description: 'Goal target value' }), current: SchemaProps.number({ description: 'Current goal value' }), dueDate: SchemaProps.text({ description: 'Goal due date' }) }, { description: 'Financial goal' }), { description: 'Financial goals' }),
    riskTolerance: SchemaProps.text({ description: 'Risk tolerance' }),
    dependents: SchemaProps.number({ description: 'Number of dependents' })
  }, { description: 'Client profile for financial planning' }),
  planId: SchemaProps.text({ description: 'Existing plan ID to update' }),
  assumptions: SchemaProps.object({
    inflationRate: SchemaProps.number({ description: 'Annual inflation rate as a decimal' }),
    marketReturn: SchemaProps.number({ description: 'Annual market return as a decimal' }),
    retirementAge: SchemaProps.number({ description: 'Target retirement age' }),
    withdrawalRate: SchemaProps.number({ description: 'Withdrawal rate as a decimal' })
  }, { description: 'Planning assumptions supplied by the caller' }),
  scenarios: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({ description: 'Scenario name' }), portfolioValue: SchemaProps.number({ description: 'Scenario portfolio value' }), successProbability: SchemaProps.number({ description: 'Scenario success probability', minimum: 0, maximum: 1 }) }, { description: 'Projection scenario supplied by the caller' }), { description: 'Scenarios for projection' }),
  baseCase: SchemaProps.object({}, { description: 'Base-case projection supplied by the caller' }),
  strategies: SchemaProps.stringArray({ description: 'Tax strategies supplied by the caller' }),
  estimatedSavings: SchemaProps.number({ description: 'Estimated tax savings supplied by the caller' }),
  estateTaxExposure: SchemaProps.number({ description: 'Estate tax exposure supplied by the caller' }),
  recommendedActions: SchemaProps.stringArray({ description: 'Recommended actions supplied by the caller' }),
  readinessScore: SchemaProps.number({ description: 'Retirement readiness score supplied by the caller', minimum: 0, maximum: 100 }),
  gap: SchemaProps.number({ description: 'Retirement funding gap supplied by the caller' }),
  recommendations: SchemaProps.stringArray({ description: 'Recommendations supplied by the caller' }),
  goals: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({ description: 'Goal name' }), target: SchemaProps.number({ description: 'Goal target value' }), current: SchemaProps.number({ description: 'Current goal value' }), onTrack: SchemaProps.boolean({ description: 'Whether the goal is on track' }) }, { description: 'Goal record supplied by the caller' }), { description: 'Goal records supplied by the caller' }),
  startDate: SchemaProps.text({ description: 'Calendar start date (ISO 8601)' }),
  endDate: SchemaProps.text({ description: 'Calendar end date (ISO 8601)' })
}, { required: ['action'] });

const researchPlanningSourceCode = `
const fs = require('fs');
const path = require('path');
const input = __tool_input || {};
const NL = '\\n';

const baseDir = process.env.INVESTMENT_HOME || '${INVESTMENT_HOME}';
const storePath = path.join(baseDir, 'research-planning.json');
try { fs.mkdirSync(baseDir, { recursive: true }); } catch (e) {}

const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

function emit(success, status, data, error, present) {
  const payload = { success: success, status: status, data: data || null, error: error || null, present: present || [] };
  console.log(JSON.stringify(payload));
  return payload;
}
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function fmtMoney(v) { return v == null ? 'N/A' : '$' + Number(v).toFixed(2); }
function fmtPct(v) { return v == null ? 'N/A' : (v * 100).toFixed(1) + '%'; }

const suppliedDocuments = Array.isArray(input.documents) ? input.documents : [];

async function searchResearch(params) {
  const { query, filters = {}, pagination = { page: 1, limit: 10 } } = params;
  const normalizedQuery = (query || '').toLowerCase().trim();
  const results = suppliedDocuments.filter(d => {
    const matchesQuery = !normalizedQuery || (d.title || '').toLowerCase().includes(normalizedQuery) || (d.summary || '').toLowerCase().includes(normalizedQuery);
    const matchesProvider = !filters.provider || d.provider === filters.provider;
    const matchesType = !filters.documentType || d.type === filters.documentType;
    const matchesSector = !filters.sector || (d.sector || '').toLowerCase().includes(filters.sector.toLowerCase());
    const matchesRating = !filters.rating || d.rating === filters.rating;
    return matchesQuery && matchesProvider && matchesType && matchesSector && matchesRating;
  });
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Number(pagination.limit) || 10);
  return { results: results.slice((page - 1) * limit, page * limit), total: results.length, source: 'supplied-input', status: 'local', notice: suppliedDocuments.length ? 'Results are limited to documents supplied with this request.' : 'No research documents were supplied; no research results were returned.' };
}

async function getDocument(params) {
  const document = suppliedDocuments.find(d => d.id === params.documentId) || null;
  return { document, source: 'supplied-input', status: 'local', notice: document ? 'Document returned from request input.' : 'No matching supplied document was found.' };
}

async function getAnalystEstimates(params) {
  return { symbol: params.symbol || null, estimates: null, consensus: null, targetPrice: null, source: 'not-connected', notice: 'No analyst-data provider is connected; no estimates were returned.' };
}

async function getEarningsCalendar(params) {
  return { calendar: [], source: 'not-connected', notice: 'No earnings-calendar provider is connected; no calendar events were returned.' };
}

async function getEsgScores(params) {
  return { symbol: params.symbol || null, environmental: null, social: null, governance: null, overall: null, percentile: null, source: 'not-connected', notice: 'No ESG-data provider is connected; no scores were returned.' };
}

async function monitorAlerts(params) {
  return { alerts: [], source: 'not-connected', notice: 'No alert provider is connected; no alerts were returned.' };
}

async function createFinancialPlan(params) {
  const profile = params.clientProfile || {};
  const assumptions = params.assumptions || {};
  const age = finiteNumber(profile.age);
  const retirementAge = finiteNumber(assumptions.retirementAge);
  const yearsToRetirement = age !== null && retirementAge !== null ? Math.max(0, retirementAge - age) : null;
  const assetsTotal = finiteNumber(profile.assets?.total);
  const marketReturn = finiteNumber(assumptions.marketReturn);
  const inflationRate = finiteNumber(assumptions.inflationRate);
  const withdrawalRate = finiteNumber(assumptions.withdrawalRate);
  const futureValue = assetsTotal !== null && marketReturn !== null && inflationRate !== null && yearsToRetirement !== null ? assetsTotal * Math.pow(1 + marketReturn - inflationRate, yearsToRetirement) : null;
  const annualIncome = futureValue !== null && withdrawalRate !== null ? futureValue * withdrawalRate : null;
  return {
    planId: 'plan_' + Date.now(),
    clientProfile: profile,
    assumptions,
    projections: { retirementAge, yearsToRetirement, portfolioValue: futureValue, annualIncome, withdrawalRate },
    recommendations: [],
    taxOptimization: null,
    estateAnalysis: null,
    source: 'supplied-input',
    notice: 'Planning calculations use only supplied profile values and assumptions; no external planning provider or generic recommendations were used.'
  };
}

async function runProjection(params) {
  const scenarios = Array.isArray(params.scenarios) ? params.scenarios : [];
  return {
    planId: params.planId || null,
    baseCase: params.baseCase || null,
    scenarios: scenarios.map(s => ({ name: s.name || 'Supplied scenario', portfolioValue: finiteNumber(s.portfolioValue), successProbability: finiteNumber(s.successProbability) })),
    source: 'supplied-input',
    notice: scenarios.length ? 'Projection values are copied from supplied scenarios.' : 'No projection scenarios were supplied; no projection was calculated.'
  };
}

function buildPresent(action, result) {
  const L = [];

  if (action === 'search') {
    L.push('Research Search Results');
    L.push('=======================');
    L.push('Total results: ' + (result.total || 0));
    L.push('Showing page ' + (input.pagination && input.pagination.page ? input.pagination.page : 1) + ' (limit ' + (input.pagination && input.pagination.limit ? input.pagination.limit : 10) + ').');
    const results = result.results || [];
    if (results.length) {
      L.push('');
      L.push('Documents:');
      results.forEach(function (d) {
        L.push('  - ' + (d.title || d.id || '(untitled)') + ' [' + (d.provider || 'unknown provider') + '] (' + (d.date || 'no date') + ')');
        if (d.rating) L.push('      Rating: ' + d.rating);
        if (d.sector) L.push('      Sector: ' + d.sector);
        if (d.summary) L.push('      Summary: ' + d.summary.slice(0, 160) + (d.summary.length > 160 ? '...' : ''));
      });
    } else {
      L.push('');
      L.push('No documents matched the query.');
    }
  } else if (action === 'get-document') {
    L.push('Research Document');
    L.push('=================');
    if (result.document) {
      L.push('  Title: ' + (result.document.title || '(untitled)'));
      L.push('  Provider: ' + (result.document.provider || 'unknown'));
      L.push('  Type: ' + (result.document.type || '(unspecified)'));
      L.push('  Date: ' + (result.document.date || '(unspecified)'));
      L.push('  Rating: ' + (result.document.rating || '(none)'));
      L.push('  Sector: ' + (result.document.sector || '(none)'));
      if (result.document.summary) {
        L.push('');
        L.push('  Summary:');
        L.push('  ' + result.document.summary);
      }
    } else {
      L.push('No document was found for the requested ID.');
    }
  } else if (action === 'get-analyst-estimates' || action === 'get-earnings-calendar' || action === 'get-esg-scores' || action === 'monitor-alerts') {
    const providerMap = {
      'get-analyst-estimates': 'analyst estimates',
      'get-earnings-calendar': 'earnings calendar',
      'get-esg-scores': 'ESG scores',
      'monitor-alerts': 'price alert monitoring'
    };
    L.push('Not connected: ' + providerMap[action]);
    L.push('=========================================');
    L.push('No external provider is configured for ' + providerMap[action] + '. ' + result.notice);
  } else if (action === 'create-plan') {
    L.push('Financial Plan');
    L.push('==============');
    L.push('  Plan ID: ' + result.planId);
    const proj = result.projections || {};
    L.push('  Years to retirement: ' + fmtNum(proj.yearsToRetirement));
    L.push('  Retirement age: ' + fmtNum(proj.retirementAge));
    L.push('  Projected portfolio value: ' + fmtMoney(proj.portfolioValue));
    L.push('  Annual income (4% rule): ' + fmtMoney(proj.annualIncome));
    L.push('  Withdrawal rate: ' + fmtPct(proj.withdrawalRate));
    const goals = (result.clientProfile && result.clientProfile.goals) || [];
    if (goals.length) {
      L.push('');
      L.push('  Goals:');
      goals.forEach(function (g) { L.push('    - ' + g.name + ': target ' + fmtMoney(g.target) + ', current ' + fmtMoney(g.current)); });
    }
  } else if (action === 'run-projection' || action === 'update-plan' || action === 'scenario-comparison') {
    L.push('Projection Results');
    L.push('==================');
    L.push('  Plan ID: ' + (result.planId || '(none)'));
    if (result.baseCase) L.push('  Base case: supplied');
    else L.push('  Base case: (none)');
    const sc = result.scenarios || [];
    if (sc.length) {
      L.push('');
      L.push('  Scenarios:');
      sc.forEach(function (s) {
        L.push('    - ' + s.name + ': value ' + fmtMoney(s.portfolioValue) + ', success ' + fmtPct(s.successProbability));
      });
    } else {
      L.push('  No scenarios were supplied.');
    }
  } else if (action === 'tax-optimization') {
    L.push('Tax Optimization');
    L.push('================');
    if (result.strategies && result.strategies.length) {
      L.push('  Strategies:');
      result.strategies.forEach(function (s) { L.push('    - ' + s); });
    } else {
      L.push('  No strategies were supplied.');
    }
    L.push('  Estimated savings: ' + fmtMoney(result.estimatedSavings));
  } else if (action === 'estate-analysis') {
    L.push('Estate Analysis');
    L.push('===============');
    L.push('  Estate tax exposure: ' + fmtMoney(result.estateTaxExposure));
    if (result.recommendedActions && result.recommendedActions.length) {
      L.push('  Recommended actions:');
      result.recommendedActions.forEach(function (a) { L.push('    - ' + a); });
    } else {
      L.push('  No recommended actions were supplied.');
    }
  } else if (action === 'retirement-readiness') {
    L.push('Retirement Readiness');
    L.push('====================');
    L.push('  Readiness score: ' + fmtNum(result.readinessScore, 1) + ' / 100');
    L.push('  Funding gap: ' + fmtMoney(result.gap));
    if (result.recommendations && result.recommendations.length) {
      L.push('  Recommendations:');
      result.recommendations.forEach(function (r) { L.push('    - ' + r); });
    } else {
      L.push('  No recommendations were supplied.');
    }
  } else if (action === 'goal-tracking') {
    L.push('Goal Tracking');
    L.push('=============');
    const goals = result.goals || [];
    if (goals.length) {
      goals.forEach(function (g) {
        const status = g.onTrack ? 'on track' : 'not on track';
        L.push('  - ' + g.name + ': ' + status + ' (target ' + fmtMoney(g.target) + ', current ' + fmtMoney(g.current) + ')');
      });
    } else {
      L.push('  No goals were supplied.');
    }
  }

  L.push('');
  if (result.notice) {
    L.push('Note: ' + result.notice);
  }
  L.push('Source: ' + result.source);

  return [{ id: 'report', title: 'Research & Planning Report', kind: 'text', body: L.join(NL) }];
}

function fmtNum(v, d) { return v == null ? 'N/A' : Number(v).toFixed(d || 2); }

(async () => {
  try {
    const action = input.action;
    let result;
    switch (action) {
      case 'search':
        result = await searchResearch(input);
        break;
      case 'get-document':
        result = await getDocument(input);
        break;
      case 'get-analyst-estimates':
        result = await getAnalystEstimates(input);
        break;
      case 'get-earnings-calendar':
        result = await getEarningsCalendar(input);
        break;
      case 'get-esg-scores':
        result = await getEsgScores(input);
        break;
      case 'monitor-alerts':
        result = await monitorAlerts(input);
        break;
      case 'create-plan':
        result = await createFinancialPlan(input);
        break;
      case 'update-plan':
      case 'run-projection':
      case 'scenario-comparison':
        result = await runProjection(input);
        break;
      case 'tax-optimization':
        result = { strategies: Array.isArray(input.strategies) ? input.strategies : [], estimatedSavings: finiteNumber(input.estimatedSavings), source: 'supplied-input', notice: 'Strategies and savings are returned only when supplied by the caller; no tax provider is connected.' };
        break;
      case 'estate-analysis':
        result = { estateTaxExposure: finiteNumber(input.estateTaxExposure), recommendedActions: Array.isArray(input.recommendedActions) ? input.recommendedActions : [], source: 'supplied-input', notice: 'No estate-planning provider is connected; no analysis was produced beyond supplied values.' };
        break;
      case 'retirement-readiness':
        result = { readinessScore: finiteNumber(input.readinessScore), gap: finiteNumber(input.gap), recommendations: Array.isArray(input.recommendations) ? input.recommendations : [], source: 'supplied-input', notice: 'No retirement-planning provider is connected; no score, gap, or recommendations were inferred.' };
        break;
      case 'goal-tracking':
        result = { goals: Array.isArray(input.goals) ? input.goals : [], source: 'supplied-input', notice: 'Goal status is reported only from supplied goal records.' };
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }
    const record = { id: 'rp_' + Date.now(), action, input, result, createdAt: new Date().toISOString() };
    store.push(record);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    result.storePath = storePath;
    const present = buildPresent(action, result);
    emit(true, 'ok', result, null, present);
  } catch (error) {
    const msg = (error && error.message) ? error.message : String(error);
    emit(false, 'error', null, msg, [{
      id: 'error',
      title: 'Error',
      kind: 'text',
      body: 'Research & Planning action "' + (input.action || '(unspecified)') + '" failed: ' + msg
    }]);
  }
})();
`;

const RESEARCH_PLANNING = createCodeSkill({
  id: 'research-planning',
  name: 'Research & Planning',
  description: 'Market research including analyst reports, earnings transcripts, SEC filings, ESG scores, plus comprehensive financial planning for retirement, tax, estate, and goal-based projections.',
  tier: 'aid',
  domainKnowledge: 'Equity research methods, earnings and filing analysis, ESG evaluation, and financial planning projections',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: researchPlanningSourceCode, persistenceEnv: 'INVESTMENT_HOME', workflowStage: 'track' },
  inputSchema: researchPlanningInputSchema,
  outputSchema: investmentResultSchema('Research results, planning projections, and analysis records'),
  triggers: [
    { kind: 'user', phrase_examples: ['Research this stock', 'Get analyst reports', 'Check ESG scores', 'Create financial plan', 'Check retirement readiness', 'Run tax optimization'] }
  ],
  isSkill: true,
});

export { RESEARCH_PLANNING };
