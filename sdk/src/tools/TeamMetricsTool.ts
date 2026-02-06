import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface TeamCapacity {
  team_id: string;
  team_size: number;
  total_capacity_hours: number;
  utilized_hours: number;
  available_hours: number;
  utilization_percent: number;
  health_indicator: string;
  recommendation: string;
}

interface OnCallMetrics {
  period_days: number;
  total_incidents: number;
  avg_mttr_minutes: number;
  avg_mtta_minutes: number;
  engineer_stats: Array<{
    engineer: string;
    incident_count: number;
    avg_mttr_minutes: number;
    load: string;
  }>;
  recommendation: string;
}

interface BurnoutRisk {
  name: string;
  hours_per_week: number;
  risk_level: string;
  risk_factors: string[];
  recommendation: string;
}

interface CapacityForecast {
  current_team_size: number;
  forecast_months: number;
  projections: Array<{
    month: number;
    projected_capacity_needed: number;
    recommended_team_size: number;
    gap_hours: number;
    hiring_needs: number;
  }>;
  hiring_recommendation: string;
}

interface MTTRMetrics {
  period_days: number;
  total_incidents: number;
  avg_mttr_minutes: number;
  median_mttr_minutes: number;
  p95_mttr_minutes: number;
  trend: string;
}

interface TeamHealth {
  team_id: string;
  team_size: number;
  health_score: number;
  status: string;
  metrics: {
    avg_utilization_percent: number;
    incident_rate_per_day: number;
    at_risk_members: number;
    avg_mttr_minutes: number;
  };
  recommendations: string[];
}

interface OnCallCoverage {
  week_starting: string;
  oncall_engineer: string;
  role: string;
  contact: string;
}

export class TeamMetricsTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'TeamMetricsTool',
      description: 'Engineering team metrics and on-call management. Analyzes team capacity, on-call metrics, identifies burnout risks, and forecasts resource needs.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The team metrics action to perform.',
            enum: [
              'get_team_capacity',
              'analyze_on_call_metrics',
              'identify_burnout_risks',
              'forecast_capacity',
              'get_mttr_metrics',
              'get_team_health',
              'get_oncall_coverage',
            ],
          },
          team_id: {
            type: 'string',
            description: 'Team identifier to analyze.',
          },
          days: {
            type: 'number',
            description: 'Number of days to analyze. Defaults to 30.',
          },
          forecast_months: {
            type: 'number',
            description: 'Number of months to forecast. Defaults to 3.',
          },
          burnout_threshold: {
            type: 'number',
            description: 'Hours per week threshold for burnout risk. Defaults to 50.',
          },
          include_vacation: {
            type: 'boolean',
            description: 'Include vacation days in capacity calculation. Defaults to true.',
          },
          confidence_level: {
            type: 'string',
            description: 'Confidence level for forecasts: low, medium, high. Defaults to "medium".',
            enum: ['low', 'medium', 'high'],
          },
        },
        required: ['action'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Get team capacity and utilization metrics.
   */
  public async getTeamCapacity(
    teamId?: string,
    includeVacation: boolean = true,
    conversationId?: string,
    options?: {
      department?: string;
      includeCapacityBuffer?: boolean;
      bufferPercent?: number;
    }
  ): Promise<TeamCapacity & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'get_team_capacity',
        payload: {
          team_id: teamId,
          include_vacation: includeVacation,
          department: options?.department,
          include_capacity_buffer: options?.includeCapacityBuffer,
          buffer_percent: options?.bufferPercent,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'team' };
  }

  /**
   * Analyze on-call rotation performance metrics.
   */
  public async analyzeOnCallMetrics(
    days: number = 30,
    conversationId?: string,
    options?: {
      team?: string;
      includeEscalations?: boolean;
      includeContextSwitching?: boolean;
    }
  ): Promise<OnCallMetrics & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'analyze_on_call_metrics',
        payload: {
          days,
          team: options?.team,
          include_escalations: options?.includeEscalations,
          include_context_switching: options?.includeContextSwitching,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'team' };
  }

  /**
   * Identify team members at risk of burnout.
   */
  public async identifyBurnoutRisks(
    days: number = 30,
    burnoutThreshold: number = 50,
    conversationId?: string,
    options?: {
      includeOnCallLoad?: boolean;
      includePagerDutyEvents?: boolean;
      confidenceLevel?: string;
    }
  ): Promise<BurnoutRisk[] & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'identify_burnout_risks',
        payload: {
          days,
          burnout_threshold: burnoutThreshold,
          include_oncall_load: options?.includeOnCallLoad,
          include_pagerduty_events: options?.includePagerDutyEvents,
          confidence_level: options?.confidenceLevel,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'team' })) as any)
      : (result as any);
  }

  /**
   * Forecast team capacity needs.
   */
  public async forecastCapacity(
    forecastMonths: number = 3,
    confidenceLevel: string = 'medium',
    conversationId?: string,
    options?: {
      department?: string;
      projectedHeadcount?: number;
      travelExpectancy?: number;
    }
  ): Promise<CapacityForecast & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'forecast_capacity',
        payload: {
          forecast_months: forecastMonths,
          confidence_level: confidenceLevel,
          department: options?.department,
          projected_headcount: options?.projectedHeadcount,
          travel_expectancy: options?.travelExpectancy,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'team' };
  }

  /**
   * Get MTTR and incident metrics.
   */
  public async getMTTRMetrics(
    days: number = 30,
    conversationId?: string,
    options?: {
      team?: string;
      environment?: string;
      includeTrendAnalysis?: boolean;
    }
  ): Promise<MTTRMetrics & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'get_mttr_metrics',
        payload: {
          days,
          team: options?.team,
          environment: options?.environment,
          include_trend_analysis: options?.includeTrendAnalysis,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'team' };
  }

  /**
   * Get overall team health indicators.
   */
  public async getTeamHealth(
    teamId?: string,
    conversationId?: string,
    options?: {
      includePredictions?: boolean;
      environment?: string;
    }
  ): Promise<TeamHealth & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'get_team_health',
        payload: {
          team_id: teamId,
          include_predictions: options?.includePredictions,
          environment: options?.environment,
        },
      },
      conversationId || ''
    );
    return { ...result, toolType: 'team' };
  }

  /**
   * Get current and upcoming on-call coverage schedule.
   */
  public async getOnCallCoverage(
    conversationId?: string,
    options?: {
      team?: string;
      lookAheadDays?: number;
      includePlanning?: boolean;
    }
  ): Promise<OnCallCoverage[] & { toolType: 'team' }> {
    const result = await this.execute(
      {
        action: 'get_oncall_coverage',
        payload: {
          team: options?.team,
          look_ahead_days: options?.lookAheadDays,
          include_planning: options?.includePlanning,
        },
      },
      conversationId || ''
    );
    return Array.isArray(result)
      ? (result.map((r: any) => ({ ...r, toolType: 'team' })) as any)
      : (result as any);
  }
}
