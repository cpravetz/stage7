import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PerformanceOptimizer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        performanceData: {
          type: 'object',
          description: 'Betting performance data for optimization',
          properties: {
            bettingHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  betAmount: { type: 'number' },
                  odds: { type: 'number' },
                  outcome: { type: 'string', enum: ['win', 'loss'] },
                  sport: { type: 'string' },
                  market: { type: 'string' }
                }
              }
            },
            currentStrategy: { type: 'string', description: 'Current betting strategy' },
            riskProfile: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] },
            bankrollSize: { type: 'number', description: 'Current bankroll size' }
          }
        }
      },
      required: ['performanceData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        optimizedStrategy: { type: 'string', description: 'Optimized betting strategy' },
        optimizationReports: { type: 'string', description: 'Comprehensive optimization analysis report' },
        riskManagementGuidance: { type: 'string', description: 'Risk management recommendations' },
        performanceSimulation: {
          type: 'object',
          description: 'Simulated performance metrics',
          properties: {
            projectedRoi: { type: 'number' },
            riskExposure: { type: 'number' },
            recommendedChanges: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    };

    super({
      name: 'PerformanceOptimizer',
      description: 'Generates optimized betting strategies based on performance history and risk profile. Provides optimized betting strategies with performance simulations and risk management guidance.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async generateRecommendations(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ performanceData }, conversationId);
  }

  public async optimizeBettingApproach(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ performanceData }, conversationId);
  }

  public async simulateBettingPerformance(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ performanceData }, conversationId);
  }
}