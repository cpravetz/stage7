import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PerformanceModelingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        performanceData: {
          type: 'object',
          description: 'Team and player performance data for modeling',
          properties: {
            teamStats: { type: 'object' },
            playerStats: { type: 'object' },
            historicalPerformance: { type: 'object' },
            currentForm: { type: 'object' },
            oppositionAnalysis: { type: 'object' }
          }
        }
      },
      required: ['performanceData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        teamAnalysis: { type: 'string', description: 'Detailed team performance analysis' },
        playerAnalysis: { type: 'string', description: 'Detailed player performance analysis' },
        performanceTrends: { type: 'object', description: 'Identified performance trends' },
        modelingReports: { type: 'string', description: 'Comprehensive performance modeling report' },
        historicalComparison: { type: 'object', description: 'Comparison with historical performance' }
      }
    };

    super({
      name: 'PerformanceModelingTool',
      description: 'Analyzes team and player performance using advanced statistical modeling techniques. Provides statistical models with trend analysis and comparative performance insights.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async analyzeTeams(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ performanceData }, conversationId);
  }

  public async evaluatePlayerStats(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ performanceData }, conversationId);
  }

  public async identifyPerformanceTrends(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ performanceData }, conversationId);
  }
}