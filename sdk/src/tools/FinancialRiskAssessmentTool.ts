import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FinancialRiskAssessmentTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FinancialRiskAssessmentTool',
      description: 'Assesses financial risks and portfolio risk profiles.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the risk assessment tool.',
            enum: ['calculateRisk', 'analyzeRiskFactors', 'generateRiskReports', 'stressTestPortfolio'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific risk assessment action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async calculateRisk(
    portfolioData: any,
    conversationId: string,
    options?: {
      riskMetrics?: ('var' | 'cvar' | 'sharpe' | 'sortino' | 'beta')[];
      timeHorizon?: 'short' | 'medium' | 'long';
      confidenceLevel?: 0.95 | 0.97 | 0.99;
      includeMarginal?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'calculateRisk',
        payload: {
          portfolioData,
          riskMetrics: options?.riskMetrics,
          timeHorizon: options?.timeHorizon,
          confidenceLevel: options?.confidenceLevel,
          includeMarginal: options?.includeMarginal,
        },
      },
      conversationId
    );
  }

  public async analyzeRiskFactors(
    data: any,
    conversationId: string,
    options?: {
      factorCategories?: ('market' | 'credit' | 'liquidity' | 'operational' | 'concentration')[];
      sortBy?: 'impact' | 'probability' | 'combined';
      timeWindow?: '1week' | '1month' | '3months' | '1year';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeRiskFactors',
        payload: {
          data,
          factorCategories: options?.factorCategories,
          sortBy: options?.sortBy,
          timeWindow: options?.timeWindow,
        },
      },
      conversationId
    );
  }

  public async generateRiskReports(
    portfolioId: string,
    conversationId: string,
    options?: {
      reportDetail?: 'executive_summary' | 'comprehensive' | 'technical';
      includeHistorical?: boolean;
      includeComparative?: boolean;
      riskMetrics?: ('var' | 'cvar' | 'sharpe' | 'stress_test')[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateRiskReports',
        payload: {
          portfolioId,
          reportDetail: options?.reportDetail,
          includeHistorical: options?.includeHistorical,
          includeComparative: options?.includeComparative,
          riskMetrics: options?.riskMetrics,
        },
      },
      conversationId
    );
  }

  public async stressTestPortfolio(
    portfolioId: string,
    scenarios: any,
    conversationId: string,
    options?: {
      scenarioType?: 'historical' | 'hypothetical' | 'reverse_stress' | 'combined';
      includeRanking?: boolean;
      generateRecommendations?: boolean;
      severity?: 'mild' | 'moderate' | 'severe' | 'extreme';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'stressTestPortfolio',
        payload: {
          portfolioId,
          scenarios,
          scenarioType: options?.scenarioType,
          includeRanking: options?.includeRanking,
          generateRecommendations: options?.generateRecommendations,
          severity: options?.severity,
        },
      },
      conversationId
    );
  }
}
