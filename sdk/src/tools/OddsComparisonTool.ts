import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class OddsComparisonTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        oddsData: {
          type: 'object',
          description: 'Odds data for comparison analysis',
          properties: {
            sportsbookOdds: { type: 'object' },
            historicalOdds: { type: 'object' },
            currentOdds: { type: 'object' },
            marketData: { type: 'object' }
          }
        }
      },
      required: ['oddsData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        marketComparison: {
          type: 'object',
          description: 'Comparative analysis across sportsbooks',
          properties: {
            bestOdds: { type: 'object' },
            worstOdds: { type: 'object' },
            averageOdds: { type: 'object' }
          }
        },
        lineMovementAnalysis: { type: 'string', description: 'Analysis of odds line movements' },
        oddsChanges: { type: 'array', items: { type: 'object' } },
        comparisonReports: { type: 'string', description: 'Comprehensive odds comparison report' }
      }
    };

    super({
      name: 'OddsComparisonTool',
      description: 'Compares odds across multiple sportsbooks and analyzes line movements and market trends. Provides comparative analysis with line movement tracking and best odds identification.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async compareMarkets(oddsData: any, conversationId: string): Promise<any> {
    return this.execute({ oddsData }, conversationId);
  }

  public async analyzeLineMovements(oddsData: any, conversationId: string): Promise<any> {
    return this.execute({ oddsData }, conversationId);
  }

  public async trackOddsChanges(oddsData: any, conversationId: string): Promise<any> {
    return this.execute({ oddsData }, conversationId);
  }
}