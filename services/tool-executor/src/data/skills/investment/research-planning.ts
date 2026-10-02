// @ts-nocheck
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import { investmentResultSchema } from './investment-contract';

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
  pagination: SchemaProps.object({ page: SchemaProps.number({ description: 'One-based page number', minimum: 1 }), limit: SchemaProps.number({ description: 'Maximum results per page', minimum: 1 }) }, { description: 'Pagination parameters. Applies to supplied documents; web results are bounded by maxResults.' }),
  maxResults: SchemaProps.number({ description: 'Maximum number of web results to request from the general web search tool (1-50)', minimum: 1, maximum: 50 }),
  searchType: SchemaProps.select(['web', 'images', 'news'], { description: 'Type of web search to run for the web portion of a search' }),
  freshness: SchemaProps.select(['day', 'week', 'month', 'year'], { description: 'Recency filter for the web portion of a search, applied by the search providers that honor one' }),
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

const RESEARCH_PLANNING = createDeclarativeCodeSkill({
  id: 'research-planning',
  name: 'Research & Planning',
  description: 'Market and security research: filters the research documents supplied with the request, and supplements them with a real live web search for public source pointers via the general web search tool, labelling supplied material and web results apart and reporting whether the web portion returned results, returned none, errored, or was unavailable; a web portion that could not be retrieved is surfaced at the top level as a partial result with an error, or as a failure when nothing was returned at all, never as a clean pass. Financial planning actions compute projections from supplied profile values and assumptions. Analyst estimates, the earnings calendar, ESG scores, and price alerts are declared but not connected to any data provider and return no data.',
  persistenceEnvVar: 'INVESTMENT_HOME',
  tier: 'aid',
  domainKnowledge: 'Equity research methods, earnings and filing analysis, ESG evaluation, and financial planning projections',
  inputSchema: researchPlanningInputSchema,
  outputSchema: investmentResultSchema('Research results, planning projections, and analysis records'),
  triggers: [
    { kind: 'user', phrase_examples: ['Research this stock', 'Get analyst reports', 'Check ESG scores', 'Create financial plan', 'Check retirement readiness', 'Run tax optimization'] }
  ],
  isSkill: true,
  manifest: {
    lowerOrderTools: ['search_web']
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';

      const store = ctx.store.load('research-planning', []);

      function finiteNumber(value: any) { const number = Number(value); return Number.isFinite(number) ? number : null; }
      function fmtMoney(v: any) { return v == null ? 'N/A' : '$' + Number(v).toFixed(2); }
      function fmtPct(v: any) { return v == null ? 'N/A' : (v * 100).toFixed(1) + '%'; }

      const suppliedDocuments = Array.isArray(input.documents) ? input.documents : [];

      const SEARCH_TOOL = 'search_web';
      const SUPPLIED_SOURCE = 'supplied-input';
      const WEB_SOURCE = 'web-search';

      // runWebSearch performs one real retrieval against the general web search tool and
      // classifies the outcome honestly. The outcomes are kept distinct on purpose:
      //   not-connected  the tool is absent or unregistered, so nothing was searched
      //   error          the search was attempted and failed, so the error is reported
      //   no-results     the search ran and the providers returned nothing: a real answer
      //   ok             results were returned
      // An absent tool and a failed search are deliberately not collapsed together: only
      // one of them means anything was actually looked up, and reporting them alike would
      // hide a missing capability behind an apparent empty result.
      //
      // The five outcomes map onto the top-level contract in searchResearch, never onto a
      // buried data field:
      //   ok             + material returned            -> success true,  status 'ok'
      //   no-results     + nothing returned             -> success true,  status 'no-results'
      //   no-results     + supplied docs returned       -> success true,  status 'ok'
      //   not-requested  (no web search asked for)      -> success true,  status 'ok'
      //   not-connected  + supplied docs returned       -> success true,  status 'partial', error set
      //   not-connected  + nothing returned             -> success false, status 'not-connected', error set
      //   error          + supplied docs returned       -> success true,  status 'partial', error set
      //   error          + nothing returned             -> success false, status 'error', error set
      async function runWebSearch(query: any, maxResults: any, searchType: any, freshness: any) {
        if (!ctx.delegate) {
          return {
            status: 'not-connected',
            results: [],
            providerCount: 0,
            error: null,
            notice: 'The web portion of this request is not connected: the general "' + SEARCH_TOOL + '" tool is not available to this skill, so nothing was searched and no external sources were fetched. Only the documents supplied with this request were searched. This is a missing capability, not an empty result set.'
          };
        }
        let response = null;
        try {
          response = await ctx.delegate(SEARCH_TOOL, { query: query, maxResults: maxResults, searchType: searchType, freshness: freshness });
        } catch (error) {
          const message = (error as any) && (error as any).message ? (error as any).message : String(error);
          return { status: 'error', results: [], providerCount: 0, error: message, notice: 'The web search was attempted and failed, so the web portion of this request is missing rather than empty: ' + message + '. Only the documents supplied with this request were searched.' };
        }
        if (!response || response.error || response.success === false) {
          const rawStatus = String((response && response.status) || '');
          const rawMessage = String((response && (response.error || response.message)) || 'The web search tool returned no usable response.');
          const lowerMessage = rawMessage.toLowerCase();
          // An unregistered or unconfigured tool is a missing capability, not a failed
          // search. Reporting it as an error would overstate what actually went wrong.
          if (rawStatus === 'not-connected' || rawStatus === 'unavailable' || lowerMessage.indexOf('not registered') !== -1 || lowerMessage.indexOf('not-connected') !== -1) {
            return { status: 'not-connected', results: [], providerCount: 0, error: null, notice: 'The web portion of this request is not connected: the general "' + SEARCH_TOOL + '" tool reported that it is not registered in this environment, so nothing was searched and no external sources were fetched. Only the documents supplied with this request were searched. This is a missing capability, not an empty result set.' };
          }
          return { status: 'error', results: [], providerCount: 0, error: rawMessage, notice: 'The web search was attempted and returned an error, so the web portion of this request is missing rather than empty: ' + rawMessage + '. Only the documents supplied with this request were searched.' };
        }
        const rawResults = Array.isArray(response.results) ? response.results : [];
        const results = rawResults
          .filter(function (item: any) { return item && typeof item === 'object' && item.url; })
          .slice(0, maxResults)
          .map(function (item: any, index: any) {
            return {
              id: 'web_' + (index + 1),
              title: String(item.title || ('Web result ' + (index + 1))),
              url: String(item.url),
              snippet: String(item.snippet || ''),
              provider: 'web search',
              type: 'web-source',
              source: WEB_SOURCE
            };
          });
        if (!results.length) {
          return { status: 'no-results', results: [], providerCount: Number(response.count) || 0, error: null, notice: 'The web search ran and the search providers returned no results for this query. That is a real answer from the providers, not a failure and not a suppressed error. Only the documents supplied with this request were searched.' };
        }
        return { status: 'ok', results: results, providerCount: Number(response.count) || results.length, error: null, notice: 'Returned ' + results.length + ' public web ' + (results.length === 1 ? 'result' : 'results') + ' for this query. These are pointers to published pages, not analyst research, filings, or recommendations.' };
      }

      function filterSuppliedDocuments(filters: any, normalizedQuery: any) {
        return suppliedDocuments.filter(function (d: any) {
          const matchesQuery = !normalizedQuery || (d.title || '').toLowerCase().includes(normalizedQuery) || (d.summary || '').toLowerCase().includes(normalizedQuery);
          const matchesProvider = !filters.provider || d.provider === filters.provider;
          const matchesType = !filters.documentType || d.type === filters.documentType;
          const matchesSector = !filters.sector || (d.sector || '').toLowerCase().includes(filters.sector.toLowerCase());
          const matchesRating = !filters.rating || d.rating === filters.rating;
          return matchesQuery && matchesProvider && matchesType && matchesSector && matchesRating;
        }).map(function (d: any) { return Object.assign({}, d, { source: SUPPLIED_SOURCE }); });
      }

      async function searchResearch(params: any) {
        const { query, filters = {}, pagination = { page: 1, limit: 10 } } = params;
        const rawQuery = String(query || '').trim();
        const normalizedQuery = rawQuery.toLowerCase();
        const page = Math.max(1, Number(pagination.page) || 1);
        const limit = Math.max(1, Number(pagination.limit) || 10);

        // Supplied documents stay the primary, caller-trusted source. Their filter and
        // pagination behaviour is unchanged, and they are never relabelled as web material.
        const suppliedMatches = filterSuppliedDocuments(filters, normalizedQuery);
        const suppliedPage = suppliedMatches.slice((page - 1) * limit, page * limit);

        const maxResults = Math.max(1, Math.min(50, Number(params.maxResults) || 10));
        const searchType = ['web', 'images', 'news'].indexOf(params.searchType) >= 0 ? String(params.searchType) : 'web';
        const freshness = ['day', 'week', 'month', 'year'].indexOf(params.freshness) >= 0 ? String(params.freshness) : null;

        // search_web requires a query, so with no query there is nothing to retrieve. That
        // is reported as not-requested rather than as zero web results.
        const web = rawQuery
          ? await runWebSearch(rawQuery, maxResults, searchType, freshness)
          : { status: 'not-requested', results: [], providerCount: 0, error: null, notice: 'No query was supplied, so no web search was run: the web search tool requires a query. Only the documents supplied with this request were searched.' };

        // Caller-trusted material first, public web pointers after, each carrying its own
        // 'source' value so no web snippet can be mistaken for a supplied document.
        const results = suppliedPage.concat(web.results);
        const source = suppliedPage.length && web.results.length
          ? 'supplied-input+web-search'
          : (web.results.length ? WEB_SOURCE : SUPPLIED_SOURCE);

        const notice = [
          suppliedMatches.length
            ? 'Supplied documents are the primary source: ' + suppliedMatches.length + ' of ' + suppliedDocuments.length + ' supplied document(s) matched, and page ' + page + ' (limit ' + limit + ') of those is shown. These are the caller-supplied documents.'
            : (suppliedDocuments.length ? 'No supplied documents matched this query or these filters.' : 'No research documents were supplied with this request, so there was no caller material to search.'),
          web.notice,
          'Freshness for the web portion: ' + (freshness || 'not set (no recency filter was requested)') + '. That recency bound is applied by the Google, LangSearch and SearxNG providers. It cannot be applied by DuckDuckGo, whose Instant Answer API has no recency parameter and which logs a warning naming the dropped value. The provider that actually served this query is not reported back to this skill, so treat the recency bound as applied per provider rather than assured, and check the search tool logs if the bound is material.',
          'The provider, documentType, rating, and sector filters and the pagination settings apply only to the supplied documents. Web results are public search-engine snippets and are not filtered, ranked, or verified against those fields, and they are not analyst estimates, filings, or investment advice.'
        ].join(' ');

        // Top-level outcome for this search. There is no offline: a web search that could not be
        // run, or that was run and failed, is a failure of this system, and it is reported through
        // the top-level success / status / error. Partial success is legitimate here because the
        // caller-supplied documents are a genuine second source, so when real material was still
        // returned the run is reported as 'partial' with a non-null error naming the web failure,
        // never as a clean 'ok' that a caller could mistake for a pass. A web search that ran and
        // genuinely found nothing is a real answer from the providers, not a failure, and is not
        // treated as one. A web search that was never requested is a clean 'ok'.
        const webFailed = web.status === 'not-connected' || web.status === 'error';
        const returnedCount = results.length;
        const webFailureReason = web.status === 'not-connected'
          ? 'the web portion of this request could not be run at all: the general "' + SEARCH_TOOL + '" tool is not connected, so nothing was searched and no external sources were fetched'
          : 'the web portion of this request was attempted and failed, so it is missing rather than empty: ' + (web.error || 'the web search tool returned no usable response');
        const webFailureSentence = webFailureReason.charAt(0).toUpperCase() + webFailureReason.slice(1) + '. The web outcome is recorded as webStatus "' + web.status + '".';

        let runStatus = 'ok';
        let runError = null;
        if (webFailed && !returnedCount) {
          runStatus = web.status === 'not-connected' ? 'not-connected' : 'error';
          runError = 'RESEARCH SEARCH FAILED. ' + webFailureSentence + ' No supplied documents matched this query or these filters either, so this run produced no research material at all. It did not determine that no research on this query exists, and it is not an empty result set.';
        } else if (webFailed) {
          runStatus = 'partial';
          runError = 'RESEARCH SEARCH PARTIAL. ' + webFailureSentence + ' The ' + returnedCount + ' caller-supplied document(s) returned here are the only material this run produced, so this is a partial answer and not a complete one about this query.';
        } else if (web.status === 'no-results' && !returnedCount) {
          runStatus = 'no-results';
        }

        return {
          results: results,
          total: suppliedMatches.length,
          suppliedTotal: suppliedMatches.length,
          suppliedPage: suppliedPage.length,
          webTotal: web.results.length,
          counts: { supplied: suppliedMatches.length, web: web.results.length },
          webStatus: web.status,
          webNotice: web.notice,
          webError: web.error,
          webProviderCount: web.providerCount,
          webRequest: { tool: SEARCH_TOOL, query: rawQuery, maxResults: maxResults, searchType: searchType, freshness: freshness },
          source: source,
          status: runStatus,
          runError: runError,
          notice: notice
        };
      }

      async function getDocument(params: any) {
        const supplied = suppliedDocuments.find(function (d: any) { return d.id === params.documentId; }) || null;
        if (supplied) {
          return { document: Object.assign({}, supplied, { source: SUPPLIED_SOURCE }), foundIn: SUPPLIED_SOURCE, source: SUPPLIED_SOURCE, status: 'local', notice: 'Document returned from the request input supplied by the caller.' };
        }
        // Web results are pointers to public pages, not stored documents with retrievable
        // bodies, so this action deliberately does not resolve them. "Not found" is the
        // accurate answer: no document with that ID was supplied with the request.
        return { document: null, foundIn: null, source: SUPPLIED_SOURCE, status: 'local', notice: 'No matching supplied document was found for that ID. This action reads only the documents supplied with the request; web search results are public source pointers and are not retrievable documents.' };
      }

      async function getAnalystEstimates(params: any) {
        return { symbol: params.symbol || null, estimates: null, consensus: null, targetPrice: null, source: 'not-connected', notice: 'No analyst-data provider is connected; no estimates were returned.' };
      }

      async function getEarningsCalendar(params: any) {
        return { calendar: [], source: 'not-connected', notice: 'No earnings-calendar provider is connected; no calendar events were returned.' };
      }

      async function getEsgScores(params: any) {
        return { symbol: params.symbol || null, environmental: null, social: null, governance: null, overall: null, percentile: null, source: 'not-connected', notice: 'No ESG-data provider is connected; no scores were returned.' };
      }

      async function monitorAlerts(params: any) {
        return { alerts: [], source: 'not-connected', notice: 'No alert provider is connected; no alerts were returned.' };
      }

      async function createFinancialPlan(params: any) {
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

      async function runProjection(params: any) {
        const scenarios = Array.isArray(params.scenarios) ? params.scenarios : [];
        return {
          planId: params.planId || null,
          baseCase: params.baseCase || null,
          scenarios: scenarios.map((s: any) => ({ name: s.name || 'Supplied scenario', portfolioValue: finiteNumber(s.portfolioValue), successProbability: finiteNumber(s.successProbability) })),
          source: 'supplied-input',
          notice: scenarios.length ? 'Projection values are copied from supplied scenarios.' : 'No projection scenarios were supplied; no projection was calculated.'
        };
      }

      function buildPresent(action: any, result: any) {
        const L = [];

        if (action === 'search') {
          L.push('Research Search Results');
          L.push('=======================');
          L.push('Supplied documents matched: ' + (result.total || 0) + ' (showing page ' + (input.pagination && input.pagination.page ? input.pagination.page : 1) + ', limit ' + (input.pagination && input.pagination.limit ? input.pagination.limit : 10) + ').');
          L.push('Web results returned: ' + (result.webTotal || 0) + ' (web search status: ' + (result.webStatus || 'unknown') + ').');
          const allResults = result.results || [];
          const suppliedDocs = allResults.filter(function (d: any) { return d.source === SUPPLIED_SOURCE; });
          const webDocs = allResults.filter(function (d: any) { return d.source === WEB_SOURCE; });
          L.push('');
          if (suppliedDocs.length) {
            L.push('Supplied documents (caller-owned, searched in the request input):');
            suppliedDocs.forEach(function (d: any) {
              L.push('  - ' + (d.title || d.id || '(untitled)') + ' [' + (d.provider || 'unknown provider') + '] (' + (d.date || 'no date') + ')');
              if (d.rating) L.push('      Rating: ' + d.rating);
              if (d.sector) L.push('      Sector: ' + d.sector);
              if (d.summary) L.push('      Summary: ' + d.summary.slice(0, 160) + (d.summary.length > 160 ? '...' : ''));
            });
          } else {
            L.push('No supplied documents matched the query or the filters.');
          }
          L.push('');
          L.push('Web results (public search-engine snippets, not the supplied documents):');
          if (webDocs.length) {
            webDocs.forEach(function (d: any, i: any) {
              L.push('  ' + (i + 1) + '. ' + (d.title || '(untitled)'));
              L.push('     ' + (d.url || '(no url)'));
              if (d.snippet) L.push('     ' + d.snippet.slice(0, 240) + (d.snippet.length > 240 ? '...' : ''));
            });
          } else {
            L.push('  None. ' + (result.webNotice || 'No web search outcome was reported.'));
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
          const providerMap: Record<string, any> = {
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
            goals.forEach(function (g: any) { L.push('    - ' + g.name + ': target ' + fmtMoney(g.target) + ', current ' + fmtMoney(g.current)); });
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
            sc.forEach(function (s: any) {
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
            result.strategies.forEach(function (s: any) { L.push('    - ' + s); });
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
            result.recommendedActions.forEach(function (a: any) { L.push('    - ' + a); });
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
            result.recommendations.forEach(function (r: any) { L.push('    - ' + r); });
          } else {
            L.push('  No recommendations were supplied.');
          }
        } else if (action === 'goal-tracking') {
          L.push('Goal Tracking');
          L.push('=============');
          const goals = result.goals || [];
          if (goals.length) {
            goals.forEach(function (g: any) {
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

      function fmtNum(v: any, d?: any) { return v == null ? 'N/A' : Number(v).toFixed(d || 2); }

      try {
        const action = input.action;
        let result: any;
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
        ctx.store.save('research-planning', store);
        result.storePath = ctx.store.getFilePath('research-planning');
        const present = buildPresent(action, result);
        // The top level reports what actually happened. A web search that was not connected
        // or that errored is a failure of this system, not an empty result set: it is
        // success: false with a non-null error when nothing real came back at all, and
        // status 'partial' with a non-null error when caller-supplied documents were still
        // returned. It is never reported as a clean 'ok'. Only the search action computes
        // this; the other actions have no web dependency and keep their existing contract.
        const runStatus = (action === 'search' && result && result.status) ? result.status : 'ok';
        const runError = (action === 'search' && result && result.runError) ? result.runError : null;
        const runSuccess = runStatus === 'ok' || runStatus === 'no-results' || runStatus === 'partial';
        return { success: runSuccess, status: runStatus, data: result, error: runError, present: present };
      } catch (error) {
        const msg = ((error as any) && (error as any).message) ? (error as any).message : String(error);
        return { success: false, status: 'error', data: null, error: msg, present: [{
          id: 'error',
          title: 'Error',
          kind: 'text',
          body: 'Research & Planning action "' + (input.action || '(unspecified)') + '" failed: ' + msg
        }] };
      }
    }
  });

export { RESEARCH_PLANNING };
