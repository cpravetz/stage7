import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InvestmentAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'InvestmentAnalysisTool',
      description: 'Analyzes investment opportunities and portfolio performance.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the investment analysis tool.',
            enum: ['analyzeInvestments', 'calculateReturns', 'compareInvestments', 'generateInvestmentReports'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific investment analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeInvestments(
    investmentData: any,
    conversationId: string,
    options?: {
      analysisType?: 'returns' | 'risk' | 'diversification' | 'growth_potential';
      timeFrame?: '1year' | '3years' | '5years' | '10years';
      benchmarkIndex?: string;
      includeProjections?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeInvestments',
        payload: {
          investmentData,
          analysisType: options?.analysisType,
          timeFrame: options?.timeFrame,
          benchmarkIndex: options?.benchmarkIndex,
          includeProjections: options?.includeProjections,
        },
      },
      conversationId
    );
  }

  public async calculateReturns(
    investmentId: string,
    conversationId: string,
    options?: {
      returnType?: 'total' | 'annualized' | 'absolute';
      timeFrame?: '1year' | '3years' | '5years' | '10years' | 'inception';
      adjustForInflation?: boolean;
      adjustForFees?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'calculateReturns',
        payload: {
          investmentId,
          returnType: options?.returnType,
          timeFrame: options?.timeFrame,
          adjustForInflation: options?.adjustForInflation,
          adjustForFees: options?.adjustForFees,
        },
      },
      conversationId
    );
  }

  public async compareInvestments(
    investmentIds: string[],
    conversationId: string,
    options?: {
      compareMetrics?: ('returns' | 'risk' | 'fees' | 'tax_efficiency' | 'liquidity')[];
      timeFrame?: '1year' | '3years' | '5years';
      highlight?: 'best_performers' | 'lowest_risk' | 'best_value' | 'all';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'compareInvestments',
        payload: {
          investmentIds,
          compareMetrics: options?.compareMetrics,
          timeFrame: options?.timeFrame,
          highlight: options?.highlight,
        },
      },
      conversationId
    );
  }

  public async generateInvestmentReports(
    investmentData: any,
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'comparative' | 'performance_analysis';
      includeRecommendations?: boolean;
      includeTaxAnalysis?: boolean;
      timeFrame?: '1year' | '3years' | '5years' | '10years';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateInvestmentReports',
        payload: {
          investmentData,
          reportFormat: options?.reportFormat,
          includeRecommendations: options?.includeRecommendations,
          includeTaxAnalysis: options?.includeTaxAnalysis,
          timeFrame: options?.timeFrame,
        },
      },
      conversationId
    );
  }
}
