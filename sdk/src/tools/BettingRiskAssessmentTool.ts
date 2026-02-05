import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class BettingRiskAssessmentTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bettorProfile: {
          type: 'object',
          description: 'Profile information about the bettor including risk tolerance and betting history',
          properties: {
            riskTolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
            bankrollSize: { type: 'number', description: 'Total available betting funds' },
            bettingHistory: {
              type: 'array',
              items: { type: 'object', properties: {
                betAmount: { type: 'number' },
                outcome: { type: 'string', enum: ['win', 'loss'] },
                date: { type: 'string' }
              }}
            }
          }
        }
      },
      required: ['bettorProfile']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        riskProfile: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] },
        riskAssessment: { type: 'string', description: 'Detailed risk assessment' },
        responsibleGamblingRecommendations: { type: 'array', items: { type: 'string' } },
        bettingMetrics: {
          type: 'object',
          properties: {
            winRate: { type: 'number' },
            riskExposure: { type: 'number' },
            recommendedUnitSize: { type: 'number' }
          }
        }
      }
    };

    super({
      name: 'BettingRiskAssessmentTool',
      description: 'Evaluates bettor risk tolerance and analyzes betting behavior patterns for responsible gambling. Provides comprehensive risk assessments with responsible gambling recommendations.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  // Additional convenience methods that map to the tool's capabilities
  public async analyzeRiskTolerance(
    bettorProfile: any,
    conversationId: string,
    options?: {
      profilerType?: 'standardized' | 'behavioral' | 'questionnaireBasedASTI';
      includeHistoricalContext?: boolean;
      assessIncreasingBets?: boolean;
      identifyChasing?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bettorProfile,
        profilerType: options?.profilerType,
        includeHistoricalContext: options?.includeHistoricalContext,
        assessIncreasingBets: options?.assessIncreasingBets,
        identifyChasing: options?.identifyChasing,
      },
      conversationId
    );
  }

  public async assessBettingHabits(
    historyData: any,
    conversationId: string,
    options?: {
      habitCategories?: ('frequency' | 'stakeSize' | 'chasing' | 'emotionalBetting' | 'pattern')[];
      identifyProblematicPatterns?: boolean;
      includeBehavioralFlags?: boolean;
      suggestInterventions?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bettorProfile: { bettingHistory: historyData },
        habitCategories: options?.habitCategories,
        identifyProblematicPatterns: options?.identifyProblematicPatterns,
        includeBehavioralFlags: options?.includeBehavioralFlags,
        suggestInterventions: options?.suggestInterventions,
      },
      conversationId
    );
  }

  public async determineRiskProfile(
    bettorProfile: any,
    conversationId: string,
    options?: {
      profileType?: 'conservative' | 'moderate' | 'aggressive' | 'reckless';
      includeResponsibleGamblingMetrics?: boolean;
      compareToNorms?: boolean;
      generateRiskScore?: boolean;
      recommendGamblingLimits?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bettorProfile,
        profileType: options?.profileType,
        includeResponsibleGamblingMetrics: options?.includeResponsibleGamblingMetrics,
        compareToNorms: options?.compareToNorms,
        generateRiskScore: options?.generateRiskScore,
        recommendGamblingLimits: options?.recommendGamblingLimits,
      },
      conversationId
    );
  }
}