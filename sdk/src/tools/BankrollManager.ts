import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class BankrollManager extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bankrollData: {
          type: 'object',
          description: 'Bankroll and betting data for management',
          properties: {
            currentBankroll: { type: 'number', description: 'Current available funds' },
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
            riskTolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
            bettingStrategy: { type: 'string', description: 'Current betting strategy' }
          }
        }
      },
      required: ['bankrollData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bankrollStatus: {
          type: 'object',
          description: 'Current bankroll status and analysis',
          properties: {
            currentBalance: { type: 'number' },
            riskExposure: { type: 'number' },
            recommendedUnitSize: { type: 'number' },
            unitSizePercentage: { type: 'number' }
          }
        },
        bankrollReports: { type: 'string', description: 'Comprehensive bankroll analysis report' },
        allocationRecommendations: { type: 'string', description: 'Bankroll allocation strategies' }
      }
    };

    super({
      name: 'BankrollManager',
      description: 'Manages bankroll allocation, risk exposure, and betting unit sizing based on performance. Provides risk exposure analysis with allocation recommendations and unit sizing guidance.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async assessStatus(
    bankrollData: any,
    conversationId: string,
    options?: {
      includeHealthScore?: boolean;
      projectionTimeframe?: 'week' | 'month' | 'quarter' | 'year';
      flagLowBalance?: boolean;
      flagHighRiskExposure?: boolean;
      generateAlertThresholds?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bankrollData,
        includeHealthScore: options?.includeHealthScore,
        projectionTimeframe: options?.projectionTimeframe,
        flagLowBalance: options?.flagLowBalance,
        flagHighRiskExposure: options?.flagHighRiskExposure,
        generateAlertThresholds: options?.generateAlertThresholds,
      },
      conversationId
    );
  }

  public async calculateUnitSize(
    bankrollData: any,
    conversationId: string,
    options?: {
      unitSizingMethod?: 'percentageBased' | 'fixedAmount' | 'kellyFraction' | 'conservative';
      percentageOfBankroll?: number;
      kellyFractionValue?: number;
      minimumUnitSize?: number;
      includeBonus?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bankrollData,
        unitSizingMethod: options?.unitSizingMethod,
        percentageOfBankroll: options?.percentageOfBankroll,
        kellyFractionValue: options?.kellyFractionValue,
        minimumUnitSize: options?.minimumUnitSize,
        includeBonus: options?.includeBonus,
      },
      conversationId
    );
  }

  public async analyzeRiskExposure(
    bankrollData: any,
    conversationId: string,
    options?: {
      exposureThreshold?: number;
      includeComparingToNorms?: boolean;
      suggestRiskMitigation?: boolean;
      timeHorizon?: 'immediate' | 'shortTerm' | 'longTerm';
      identifyRuinRisk?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bankrollData,
        exposureThreshold: options?.exposureThreshold,
        includeComparingToNorms: options?.includeComparingToNorms,
        suggestRiskMitigation: options?.suggestRiskMitigation,
        timeHorizon: options?.timeHorizon,
        identifyRuinRisk: options?.identifyRuinRisk,
      },
      conversationId
    );
  }
}