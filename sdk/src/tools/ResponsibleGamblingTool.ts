import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResponsibleGamblingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bettingHistory: {
          type: 'object',
          description: 'Betting history for responsible gambling analysis',
          properties: {
            bets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  betAmount: { type: 'number' },
                  outcome: { type: 'string', enum: ['win', 'loss'] },
                  date: { type: 'string' },
                  duration: { type: 'number', description: 'Duration of betting session in minutes' }
                }
              }
            },
            bankrollHistory: { type: 'array', items: { type: 'number' } },
            timePeriod: { type: 'string', description: 'Time period for analysis' }
          }
        }
      },
      required: ['bettingHistory']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        gamblingHabits: { type: 'string', description: 'Analysis of gambling behavior patterns' },
        riskFactors: { type: 'array', items: { type: 'string' } },
        responsibleGamblingReports: { type: 'string', description: 'Comprehensive responsible gambling analysis report' },
        problemIndicators: { type: 'object', description: 'Identified problem gambling indicators' },
        gamblingPatterns: { type: 'string', description: 'Analysis of gambling patterns' }
      }
    };

    super({
      name: 'ResponsibleGamblingTool',
      description: 'Assesses gambling behavior and identifies potential problem gambling indicators. Provides gambling behavior analysis with risk factor identification and responsible gambling guidance.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async analyzeHabits(bettingHistory: any, conversationId: string): Promise<any> {
    return this.execute({ bettingHistory }, conversationId);
  }

  public async identifyRiskFactors(bettingHistory: any, conversationId: string): Promise<any> {
    return this.execute({ bettingHistory }, conversationId);
  }

  public async evaluateGamblingPatterns(bettingHistory: any, conversationId: string): Promise<any> {
    return this.execute({ bettingHistory }, conversationId);
  }
}