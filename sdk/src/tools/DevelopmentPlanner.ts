import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class DevelopmentPlanner extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DevelopmentPlanner',
      description: 'Creates personalized leadership development plans with actionable steps, timelines, and resource recommendations.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the development planner.',
            enum: ['createPlan', 'generateActionableSteps', 'recommendLearningResources', 'generateDevelopmentTimeline', 'trackPlanProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific development planning action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createPlan(
    developmentGoals: any,
    conversationId: string,
    options?: {
      planType?: 'leadership' | 'technical' | 'interpersonal' | 'functional' | 'comprehensive';
      timeframe?: '3months' | '6months' | '1year' | '2years';
      focusAreas?: ('communication' | 'strategy' | 'delegation' | 'emotionalIntelligence')[];
      includeCoachingSupport?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createPlan',
        payload: {
          developmentGoals,
          planType: options?.planType,
          timeframe: options?.timeframe,
          focusAreas: options?.focusAreas,
          includeCoachingSupport: options?.includeCoachingSupport,
        },
      },
      conversationId
    );
  }

  public async generateActionableSteps(
    conversationId: string,
    options?: {
      stepGranularity?: 'weekly' | 'biweekly' | 'monthly';
      includeDeadlines?: boolean;
      prioritizationStrategy?: 'sequential' | 'parallel' | 'mixed';
      assignOwnership?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateActionableSteps',
        payload: {
          stepGranularity: options?.stepGranularity,
          includeDeadlines: options?.includeDeadlines,
          prioritizationStrategy: options?.prioritizationStrategy,
          assignOwnership: options?.assignOwnership,
        },
      },
      conversationId
    );
  }

  public async recommendLearningResources(
    conversationId: string,
    options?: {
      resourceTypes?: ('book' | 'course' | 'workshop' | 'mentor' | 'podcast' | 'journal')[];
      deliveryFormat?: 'online' | 'inPerson' | 'hybrid' | 'self-paced';
      budgetLevel?: 'free' | 'minimal' | 'moderate' | 'premium';
      includeDirectionalLinkages?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'recommendLearningResources',
        payload: {
          resourceTypes: options?.resourceTypes,
          deliveryFormat: options?.deliveryFormat,
          budgetLevel: options?.budgetLevel,
          includeDirectionalLinkages: options?.includeDirectionalLinkages,
        },
      },
      conversationId
    );
  }

  public async generateDevelopmentTimeline(
    conversationId: string,
    options?: {
      timelineView?: 'gantt' | 'milestone' | 'detailed' | 'summary';
      includeCheckpoints?: boolean;
      flagCriticalPath?: boolean;
      generateRiskAssessment?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateDevelopmentTimeline',
        payload: {
          timelineView: options?.timelineView,
          includeCheckpoints: options?.includeCheckpoints,
          flagCriticalPath: options?.flagCriticalPath,
          generateRiskAssessment: options?.generateRiskAssessment,
        },
      },
      conversationId
    );
  }

  public async trackPlanProgress(
    conversationId: string,
    options?: {
      trackingMetrics?: ('completion' | 'proficiency' | 'milestone' | 'feedback')[];
      reportFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
      flagSlippageThreshold?: number;
      suggestAdjustments?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackPlanProgress',
        payload: {
          trackingMetrics: options?.trackingMetrics,
          reportFrequency: options?.reportFrequency,
          flagSlippageThreshold: options?.flagSlippageThreshold,
          suggestAdjustments: options?.suggestAdjustments,
        },
      },
      conversationId
    );
  }
}
