import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InGameAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        liveData: {
          type: 'object',
          description: 'Live game data for in-game analysis',
          properties: {
            currentScore: { type: 'object' },
            gameClock: { type: 'string' },
            playerStats: { type: 'object' },
            teamStats: { type: 'object' },
            recentEvents: { type: 'array', items: { type: 'object' } },
            momentumIndicators: { type: 'object' }
          }
        }
      },
      required: ['liveData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        momentumAnalysis: { type: 'string', description: 'Analysis of current game momentum' },
        gameFlow: { type: 'string', description: 'Evaluation of current game flow' },
        bettingOpportunities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              opportunityType: { type: 'string' },
              confidenceScore: { type: 'number' },
              recommendedAction: { type: 'string' }
            }
          }
        },
        inGameReports: { type: 'string', description: 'Comprehensive in-game analysis report' },
        performanceTrends: { type: 'object', description: 'Identified performance trends during the game' }
      }
    };

    super({
      name: 'InGameAnalyzer',
      description: 'Analyzes live game dynamics, momentum shifts, and in-game betting opportunities. Provides in-game analysis with momentum assessment and betting opportunity identification.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async analyzeMomentum(liveData: any, conversationId: string): Promise<any> {
    return this.execute({ liveData }, conversationId);
  }

  public async evaluateGameFlow(liveData: any, conversationId: string): Promise<any> {
    return this.execute({ liveData }, conversationId);
  }

  public async identifyBettingOpportunities(liveData: any, conversationId: string): Promise<any> {
    return this.execute({ liveData }, conversationId);
  }
}