import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FinancialPlanner extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FinancialPlanner',
      description: 'Creates comprehensive financial plans integrating investment strategies with overall financial objectives.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the financial planner.',
            enum: ['createPlan', 'integrateInvestmentStrategies', 'developSavingsPlans', 'generateFinancialRoadmaps', 'trackPlanProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific financial planning action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createPlan(
    financialData: any,
    conversationId: string,
    options?: {
      planningHorizon?: '1-3years' | '5years' | '10years' | '20years' | 'retirement';
      scenarioType?: 'conservative' | 'moderate' | 'aggressive';
      includeScenarios?: {
        marketDownturn?: boolean;
        inflation?: boolean;
        emergencies?: boolean;
      };
      goalPriority?: ('savings' | 'investment' | 'debt_reduction' | 'wealth_building')[];
      reportFormat?: 'visual_plan' | 'detailed_analysis' | 'comparison_matrix';
    }
  ): Promise<any> {
    return this.execute({
      action: 'createPlan',
      payload: {
        financialData,
        planningHorizon: options?.planningHorizon,
        scenarioType: options?.scenarioType,
        includeScenarios: options?.includeScenarios,
        goalPriority: options?.goalPriority,
        reportFormat: options?.reportFormat,
      }
    }, conversationId);
  }

  public async integrateInvestmentStrategies(
    conversationId: string,
    options?: {
      assetAllocation?: Record<string, number>;  // e.g., { "stocks": 60, "bonds": 30, "cash": 10 }
      riskTolerance?: 'low' | 'medium' | 'high';
      investmentTimeframe?: string;
      preferredAssetClasses?: string[];
      excludeAssets?: string[];
    }
  ): Promise<any> {
    return this.execute({
      action: 'integrateInvestmentStrategies',
      payload: {
        assetAllocation: options?.assetAllocation,
        riskTolerance: options?.riskTolerance,
        investmentTimeframe: options?.investmentTimeframe,
        preferredAssetClasses: options?.preferredAssetClasses,
        excludeAssets: options?.excludeAssets,
      }
    }, conversationId);
  }

  public async developSavingsPlans(
    conversationId: string,
    options?: {
      savingsGoal?: number;
      targetTimeframe?: string;
      frequencyOfContribution?: 'monthly' | 'quarterly' | 'annual';
      automaticContributions?: boolean;
      primaryPurpose?: 'emergency_fund' | 'retirement' | 'major_purchase' | 'education';
    }
  ): Promise<any> {
    return this.execute({
      action: 'developSavingsPlans',
      payload: {
        savingsGoal: options?.savingsGoal,
        targetTimeframe: options?.targetTimeframe,
        frequencyOfContribution: options?.frequencyOfContribution,
        automaticContributions: options?.automaticContributions,
        primacyPurpose: options?.primaryPurpose,
      }
    }, conversationId);
  }

  public async generateFinancialRoadmaps(
    conversationId: string,
    options?: {
      horizon?: '1-3years' | '5years' | '10years' | 'retirement';
      milestones?: string[];
      reviews?: 'annual' | 'quarterly' | 'custom';
      adjustForInflation?: boolean;
    }
  ): Promise<any> {
    return this.execute({
      action: 'generateFinancialRoadmaps',
      payload: {
        horizon: options?.horizon,
        milestones: options?.milestones,
        reviews: options?.reviews,
        adjustForInflation: options?.adjustForInflation,
      }
    }, conversationId);
  }

  public async trackPlanProgress(
    conversationId: string,
    options?: {
      compareToBaseline?: boolean;
      includeProjections?: boolean;
      alertThresholds?: Record<string, number>;  // e.g., { "savings_goal": 0.9, "investment_return": 1.1 }
      reportFrequency?: 'monthly' | 'quarterly' | 'annual';
    }
  ): Promise<any> {
    return this.execute({
      action: 'trackPlanProgress',
      payload: {
        compareToBaseline: options?.compareToBaseline,
        includeProjections: options?.includeProjections,
        alertThresholds: options?.alertThresholds,
        reportFrequency: options?.reportFrequency,
      }
    }, conversationId);
  }
}
