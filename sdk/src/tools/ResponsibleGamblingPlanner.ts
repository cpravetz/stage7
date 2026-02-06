import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResponsibleGamblingPlanner extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        riskProfile: {
          type: 'object',
          description: 'Risk profile for responsible gambling planning',
          properties: {
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            bettingHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  betAmount: { type: 'number' },
                  outcome: { type: 'string', enum: ['win', 'loss'] },
                  date: { type: 'string' }
                }
              }
            },
            bankrollSize: { type: 'number' },
            gamblingHabits: { type: 'string', description: 'Description of current gambling habits' }
          }
        }
      },
      required: ['riskProfile']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        responsibleGamblingStrategies: { type: 'string', description: 'Developed responsible gambling strategies' },
        bettingLimits: {
          type: 'object',
          description: 'Recommended betting limits',
          properties: {
            dailyLimit: { type: 'number' },
            weeklyLimit: { type: 'number' },
            monthlyLimit: { type: 'number' },
            perBetLimit: { type: 'number' }
          }
        },
        selfExclusionPlans: { type: 'string', description: 'Self-exclusion and cooling-off plans' },
        responsibleGamblingPlans: { type: 'string', description: 'Comprehensive responsible gambling plan' },
        behaviorTracking: { type: 'object', description: 'Gambling behavior tracking recommendations' }
      }
    };

    super({
      name: 'ResponsibleGamblingPlanner',
      description: 'Develops strategies to promote responsible gambling and minimize potential harm. Provides responsible gambling strategies with behavior tracking and harm minimization guidance.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async developStrategies(riskProfile: any, conversationId: string): Promise<any> {
    return this.execute({ riskProfile }, conversationId);
  }

  public async createBettingLimits(riskProfile: any, conversationId: string): Promise<any> {
    return this.execute({ riskProfile }, conversationId);
  }

  public async designSelfExclusionPlans(riskProfile: any, conversationId: string): Promise<any> {
    return this.execute({ riskProfile }, conversationId);
  }
}