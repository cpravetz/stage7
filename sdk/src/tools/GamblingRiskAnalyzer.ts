import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class GamblingRiskAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bettingData: {
          type: 'object',
          description: 'Betting data for risk analysis',
          properties: {
            bettingHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  betAmount: { type: 'number' },
                  outcome: { type: 'string', enum: ['win', 'loss'] },
                  date: { type: 'string' },
                  sport: { type: 'string' }
                }
              }
            },
            bankrollHistory: { type: 'array', items: { type: 'number' } },
            riskProfile: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] }
          }
        }
      },
      required: ['bettingData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        riskExposure: { type: 'number', description: 'Overall risk exposure assessment' },
        behavioralPatterns: { type: 'string', description: 'Analysis of behavioral patterns' },
        financialImpact: { type: 'object', description: 'Financial impact assessment' },
        riskAnalysisReports: { type: 'string', description: 'Comprehensive risk analysis report' },
        gamblingScenarios: { type: 'object', description: 'Modeled gambling scenarios with risk assessments' }
      }
    };

    super({
      name: 'GamblingRiskAnalyzer',
      description: 'Evaluates overall gambling risk exposure and identifies harmful betting patterns. Provides risk exposure analysis with behavioral pattern assessment and harm minimization strategies.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async identifyRisks(bettingData: any, conversationId: string): Promise<any> {
    return this.execute({ bettingData }, conversationId);
  }

  public async analyzeBehavioralPatterns(bettingData: any, conversationId: string): Promise<any> {
    return this.execute({ bettingData }, conversationId);
  }

  public async assessFinancialImpact(bettingData: any, conversationId: string): Promise<any> {
    return this.execute({ bettingData }, conversationId);
  }
}