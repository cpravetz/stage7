import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FinancialAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FinancialAnalysisTool',
      description: 'Performs advanced financial analysis and trend identification.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the financial analysis tool.',
            enum: ['analyzeTrends', 'calculateRatios', 'identifyAnomalies', 'generateFinancialInsights'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific financial analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeTrends(
    data: any,
    timeRange: any,
    conversationId: string,
    options?: {
      includeForecasting?: boolean;
      seasonalityAdjustment?: boolean;
      confidenceLevel?: 'low' | 'medium' | 'high';
      anomalyDetection?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeTrends',
        payload: {
          data,
          timeRange,
          include_forecasting: options?.includeForecasting,
          seasonality_adjustment: options?.seasonalityAdjustment,
          confidence_level: options?.confidenceLevel,
          anomaly_detection: options?.anomalyDetection,
        },
      },
      conversationId
    );
  }

  public async calculateRatios(
    financialData: any,
    conversationId: string,
    options?: {
      ratioTypes?: string[];
      benchmarkAgainstIndustry?: boolean;
      timeSeriesAnalysis?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'calculateRatios',
        payload: {
          financialData,
          ratio_types: options?.ratioTypes,
          benchmark_against_industry: options?.benchmarkAgainstIndustry,
          time_series_analysis: options?.timeSeriesAnalysis,
        },
      },
      conversationId
    );
  }

  public async identifyAnomalies(
    data: any,
    conversationId: string,
    options?: {
      sensitivityLevel?: 'low' | 'medium' | 'high';
      includeHistoricalContext?: boolean;
      requireManualApproval?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyAnomalies',
        payload: {
          data,
          sensitivity_level: options?.sensitivityLevel,
          include_historical_context: options?.includeHistoricalContext,
          require_manual_approval: options?.requireManualApproval,
        },
      },
      conversationId
    );
  }

  public async generateFinancialInsights(
    data: any,
    conversationId: string,
    options?: {
      insightTypes?: string[];
      executiveSummary?: boolean;
      includeRecommendations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateFinancialInsights',
        payload: {
          data,
          insight_types: options?.insightTypes,
          executive_summary: options?.executiveSummary,
          include_recommendations: options?.includeRecommendations,
        },
      },
      conversationId
    );
  }
}
