import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class OddsDataCollector extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        dataSources: {
          type: 'object',
          description: 'Specifications for sportsbook data sources',
          properties: {
            sportsbooks: { type: 'array', items: { type: 'string' } },
            sports: { type: 'array', items: { type: 'string' } },
            leagues: { type: 'array', items: { type: 'string' } },
            markets: { type: 'array', items: { type: 'string' } },
            timeRange: { type: 'string', description: 'Time range for odds data' }
          }
        }
      },
      required: ['dataSources']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        oddsData: {
          type: 'object',
          description: 'Processed odds data from multiple sportsbooks',
          properties: {
            bySportsbook: { type: 'object' },
            byMarket: { type: 'object' },
            accuracyMetrics: { type: 'object' }
          }
        },
        oddsReports: { type: 'string', description: 'Comprehensive odds data report' },
        marketDatabaseUpdate: { type: 'object', description: 'Updated market database information' }
      }
    };

    super({
      name: 'OddsDataCollector',
      description: 'Retrieves and processes odds data from multiple sportsbooks for comprehensive market analysis. Provides processed odds data with accuracy validation and market comparisons.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async gatherInformation(
    dataSources: any,
    conversationId: string,
    options?: {
      updateFrequency?: 'realtime' | 'hourly' | 'daily';
      includeHistoricalOdds?: boolean;
      validateAccuracy?: boolean;
      detectArbitrageOpportunities?: boolean;
      generateComparativeReport?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        dataSources,
        updateFrequency: options?.updateFrequency,
        includeHistoricalOdds: options?.includeHistoricalOdds,
        validateAccuracy: options?.validateAccuracy,
        detectArbitrageOpportunities: options?.detectArbitrageOpportunities,
        generateComparativeReport: options?.generateComparativeReport,
      },
      conversationId
    );
  }

  public async processOddsData(
    dataSources: any,
    conversationId: string,
    options?: {
      normalizationMethod?: 'americanToDecimal' | 'decimalToAmerican' | 'impliedProbability';
      filterByMarketPopularity?: boolean;
      detectLineMovement?: boolean;
      calculateSharpMoves?: boolean;
      timeSeriesAnalysis?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        dataSources,
        normalizationMethod: options?.normalizationMethod,
        filterByMarketPopularity: options?.filterByMarketPopularity,
        detectLineMovement: options?.detectLineMovement,
        calculateSharpMoves: options?.calculateSharpMoves,
        timeSeriesAnalysis: options?.timeSeriesAnalysis,
      },
      conversationId
    );
  }
}