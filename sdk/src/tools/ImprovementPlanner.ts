import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ImprovementPlanner extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ImprovementPlanner',
      description: 'Creates actionable improvement strategies based on performance analysis and feedback insights.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the improvement planner.',
            enum: ['generateRecommendations', 'developActionPlans', 'prioritizeImprovementAreas', 'generateImprovementReport', 'trackImplementationProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific improvement planning action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateRecommendations(
    performanceData: any,
    conversationId: string,
    options?: {
      recommendationType?: 'strategic' | 'tactical' | 'operational' | 'all';
      impactLevel?: 'quick_win' | 'medium' | 'transformational';
      resourceConstraints?: 'minimal' | 'moderate' | 'flexible';
      prioritizeByROI?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateRecommendations',
        payload: {
          performanceData,
          recommendationType: options?.recommendationType,
          impactLevel: options?.impactLevel,
          resourceConstraints: options?.resourceConstraints,
          prioritizeByROI: options?.prioritizeByROI,
        },
      },
      conversationId
    );
  }

  public async developActionPlans(
    conversationId: string,
    options?: {
      planType?: 'detailed' | 'phased' | 'agile' | 'waterfall';
      includeTimelines?: boolean;
      includeResources?: boolean;
      assignOwnership?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'developActionPlans',
        payload: {
          planType: options?.planType,
          includeTimelines: options?.includeTimelines,
          includeResources: options?.includeResources,
          assignOwnership: options?.assignOwnership,
        },
      },
      conversationId
    );
  }

  public async prioritizeImprovementAreas(
    conversationId: string,
    options?: {
      prioritizationMethod?: 'impact' | 'effort' | 'urgency' | 'dependencies';
      considerDependencies?: boolean;
      generateSequencing?: boolean;
      highlightCriticalPath?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'prioritizeImprovementAreas',
        payload: {
          prioritizationMethod: options?.prioritizationMethod,
          considerDependencies: options?.considerDependencies,
          generateSequencing: options?.generateSequencing,
          highlightCriticalPath: options?.highlightCriticalPath,
        },
      },
      conversationId
    );
  }

  public async generateImprovementReport(
    conversationId: string,
    options?: {
      reportFormat?: 'executive' | 'detailed' | 'technical' | 'board';
      includeBaseline?: boolean;
      includeTargets?: boolean;
      includeRiskAssessment?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateImprovementReport',
        payload: {
          reportFormat: options?.reportFormat,
          includeBaseline: options?.includeBaseline,
          includeTargets: options?.includeTargets,
          includeRiskAssessment: options?.includeRiskAssessment,
        },
      },
      conversationId
    );
  }

  public async trackImplementationProgress(
    conversationId: string,
    options?: {
      trackingFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
      reportingMetrics?: ('completion' | 'milestone' | 'impact' | 'variance')[];
      flagSlippage?: boolean;
      slippageThreshold?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackImplementationProgress',
        payload: {
          trackingFrequency: options?.trackingFrequency,
          reportingMetrics: options?.reportingMetrics,
          flagSlippage: options?.flagSlippage,
          slippageThreshold: options?.slippageThreshold,
        },
      },
      conversationId
    );
  }
}
