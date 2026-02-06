import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LiveBettingAdvisor extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        liveData: {
          type: 'object',
          description: 'Live game and odds data for betting recommendations',
          properties: {
            currentGameState: { type: 'object' },
            liveOdds: { type: 'object' },
            gameAnalysis: { type: 'object' },
            marketConditions: { type: 'object' },
            userPreferences: { type: 'object' }
          }
        }
      },
      required: ['liveData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bettingRecommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              market: { type: 'string' },
              recommendedBet: { type: 'string' },
              confidenceLevel: { type: 'number' },
              potentialReturn: { type: 'number' },
              riskAssessment: { type: 'string' }
            }
          }
        },
        liveOddsAnalysis: { type: 'string', description: 'Analysis of current live odds' },
        bettingMarkets: { type: 'object', description: 'Evaluation of current betting markets' },
        liveBettingReports: { type: 'string', description: 'Comprehensive live betting analysis report' },
        optimalOpportunities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              opportunity: { type: 'string' },
              priority: { type: 'number' },
              recommendedAction: { type: 'string' }
            }
          }
        }
      }
    };

    super({
      name: 'LiveBettingAdvisor',
      description: 'Provides real-time betting recommendations based on live game analysis and market conditions. Provides betting recommendations with market analysis and opportunity evaluation.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async generateRecommendations(liveData: any, conversationId: string): Promise<any> {
    return this.execute({ liveData }, conversationId);
  }

  public async analyzeLiveOdds(liveData: any, conversationId: string): Promise<any> {
    return this.execute({ liveData }, conversationId);
  }

  public async evaluateBettingMarkets(liveData: any, conversationId: string): Promise<any> {
    return this.execute({ liveData }, conversationId);
  }
}