import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

export interface SearchOptions {
  query: string;
  maxResults?: number;
  searchType?: 'web' | 'images' | 'news';
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class SearchExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: SearchOptions, credentials: ToolCredentials): Promise<{ success: boolean; results?: SearchResult[]; error?: string }> {
    const query = options.query.trim();
    if (!query) {
      return { success: false, error: 'Search query is required' };
    }

    const maxResults = options.maxResults || 10;

    const searchApiUrl = credentials.search_api_url || process.env.SEARCH_API_URL;
    const searchApiKey = credentials.search_api_key || process.env.SEARCH_API_KEY;

    if (!searchApiUrl) {
      return {
        success: false,
        error: 'Missing search API configuration. Provide search_api_url via Vault or environment.',
      };
    }

    try {
      const url = new URL(searchApiUrl);
      url.searchParams.set('q', query);
      url.searchParams.set('max_results', String(maxResults));
      if (options.searchType) {
        url.searchParams.set('type', options.searchType);
      }

      const headers: Record<string, string> = {};
      if (searchApiKey) {
        headers['Authorization'] = `Bearer ${searchApiKey}`;
        headers['X-API-Key'] = searchApiKey;
      }

      const response = await fetch(url.toString(), { headers });
      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `Search API returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json() as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
      const results: SearchResult[] = (data.results || []).map((r) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.snippet || '',
      }));

      logger.info({ query, resultCount: results.length }, 'Search completed');
      return { success: true, results };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ query, err: errorMessage }, 'Search failed');
      return { success: false, error: errorMessage };
    }
  }
}
