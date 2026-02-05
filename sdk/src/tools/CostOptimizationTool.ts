import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface SpendingAnalysis {
  period_days: number;
  total_cost: number;
  average_daily_cost: number;
  currency: string;
  spending_by_service: Array<{ service: string; cost: number }>;
  spending_by_region: Array<{ region: string; cost: number }>;
  trend: string;
}

interface CostAnomaly {
  date: string;
  cost: number;
  expected_cost: number;
  deviation_percent: number;
  severity: string;
  possible_cause: string;
}

interface CostForecast {
  forecast_period_days: number;
  forecasted_total: number;
  forecasted_avg_daily: number;
  trend_direction: string;
  confidence: number;
  recommendation: string;
}

interface RIRecommendation {
  service: string;
  instance_type: string;
  region: string;
  annual_savings: number;
  payback_period_months: number;
  confidence: number;
  reason: string;
}

interface WasteItem {
  resource_type: string;
  resource_id: string;
  monthly_cost: number;
  utilization_percent: number;
  reason: string;
  recommendation: string;
}

export class CostOptimizationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CostOptimizationTool',
      description: 'Cloud cost optimization and forecasting. Analyzes spending, detects anomalies, forecasts costs, and recommends cost optimization strategies.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The cost analysis action to perform.',
            enum: [
              'analyze_spending',
              'detect_anomalies',
              'forecast_costs',
              'recommend_reserved_instances',
              'identify_waste',
              'get_cost_by_service',
              'get_cost_trends',
            ],
          },
          days: {
            type: 'number',
            description: 'Number of days to analyze. Defaults to 30.',
          },
          forecast_days: {
            type: 'number',
            description: 'Number of days to forecast. Defaults to 30.',
          },
          cloud_provider: {
            type: 'string',
            description: 'Cloud provider to analyze: aws, gcp, azure, multi. Defaults to "aws".',
            enum: ['aws', 'gcp', 'azure', 'multi'],
          },
          anomaly_threshold: {
            type: 'number',
            description: 'Percentage change threshold for anomaly detection. Defaults to 20.',
          },
          confidence_level: {
            type: 'string',
            description: 'Confidence level for recommendations: low, medium, high. Defaults to "medium".',
            enum: ['low', 'medium', 'high'],
          },
          waste_threshold_percent: {
            type: 'number',
            description: 'Minimum utilization percentage to flag as waste. Defaults to 10.',
          },
        },
        required: ['action'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Analyze cloud spending for a period.
   */
  public async analyzeSpending(
    days: number = 30,
    cloudProvider: string = 'aws',
    conversationId?: string,
    options?: {
      department?: string;
      environment?: string;
      region?: string;
      tags?: Record<string, string>;
    }
  ): Promise<SpendingAnalysis & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'analyze_spending',
        payload: {
          days,
          cloud_provider: cloudProvider,
          department: options?.department,
          environment: options?.environment,
          region: options?.region,
          tags: options?.tags,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'cost' };
  }

  /**
   * Detect cost anomalies.
   */
  public async detectAnomalies(
    days: number = 30,
    threshold: number = 20,
    conversationId?: string,
    options?: {
      cloudProvider?: string;
      department?: string;
      alertSeverity?: string;
    }
  ): Promise<CostAnomaly[] & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'detect_anomalies',
        payload: {
          days,
          anomaly_threshold: threshold,
          cloud_provider: options?.cloudProvider,
          department: options?.department,
          alert_severity: options?.alertSeverity,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'cost' })) as any)
      : (result as any);
  }

  /**
   * Forecast future cloud costs.
   */
  public async forecastCosts(
    days: number = 30,
    forecastDays: number = 30,
    conversationId?: string,
    options?: {
      cloudProvider?: string;
      department?: string;
      growthRate?: number;
    }
  ): Promise<CostForecast & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'forecast_costs',
        payload: {
          days,
          forecast_days: forecastDays,
          cloud_provider: options?.cloudProvider,
          department: options?.department,
          growth_rate: options?.growthRate,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'cost' };
  }

  /**
   * Recommend reserved instances.
   */
  public async recommendReservedInstances(
    days: number = 30,
    confidenceLevel: string = 'medium',
    conversationId?: string,
    options?: {
      cloudProvider?: string;
      purchaseTerm?: '1' | '3' | 'flexible';
      paymentOption?: string;
    }
  ): Promise<RIRecommendation[] & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'recommend_reserved_instances',
        payload: {
          days,
          confidence_level: confidenceLevel,
          cloud_provider: options?.cloudProvider,
          purchase_term: options?.purchaseTerm,
          payment_option: options?.paymentOption,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'cost' })) as any)
      : (result as any);
  }

  /**
   * Identify unused resources and waste.
   */
  public async identifyWaste(
    wasteThreshold: number = 10,
    conversationId?: string,
    options?: {
      cloudProvider?: string;
      resourceTypes?: string[];
      excludeProduction?: boolean;
    }
  ): Promise<WasteItem[] & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'identify_waste',
        payload: {
          waste_threshold_percent: wasteThreshold,
          cloud_provider: options?.cloudProvider,
          resource_types: options?.resourceTypes,
          exclude_production: options?.excludeProduction,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'cost' })) as any)
      : (result as any);
  }

  /**
   * Get cost breakdown by service.
   */
  public async getCostByService(
    days: number = 30,
    conversationId?: string,
    options?: {
      cloudProvider?: string;
      department?: string;
      sortBy?: 'cost' | 'percent';
    }
  ): Promise<Array<{ service: string; cost: number; percent_of_total: number }> & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'get_cost_by_service',
        payload: {
          days,
          cloud_provider: options?.cloudProvider,
          department: options?.department,
          sort_by: options?.sortBy,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'cost' })) as any)
      : (result as any);
  }

  /**
   * Get historical cost trends.
   */
  public async getCostTrends(
    days: number = 90,
    conversationId?: string,
    options?: {
      cloudProvider?: string;
      department?: string;
      granularity?: 'daily' | 'weekly' | 'monthly';
    }
  ): Promise<any & { toolType: 'cost' }> {
    const result = await this.execute(
      {
        action: 'get_cost_trends',
        payload: {
          days,
          cloud_provider: options?.cloudProvider,
          department: options?.department,
          granularity: options?.granularity,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'cost' };
  }
}
