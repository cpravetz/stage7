import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

export interface SearchOptions {
  query: string;
  maxResults?: number;
  searchType?: 'web' | 'images' | 'news';
  freshness?: 'day' | 'week' | 'month' | 'year';
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchProvider {
  name: string;
  performanceScore: number;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
  searchWithRetry(query: string, options: SearchOptions): Promise<SearchResult[]>;
  updatePerformance(success: boolean): void;
}

const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

abstract class BaseSearchProvider implements SearchProvider {
  name: string;
  performanceScore: number;

  constructor(name: string, initialScore: number) {
    this.name = name;
    this.performanceScore = initialScore;
  }

  abstract search(query: string, options: SearchOptions): Promise<SearchResult[]>;

  updatePerformance(success: boolean): void {
    if (success) {
      this.performanceScore = Math.min(100, this.performanceScore + 5);
    } else {
      this.performanceScore = Math.max(0, this.performanceScore - 20);
    }
  }

  async searchWithRetry(query: string, options: SearchOptions): Promise<SearchResult[]> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const results = await this.search(query, options);
        this.updatePerformance(true);
        return results;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn({ provider: this.name, query, attempt, error: lastError.message }, 'Search attempt failed');
        
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
    
    this.updatePerformance(false);
    throw lastError!;
  }
}

class GoogleSearchProvider extends BaseSearchProvider {
  private apiKey: string;
  private searchEngineId: string;
  private baseUrl = 'https://www.googleapis.com/customsearch/v1';

  constructor(credentials: ToolCredentials) {
    super('Google', 95);
    this.apiKey = credentials.google_api_key || process.env.GOOGLE_API_KEY || '';
    this.searchEngineId = credentials.google_search_engine_id || process.env.GOOGLE_SEARCH_ENGINE_ID || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.searchEngineId && this.searchEngineId !== 'YOUR_GOOGLE_CSE_ID');
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error('Google API credentials not configured or are placeholders');
    }

    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: query,
      num: String(Math.min(options.maxResults || 10, 10)),
      safe: 'medium',
      fields: 'items(title,link,snippet)',
    });

    if (options.searchType === 'images') {
      params.set('searchType', 'image');
    }

    const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google API returned ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json() as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
    
    if (!data.items) {
      return [];
    }

    return data.items.map(item => ({
      title: item.title || '',
      url: item.link || '',
      snippet: item.snippet || '',
    }));
  }
}

class LangSearchProvider extends BaseSearchProvider {
  private apiKey: string;
  private baseUrl: string;
  private lastRequestTime = 0;
  private readonly rateLimitMs = 1000;

  constructor(credentials: ToolCredentials) {
    super('LangSearch', 100);
    this.apiKey = credentials.langsearch_api_key || process.env.LANGSEARCH_API_KEY || '';
    this.baseUrl = process.env.LANGSEARCH_API_URL || 'https://api.langsearch.com';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error('LangSearch API key not configured');
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitMs) {
      await sleep(this.rateLimitMs - timeSinceLastRequest);
    }

    const payload = {
      query,
      count: options.maxResults || 10,
      freshness: options.freshness,
    };

    const response = await fetch(`${this.baseUrl}/v1/web-search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    this.lastRequestTime = Date.now();

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LangSearch API returned ${response.status}: ${text.slice(0, 200)}`);
    }

    interface LangSearchResponse {
      data?: {
        webPages?: { value: Array<{ name?: string; url?: string; snippet?: string }> };
        results?: Array<{ title?: string; url?: string; snippet?: string }>;
        items?: Array<{ title?: string; url?: string; snippet?: string }>;
      };
      results?: Array<{ title?: string; url?: string; snippet?: string }>;
      items?: Array<{ title?: string; url?: string; snippet?: string }>;
      webPages?: { value: Array<{ name?: string; url?: string; snippet?: string }> };
    }
    
    const fullResponse = await response.json() as LangSearchResponse;
    const data = fullResponse.data || fullResponse;

    const results: SearchResult[] = [];
    
    if (data.webPages?.value) {
      for (const item of data.webPages.value) {
        if (item.name && item.url) {
          results.push({
            title: item.name,
            url: item.url,
            snippet: item.snippet || '',
          });
        }
      }
    } else if (data.results) {
      for (const item of data.results) {
        if (item.title && item.url) {
          results.push({
            title: item.title,
            url: item.url,
            snippet: item.snippet || '',
          });
        }
      }
    } else if (data.items) {
      for (const item of data.items) {
        if (item.title && item.url) {
          results.push({
            title: item.title,
            url: item.url,
            snippet: item.snippet || '',
          });
        }
      }
    } else if (Array.isArray(data)) {
      for (const item of data) {
        if (item.title && item.url) {
          results.push({
            title: item.title,
            url: item.url,
            snippet: item.snippet || '',
          });
        }
      }
    }

    return results;
  }
}

