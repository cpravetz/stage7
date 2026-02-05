import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PortfolioOptimizationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'PortfolioOptimizationTool',
      description: 'Optimizes investment portfolios based on risk-return objectives.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the portfolio optimization tool.',
            enum: ['optimizePortfolio', 'calculateEfficientFrontier', 'rebalancePortfolio', 'generateAllocationRecommendations'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific portfolio optimization action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async optimizePortfolio(
    objectives: any,
    constraints: any,
    conversationId: string,
    options?: {
      optimizationMethod?: 'meanVariance' | 'blackLitterman' | 'riskParity' | 'hierarchicalRiskParity';
      includeConstraintVisualization?: boolean;
      generateAlternatives?: number;
      riskAversion?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'optimizePortfolio',
        payload: {
          objectives,
          constraints,
          optimizationMethod: options?.optimizationMethod,
          includeConstraintVisualization: options?.includeConstraintVisualization,
          generateAlternatives: options?.generateAlternatives,
          riskAversion: options?.riskAversion,
        },
      },
      conversationId
    );
  }

  public async calculateEfficientFrontier(
    data: any,
    conversationId: string,
    options?: {
      pointsOnFrontier?: number;
      includeHistorical?: boolean;
      generationMethod?: 'monteCarlo' | 'optimization' | 'analytical';
      confidenceLevel?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'calculateEfficientFrontier',
        payload: {
          data,
          pointsOnFrontier: options?.pointsOnFrontier,
          includeHistorical: options?.includeHistorical,
          generationMethod: options?.generationMethod,
          confidenceLevel: options?.confidenceLevel,
        },
      },
      conversationId
    );
  }

  public async rebalancePortfolio(
    portfolioId: string,
    conversationId: string,
    options?: {
      targetAllocation?: any;
      considerTaxes?: boolean;
      considerTransactionCosts?: boolean;
      driftThreshold?: number;
      rebalanceFrequency?: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'rebalancePortfolio',
        payload: {
          portfolioId,
          targetAllocation: options?.targetAllocation,
          considerTaxes: options?.considerTaxes,
          considerTransactionCosts: options?.considerTransactionCosts,
          driftThreshold: options?.driftThreshold,
          rebalanceFrequency: options?.rebalanceFrequency,
        },
      },
      conversationId
    );
  }

  public async generateAllocationRecommendations(
    portfolioId: string,
    conversationId: string,
    options?: {
      investmentObjectives?: 'growth' | 'income' | 'balanced' | 'conservation';
      timeHorizon?: 'short' | 'medium' | 'long';
      riskTolerance?: 'low' | 'moderate' | 'high';
      includeEsgFactors?: boolean;
      benchmarkToUse?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateAllocationRecommendations',
        payload: {
          portfolioId,
          investmentObjectives: options?.investmentObjectives,
          timeHorizon: options?.timeHorizon,
          riskTolerance: options?.riskTolerance,
          includeEsgFactors: options?.includeEsgFactors,
          benchmarkToUse: options?.benchmarkToUse,
        },
      },
      conversationId
    );
  }
}
