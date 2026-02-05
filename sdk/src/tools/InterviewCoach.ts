import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InterviewCoach extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'InterviewCoach',
      description: 'Provides interview preparation guidance, response strategies, and best practices.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the interview coach.',
            enum: ['provideGuidance', 'developResponseStrategies', 'offerBestPractices', 'generateCoachingReports', 'simulateInterviewScenarios'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific interview coaching action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async provideGuidance(
    interviewData: any,
    conversationId: string,
    options?: {
      jobTitle?: string;
      company?: string;
      industry?: string;
      interviewType?: string;
      keyTopics?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'provideGuidance',
        payload: {
          interviewData,
          jobTitle: options?.jobTitle,
          company: options?.company,
          industry: options?.industry,
          interviewType: options?.interviewType,
          keyTopics: options?.keyTopics,
        },
      },
      conversationId
    );
  }

  public async developResponseStrategies(
    conversationId: string,
    options?: {
      commonQuestions?: string[];
      industry?: string;
      role?: string;
      experience?: number;
      communicationStyle?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'developResponseStrategies',
        payload: {
          commonQuestions: options?.commonQuestions,
          industry: options?.industry,
          role: options?.role,
          experience: options?.experience,
          communicationStyle: options?.communicationStyle,
        },
      },
      conversationId
    );
  }

  public async offerBestPractices(
    conversationId: string,
    options?: {
      interviewType?: string;
      industry?: string;
      company?: string;
      focusAreas?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'offerBestPractices',
        payload: {
          interviewType: options?.interviewType,
          industry: options?.industry,
          company: options?.company,
          focusAreas: options?.focusAreas,
        },
      },
      conversationId
    );
  }

  public async generateCoachingReports(
    conversationId: string,
    options?: {
      sessionData?: any;
      role?: string;
      company?: string;
      includeMetrics?: string[];
      format?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCoachingReports',
        payload: {
          sessionData: options?.sessionData,
          role: options?.role,
          company: options?.company,
          includeMetrics: options?.includeMetrics,
          format: options?.format,
        },
      },
      conversationId
    );
  }

  public async simulateInterviewScenarios(
    conversationId: string,
    options?: {
      scenarios?: Array<{ type: string; difficulty: string; description: string }>;
      role?: string;
      company?: string;
      industry?: string;
      focusTechnicalSkills?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'simulateInterviewScenarios',
        payload: {
          scenarios: options?.scenarios,
          role: options?.role,
          company: options?.company,
          industry: options?.industry,
          focusTechnicalSkills: options?.focusTechnicalSkills,
        },
      },
      conversationId
    );
  }
}
