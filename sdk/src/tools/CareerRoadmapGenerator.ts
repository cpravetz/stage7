import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CareerRoadmapGenerator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CareerRoadmapGenerator',
      description: 'Creates comprehensive career advancement strategies with actionable steps, milestones, and success metrics.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the career roadmap generator.',
            enum: ['createPlan', 'developActionableSteps', 'establishCareerMilestones', 'generateCareerRoadmap', 'trackCareerProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific career roadmap generation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createPlan(
    careerGoals: any,
    conversationId: string,
    options?: {
      timelineYears?: 3 | 5 | 10;
      focusAreas?: ('technical_skills' | 'leadership' | 'industry_certifications' | 'domain_expertise')[];
      currentLevel?: 'entry' | 'mid' | 'senior' | 'lead' | 'principal';
      targetLevel?: 'senior' | 'lead' | 'principal' | 'executive' | 'specialist';
      industryShifts?: boolean;
      mentorshipNeeds?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createPlan',
        payload: {
          careerGoals,
          timelineYears: options?.timelineYears,
          focusAreas: options?.focusAreas,
          currentLevel: options?.currentLevel,
          targetLevel: options?.targetLevel,
          industryShifts: options?.industryShifts,
          mentorshipNeeds: options?.mentorshipNeeds,
        },
      },
      conversationId
    );
  }

  public async developActionableSteps(
    conversationId: string,
    options?: {
      currentLevel?: 'entry' | 'mid' | 'senior' | 'lead' | 'principal';
      targetLevel?: 'senior' | 'lead' | 'principal' | 'executive' | 'specialist';
      priority?: 'immediate' | 'short_term' | 'long_term';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'developActionableSteps',
        payload: {
          currentLevel: options?.currentLevel,
          targetLevel: options?.targetLevel,
          priority: options?.priority,
        },
      },
      conversationId
    );
  }

  public async establishCareerMilestones(
    conversationId: string,
    options?: {
      timelineYears?: 3 | 5 | 10;
      focusAreas?: ('technical_skills' | 'leadership' | 'industry_certifications' | 'domain_expertise')[];
      trackingFrequency?: 'quarterly' | 'biannual' | 'annual';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'establishCareerMilestones',
        payload: {
          timelineYears: options?.timelineYears,
          focusAreas: options?.focusAreas,
          trackingFrequency: options?.trackingFrequency,
        },
      },
      conversationId
    );
  }

  public async generateCareerRoadmap(
    conversationId: string,
    options?: {
      currentLevel?: 'entry' | 'mid' | 'senior' | 'lead' | 'principal';
      targetLevel?: 'senior' | 'lead' | 'principal' | 'executive' | 'specialist';
      timelineYears?: 3 | 5 | 10;
      includeNetwork?: boolean;
      includeOpportunities?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCareerRoadmap',
        payload: {
          currentLevel: options?.currentLevel,
          targetLevel: options?.targetLevel,
          timelineYears: options?.timelineYears,
          includeNetwork: options?.includeNetwork,
          includeOpportunities: options?.includeOpportunities,
        },
      },
      conversationId
    );
  }

  public async trackCareerProgress(
    conversationId: string,
    options?: {
      compareToBaseline?: boolean;
      includeProjections?: boolean;
      reportFormat?: 'summary' | 'detailed' | 'comparative';
      timeWindow?: '6months' | '1year' | 'lifetime';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackCareerProgress',
        payload: {
          compareToBaseline: options?.compareToBaseline,
          includeProjections: options?.includeProjections,
          reportFormat: options?.reportFormat,
          timeWindow: options?.timeWindow,
        },
      },
      conversationId
    );
  }
}
