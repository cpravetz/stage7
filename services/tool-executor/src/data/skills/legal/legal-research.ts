import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const DISCLAIMER = 'Web research aid only. Every result is a pointer to a published source, not a legal conclusion, not legal advice, and not a substitute for a qualified attorney. Sources must be read, checked for currency, jurisdiction, and subsequent history, and relied on only after review by counsel.';

// search_web is a native core tool rather than a skill in this assistant's array, so its id
// is held in a constant instead of being inlined at the call site. That keeps every mention
// of it greppable and keeps the request shape in one place.
const LEGAL_RESEARCH_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' && __tool_input ? __tool_input : {};
  const NL = '\\n';
  const SEARCH_TOOL = 'search_web';
  const DISCLAIMER = ${JSON.stringify(DISCLAIMER)};
  const fs = require('fs');
  const path = require('path');

  const query = String(input.query || '').trim();
  const jurisdiction = String(input.jurisdiction || 'US').trim();
  const dateRange = input.dateRange && typeof input.dateRange === 'object' ? input.dateRange : {};
  const sources = Array.isArray(input.sources) ? input.sources.map(function (s) { return String(s).trim(); }).filter(Boolean) : [];
  const maxResults = Math.max(1, Math.min(50, Number(input.maxResults || 10)));
  const searchType = ['web', 'images', 'news'].indexOf(input.searchType) >= 0 ? String(input.searchType) : 'web';
  const executeTool = typeof __execute_tool === 'function' ? __execute_tool : null;

  const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
  const researchPath = path.join(baseDir, 'research.json');
  fs.mkdirSync(baseDir, { recursive: true });
  const store = fs.existsSync(researchPath) ? JSON.parse(fs.readFileSync(researchPath, 'utf8')) : [];

  function toIsoDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  const startDate = toIsoDate(dateRange.start);
  const endDate = toIsoDate(dateRange.end);

  // Freshness is only meaningful when the caller supplied a lower bound. A range reaching
  // further back than a year gets no freshness filter rather than a misleading one.
  // The value below is a real recency filter for the providers that can honor one: Google
  // maps it onto dateRestrict (day, week, month, year), LangSearch and SearxNG apply it
  // directly. The DuckDuckGo Instant Answer API has no recency parameter, so that provider
  // cannot apply it and logs a warning naming the dropped value. The provider that actually
  // served the query is not surfaced back to this skill, so this is sent as a request and
  // applied per provider, never a guarantee that the bound was enforced.
  let freshness = null;
  if (startDate) {
    const ageDays = (Date.now() - new Date(startDate + 'T00:00:00Z').getTime()) / 86400000;
    if (ageDays <= 1) freshness = 'day';
    else if (ageDays <= 7) freshness = 'week';
    else if (ageDays <= 31) freshness = 'month';
    else if (ageDays <= 366) freshness = 'year';
  }

  const queryParts = [query];
  if (jurisdiction) queryParts.push(jurisdiction);
  queryParts.push('statute case law regulation');
  sources.forEach(function (source) { queryParts.push(source); });
  if (startDate) queryParts.push('after:' + startDate);
  if (endDate) queryParts.push('before:' + endDate);
  const searchQuery = queryParts.join(' ').replace(/\\s+/g, ' ').trim();

  const queryConstruction = {
    searchQuery: searchQuery,
    baseQuery: query,
    jurisdiction: jurisdiction,
    sourceTerms: sources,
    dateBounds: { start: startDate, end: endDate },
    freshness: freshness,
    note: 'The web search tool takes a single free-text query, so the jurisdiction and the requested source types are carried in the query text. The after: and before: tokens stay in the query as well: they are the only way to express the end date, which the recency filter cannot encode, and the only date control the DuckDuckGo provider honors at all. Freshness is also sent as a separate recency filter, currently ' + (freshness || 'not set (no lower bound was given, or the range reaches further back than a year)') + '. That filter is applied by the Google, LangSearch and SearxNG providers. It cannot be applied by DuckDuckGo, whose Instant Answer API has no recency parameter and which logs a warning naming the dropped value. The provider that actually served this query is not reported back here, so treat the recency bound as applied per provider rather than assured, and check the search tool logs if the bound is material.',
  };

  const searchRequest = {
    tool: SEARCH_TOOL,
    query: searchQuery,
    maxResults: maxResults,
    searchType: searchType,
    freshness: freshness,
  };

  function baseResearch(extra) {
    return Object.assign({
      id: 'research_' + Date.now(),
      query: query,
      jurisdiction: jurisdiction,
      sources: sources,
      dateRange: { start: startDate, end: endDate },
      searchQuery: searchQuery,
      queryConstruction: queryConstruction,
      searchRequest: searchRequest,
      createdAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
    }, extra || {});
  }

  function persist(research) {
    store.push(research);
    fs.writeFileSync(researchPath, JSON.stringify(store, null, 2));
  }

  function emit(payload) {
    console.log(JSON.stringify(payload));
  }

  function unavailable(status, notice, title) {
    const research = baseResearch({ resultCount: 0, results: [], source: 'local', status: status, notice: notice });
    persist(research);
    emit({
      success: false,
      status: status,
      connected: false,
      data: { research: research, storePath: researchPath, resultCount: 0 },
      error: notice,
      present: [{ id: 'notice', title: title, kind: 'text', body: notice + NL + NL + DISCLAIMER }],
    });
  }

  function searchFailed(message) {
    const notice = 'The web search was attempted and did not return results because it failed. This is not an empty result set: ' + message;
    const research = baseResearch({ resultCount: 0, results: [], source: SEARCH_TOOL, status: 'error', notice: notice, searchError: message });
    persist(research);
    emit({
      success: false,
      status: 'error',
      connected: true,
      data: { research: research, storePath: researchPath, resultCount: 0 },
      error: message,
      present: [{ id: 'notice', title: 'Legal research: search failed', kind: 'text', body: notice + NL + NL + 'Query: ' + searchQuery + NL + NL + DISCLAIMER }],
    });
  }

  if (!query) {
    unavailable(
      'invalid-input',
      'No research question was supplied, so no web search was run and no sources were fetched. Supply a query describing the legal question to research.',
      'Legal research: input required'
    );
    return;
  }

  if (!executeTool) {
    unavailable(
      'not-connected',
      'No web search is available to this skill: the general "' + SEARCH_TOOL + '" tool is not registered in this environment, so nothing was searched and no external sources were fetched. This is a missing capability, not a configured-but-idle provider. The research request and the exact query that would be run have been recorded.',
      'Legal research: no web search available'
    );
    return;
  }

  let response = null;
  try {
    response = await executeTool(SEARCH_TOOL, {
      query: searchQuery,
      maxResults: maxResults,
      searchType: searchType,
      freshness: freshness,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    searchFailed(message);
    return;
  }

  if (!response || response.error || response.success === false) {
    const message = String((response && (response.error || response.message)) || 'The web search tool returned no usable response.');
    searchFailed(message);
    return;
  }

  const rawResults = Array.isArray(response.results) ? response.results : [];
  const results = rawResults
    .filter(function (item) { return item && typeof item === 'object' && item.url; })
    .slice(0, maxResults)
    .map(function (item, index) {
      return {
        title: String(item.title || ('Result ' + (index + 1))),
        url: String(item.url),
        snippet: String(item.snippet || ''),
      };
    });

  if (results.length === 0) {
    const notice = 'The web search ran and the providers returned no results for this query. That is a real answer from the search providers, not a failure and not a suppressed error.';
    const research = baseResearch({ resultCount: 0, results: [], source: SEARCH_TOOL, status: 'no-results', notice: notice, providerResultCount: Number(response.count) || 0 });
    persist(research);
    emit({
      success: true,
      status: 'no-results',
      connected: true,
      data: { research: research, storePath: researchPath, resultCount: 0 },
      present: [{ id: 'report', title: 'Legal research: no sources found', kind: 'text', body: notice + NL + NL + 'Query: ' + searchQuery + NL + NL + DISCLAIMER }],
    });
    return;
  }

  const resultLines = results.map(function (item, index) {
    return '  ' + (index + 1) + '. ' + item.title + NL + '     ' + item.url + (item.snippet ? NL + '     ' + item.snippet : '');
  });
  const notice = 'Returned ' + results.length + ' web ' + (results.length === 1 ? 'source' : 'sources') + ' for the query built from this request. These are pointers to published sources, not legal conclusions.';
  const research = baseResearch({
    resultCount: results.length,
    results: results,
    source: SEARCH_TOOL,
    status: 'ok',
    notice: notice,
    providerResultCount: Number(response.count) || results.length,
  });
  persist(research);
  emit({
    success: true,
    status: 'ok',
    connected: true,
    data: { research: research, storePath: researchPath, resultCount: results.length },
    present: [{
      id: 'report',
      title: 'Legal research sources',
      kind: 'text',
      body: ['Legal research: ' + results.length + ' ' + (results.length === 1 ? 'source' : 'sources') + ' found.', NL, 'Query: ' + searchQuery, NL, 'Sources:', resultLines.join(NL), NL, DISCLAIMER].join(NL),
    }],
  });
})();`;

const LEGAL_RESEARCH = createCodeSkill({
  id: 'legal-research',
  name: 'Legal Research',
  description: 'Research a legal question against live web sources for statutes, regulations, case law, and secondary commentary by delegating to the general web search tool, and report the ranked source pointers together with the exact query that was run. Results are pointers to sources to read, not legal advice or legal conclusions.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: LEGAL_RESEARCH_SOURCE,
    persistenceEnv: 'LEGAL_HOME',
    lowerOrderTools: ['search_web'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      query: SchemaProps.text({ description: 'Search query or question for legal research' }),
      jurisdiction: SchemaProps.text({ description: 'Legal jurisdiction to search (e.g., US, CA, NY, EU, UK)' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Date range filter for results' }),
      sources: SchemaProps.stringArray({ description: 'Specific sources to search (e.g., statutes, cases, regulations)' }),
      maxResults: SchemaProps.integer({ description: 'Maximum number of results to return', minimum: 1, maximum: 50, default: 10 }),
      searchType: SchemaProps.select(['web', 'images', 'news'], { description: 'Type of web search to run', default: 'web' }),
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: 'string' },
      connected: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          research: { type: 'object' },
          storePath: { type: 'string' },
          resultCount: { type: 'number' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  isSkill: true,
  tier: 'aid',
  domainKnowledge: 'Statutory and case-law research methodology, jurisdictional hierarchy, citation formatting, and precedent analysis',
  triggers: [
    { kind: 'user', phrase_examples: ['Research a legal question', 'Search statutes', 'Search case law'] },
  ],
});

export { LEGAL_RESEARCH };
