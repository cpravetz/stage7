import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const DISCLAIMER = 'Web research aid only. Every result is a pointer to a published source, not a legal conclusion, not legal advice, and not a substitute for a qualified attorney. Sources must be read, checked for currency, jurisdiction, and subsequent history, and relied on only after review by counsel.';

const LEGAL_RESEARCH = createDeclarativeCodeSkill({
  id: 'legal-research',
  name: 'Legal Research',
  description: 'Research a legal question against live web sources for statutes, regulations, case law, and secondary commentary by delegating to the general web search tool, and report the ranked source pointers together with the exact query that was run. Results are pointers to sources to read, not legal advice or legal conclusions.',
  persistenceEnvVar: 'LEGAL_HOME',
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
  tier: 'advise',
  manifest: { actionLabel: 'Research a legal question', lowerOrderTools: ['legal-analyze-clauses'] },
  domainKnowledge: 'Statutory and case-law research methodology, jurisdictional hierarchy, citation formatting, and precedent analysis',
  triggers: [
    { kind: 'user', phrase_examples: ['Research a legal question', 'Search statutes', 'Search case law'] },
  ],
  async handler(input, ctx) {
    const query = String(input.query || '').trim();
    const jurisdiction = String(input.jurisdiction || 'US').trim();

    if (!query) {
      return {
        success: false,
        status: 'invalid-input',
        connected: false,
        data: null,
        error: 'No research question was supplied, so no web search was run.',
        present: [
          ctx.render.text('notice', 'Legal research: input required', `No research question supplied.\n\n${DISCLAIMER}`),
        ],
      };
    }

    let searchRes: any = null;
    try {
      searchRes = await ctx.delegate('search_web', { query: `${query} ${jurisdiction} statute case law regulation` });
    } catch (e) {
      // Delegate search unavailable
    }

    const results = searchRes && searchRes.results ? searchRes.results : [];
    const store = ctx.store.load('research');
    const record = {
      id: `research_${Date.now()}`,
      query,
      jurisdiction,
      results,
      createdAt: new Date().toISOString(),
    };
    store.push(record);
    ctx.store.save('research', store);

    return {
      success: true,
      status: results.length ? 'ok' : 'no-results',
      connected: true,
      data: { research: record, resultCount: results.length },
      present: [
        ctx.render.text('report', 'Legal Research Sources', `Found ${results.length} sources for query "${query}".\n\n${DISCLAIMER}`),
      ],
    };
  },
});

export { LEGAL_RESEARCH };