class DuckDuckGoProvider extends BaseSearchProvider {
  private baseUrl = 'https://api.duckduckgo.com';

  constructor() {
    super('DuckDuckGo', 80);
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });

    const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo API returned ${response.status}`);
    }

    const data = await response.json() as {
      AbstractURL?: string;
      AbstractText?: string;
      Heading?: string;
      RelatedTopics?: Array<{ FirstURL?: string; Text?: string }>;
    };

    const results: SearchResult[] = [];

    if (data.AbstractURL && data.AbstractText) {
      results.push({
        title: data.Heading || 'Abstract',
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    for (const topic of data.RelatedTopics || []) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.split(' - ')[0],
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      }
    }

    return results.slice(0, options.maxResults || 10);
  }
}

class SearxNGProvider extends BaseSearchProvider {
  private baseUrls: string[];
  private currentUrlIndex = 0;

  constructor(credentials: ToolCredentials) {
    super('SearxNG', 90);
    const customUrl = credentials.searxng_url || process.env.SEARXNG_URL;
    this.baseUrls = customUrl ? [customUrl] : ['http://searxng:8080'];
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const initialIndex = this.currentUrlIndex;
    let lastError: Error | undefined;

    for (let i = 0; i < this.baseUrls.length; i++) {
      const instanceIndex = (initialIndex + i) % this.baseUrls.length;
      const searxngUrl = `${this.baseUrls[instanceIndex]}/search`;

      try {
        const params = new URLSearchParams({
          q: query,
          categories: 'general',
          language: 'en',
          engines: 'google,bing,brave,duckduckgo',
          format: 'json',
        });

        const response = await fetch(`${searxngUrl}?${params.toString()}`, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 Stage7SearchBot/1.0', 'Accept': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };

        const results: SearchResult[] = [];
        for (const item of data.results || []) {
          if (item.title && item.url) {
            results.push({
              title: item.title,
              url: item.url,
              snippet: item.content || '',
            });
          }
        }

        if (results.length > 0) {
          this.currentUrlIndex = instanceIndex;
          return results.slice(0, options.maxResults || 10);
        }

        logger.warn({ url: searxngUrl }, 'SearxNG instance returned no results');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn({ url: searxngUrl, error: lastError.message }, 'SearxNG instance failed');
      }
    }

    throw lastError || new Error('All SearxNG instances failed');
  }
}

export class SearchExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: SearchOptions, credentials: ToolCredentials): Promise<{ success: boolean; results?: SearchResult[]; error?: string }> {
    const query = options.query.trim();
    if (!query) {
      return { success: false, error: 'Search query is required' };
    }

    const providers: SearchProvider[] = [
      new GoogleSearchProvider(credentials),
      new LangSearchProvider(credentials),
      new DuckDuckGoProvider(),
      new SearxNGProvider(credentials),
    ];

    const configuredProviders = providers.filter(p => {
      if (p instanceof GoogleSearchProvider) return p.isConfigured();
      if (p instanceof LangSearchProvider) return p.isConfigured();
      if (p instanceof SearxNGProvider) return true;
      return true;
    });

    if (configuredProviders.length === 0) {
      return {
        success: false,
        error: 'No search providers configured. Provide Google API credentials, LangSearch API key, or SearxNG URL.',
      };
    }

    const sortedProviders = configuredProviders.sort((a, b) => b.performanceScore - a.performanceScore);
    const allErrors: string[] = [];

    for (const provider of sortedProviders) {
      logger.info({ query, provider: provider.name, performanceScore: provider.performanceScore }, 'Attempting search');
      
      try {
        const results = await provider.searchWithRetry(query, options);
        
        if (results.length > 0) {
          logger.info({ query, provider: provider.name, resultCount: results.length }, 'Search completed');
          return { success: true, results };
        } else {
          logger.warn({ query, provider: provider.name }, 'Provider returned no results');
          allErrors.push(`${provider.name}: no results`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ query, provider: provider.name, error: errorMessage }, 'Search provider failed');
        allErrors.push(`${provider.name}: ${errorMessage}`);
      }
    }

    return {
      success: false,
      error: `All search providers failed: ${allErrors.join('; ')}`,
    };
  }
}