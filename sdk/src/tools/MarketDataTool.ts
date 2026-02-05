import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class MarketDataTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MarketDataTool',
      description: 'Provides real-time and historical market data integration.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the market data tool.',
            enum: ['getMarketTrends', 'getIndexData', 'getEconomicIndicators', 'getCompanyNews'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific market data action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async getMarketTrends(
    sector: string,
    conversationId: string,
    options?: {
      timeRange?: {
        start?: string;
        end?: string;
        granularity?: 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly';
      };
      indicators?: ('price' | 'volume' | 'volatility' | 'moving_average' | 'rsi' | 'macd')[];
      compareAgainst?: ('sector_avg' | 'market_avg' | 'index')[];
      visualization?: 'line' | 'candlestick' | 'bar';
    }
  ): Promise<any> {
    return this.execute({
      action: 'getMarketTrends',
      payload: {
        sector,
        timeRange: options?.timeRange,
        indicators: options?.indicators,
        compareAgainst: options?.compareAgainst,
        visualization: options?.visualization,
      }
    }, conversationId);
  }

  public async getIndexData(
    indexId: string,
    conversationId: string,
    options?: {
      timeRange?: {
        start?: string;
        end?: string;
        granularity?: 'daily' | 'weekly' | 'monthly';
      };
      includeHistorical?: boolean;
      components?: boolean;  // Include index components
    }
  ): Promise<any> {
    return this.execute({
      action: 'getIndexData',
      payload: {
        indexId,
        timeRange: options?.timeRange,
        includeHistorical: options?.includeHistorical,
        components: options?.components,
      }
    }, conversationId);
  }

  public async getEconomicIndicators(
    indicators: string[],
    conversationId: string,
    options?: {
      timeRange?: {
        start?: string;
        end?: string;
      };
      countries?: string[];
      frequency?: 'monthly' | 'quarterly' | 'annual';
      historical?: boolean;
    }
  ): Promise<any> {
    return this.execute({
      action: 'getEconomicIndicators',
      payload: {
        indicators,
        timeRange: options?.timeRange,
        countries: options?.countries,
        frequency: options?.frequency,
        historical: options?.historical,
      }
    }, conversationId);
  }

  public async getCompanyNews(
    companyId: string,
    conversationId: string,
    options?: {
      newsTypes?: ('earnings' | 'press_release' | 'market_news' | 'analyst_report' | 'regulatory')[];
      timeRange?: { start?: string; end?: string };
      sentiment?: 'positive' | 'negative' | 'neutral' | 'all';
      limit?: number;
    }
  ): Promise<any> {
    return this.execute({
      action: 'getCompanyNews',
      payload: {
        companyId,
        newsTypes: options?.newsTypes,
        timeRange: options?.timeRange,
        sentiment: options?.sentiment,
        limit: options?.limit,
      }
    }, conversationId);
  }
}
