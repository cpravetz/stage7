import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class SportsDataAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        sportsData: {
          type: 'object',
          description: 'Sports data including team performance, player statistics, and market trends',
          properties: {
            sport: { type: 'string', enum: ['football', 'basketball', 'baseball', 'hockey', 'soccer', 'tennis', 'golf'] },
            league: { type: 'string', description: 'Specific league or competition' },
            teams: { type: 'array', items: { type: 'string' } },
            timePeriod: { type: 'string', description: 'Time period for analysis (e.g., "last 10 games", "current season")' },
            statistics: {
              type: 'object',
              description: 'Statistical data for analysis',
              properties: {
                winLossRecords: { type: 'object' },
                scoringAverages: { type: 'object' },
                defensiveStats: { type: 'object' },
                playerPerformance: { type: 'array', items: { type: 'object' } }
              }
            }
          }
        }
      },
      required: ['sportsData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        trendAnalysis: { type: 'string', description: 'Analysis of current sports trends' },
        teamPerformance: { type: 'object', description: 'Detailed team performance analysis' },
        bettingOpportunities: { type: 'array', items: { type: 'string' } },
        sportsReport: { type: 'string', description: 'Comprehensive sports analysis report' },
        performanceTrends: { type: 'object', description: 'Identified performance trends' }
      }
    };

    super({
      name: 'SportsDataAnalyzer',
      description: 'Analyzes sports trends, team performance, and betting market dynamics across leagues and sports. Provides analytical reports with betting insights and opportunity identification.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async analyzeTrends(sportsData: any, conversationId: string): Promise<any> {
    return this.execute({ sportsData }, conversationId);
  }

  public async evaluateTeamPerformance(sportsData: any, conversationId: string): Promise<any> {
    return this.execute({ sportsData }, conversationId);
  }

  public async identifyBettingOpportunities(sportsData: any, conversationId: string): Promise<any> {
    return this.execute({ sportsData }, conversationId);
  }
}