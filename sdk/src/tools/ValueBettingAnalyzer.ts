import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ValueBettingAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        oddsData: {
          type: 'object',
          description: 'Odds data for value betting analysis',
          properties: {
            sportsbookOdds: { type: 'object' },
            marketOdds: { type: 'object' },
            historicalOdds: { type: 'object' },
            currentOdds: { type: 'object' }
          }
        }
      },
      required: ['oddsData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        valueOpportunities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              market: { type: 'string' },
              sportsbook: { type: 'string' },
              valueScore: { type: 'number' },
              recommendedAction: { type: 'string' }
            }
          }
        },
        marketEfficiency: { type: 'number', description: 'Market efficiency assessment score' },
        valueReports: { type: 'string', description: 'Comprehensive value betting analysis report' },
        bookmakerComparison: { type: 'object', description: 'Comparison of odds across bookmakers' }
      }
    };

    super({
      name: 'ValueBettingAnalyzer',
      description: 'Identifies value betting opportunities by comparing odds across markets and assessing probability. Provides value betting analysis with market efficiency assessment and opportunity recommendations.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async identifyOpportunities(oddsData: any, conversationId: string): Promise<any> {
    return this.execute({ oddsData }, conversationId);
  }

  public async analyzeValuePotential(oddsData: any, conversationId: string): Promise<any> {
    return this.execute({ oddsData }, conversationId);
  }

  public async evaluateMarketEfficiency(oddsData: any, conversationId: string): Promise<any> {
    return this.execute({ oddsData }, conversationId);
  }
}