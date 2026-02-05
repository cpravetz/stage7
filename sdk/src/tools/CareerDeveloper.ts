import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CareerDeveloper extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CareerDeveloper',
      description: 'Generates actionable career development strategies and skill-building recommendations.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the career developer.',
            enum: ['createPlan', 'developSkillBuildingStrategies', 'identifyTrainingOpportunities', 'generateDevelopmentReports', 'trackSkillProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific career development action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createPlan(
    careerData: any,
    conversationId: string,
    options?: {
      planType?: 'shortTerm' | 'mediumTerm' | 'longTerm' | 'comprehensive';
      focusAreas?: ('technical' | 'leadership' | 'interpersonal' | 'domain' | 'soft')[];
      includeTimeline?: boolean;
      includeResourceRecommendations?: boolean;
      generateMilestones?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createPlan',
        payload: {
          careerData,
          planType: options?.planType,
          focusAreas: options?.focusAreas,
          includeTimeline: options?.includeTimeline,
          includeResourceRecommendations: options?.includeResourceRecommendations,
          generateMilestones: options?.generateMilestones,
        },
      },
      conversationId
    );
  }

  public async developSkillBuildingStrategies(
    conversationId: string,
    options?: {
      skillCategories?: ('technical' | 'leadership' | 'communication' | 'analytical' | 'creative')[];
      learningStyles?: ('visual' | 'auditory' | 'kinesthetic' | 'reading' | 'mixed')[];
      timeCommitment?: 'part-time' | 'full-time' | 'flexible';
      includeExternalResources?: boolean;
      rankByImpact?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'developSkillBuildingStrategies',
        payload: {
          skillCategories: options?.skillCategories,
          learningStyles: options?.learningStyles,
          timeCommitment: options?.timeCommitment,
          includeExternalResources: options?.includeExternalResources,
          rankByImpact: options?.rankByImpact,
        },
      },
      conversationId
    );
  }

  public async identifyTrainingOpportunities(
    conversationId: string,
    options?: {
      trainingTypes?: ('certification' | 'course' | 'bootcamp' | 'mentorship' | 'onTheJob')[];
      deliveryFormat?: ('online' | 'inPerson' | 'hybrid' | 'self-paced')[];
      budgetConstraints?: number;
      timeConstraints?: 'immediate' | 'short' | 'medium' | 'long';
      includeFreeCourses?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyTrainingOpportunities',
        payload: {
          trainingTypes: options?.trainingTypes,
          deliveryFormat: options?.deliveryFormat,
          budgetConstraints: options?.budgetConstraints,
          timeConstraints: options?.timeConstraints,
          includeFreeCourses: options?.includeFreeCourses,
        },
      },
      conversationId
    );
  }

  public async generateDevelopmentReports(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'executive';
      includeProgress?: boolean;
      includeSuggestions?: boolean;
      timeframe?: 'quarterly' | 'semiannual' | 'annual';
      generateActionItems?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateDevelopmentReports',
        payload: {
          reportFormat: options?.reportFormat,
          includeProgress: options?.includeProgress,
          includeSuggestions: options?.includeSuggestions,
          timeframe: options?.timeframe,
          generateActionItems: options?.generateActionItems,
        },
      },
      conversationId
    );
  }

  public async trackSkillProgress(
    conversationId: string,
    options?: {
      skillsToTrack?: string[];
      trackingMetrics?: ('proficiency' | 'applicability' | 'marketDemand' | 'usageFrequency')[];
      benchmarkAgainstRole?: string;
      identifyGaps?: boolean;
      suggestNextSteps?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackSkillProgress',
        payload: {
          skillsToTrack: options?.skillsToTrack,
          trackingMetrics: options?.trackingMetrics,
          benchmarkAgainstRole: options?.benchmarkAgainstRole,
          identifyGaps: options?.identifyGaps,
          suggestNextSteps: options?.suggestNextSteps,
        },
      },
      conversationId
    );
  }
}
