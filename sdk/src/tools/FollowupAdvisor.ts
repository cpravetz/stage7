import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FollowupAdvisor extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FollowupAdvisor',
      description: 'Provides guidance on appropriate follow-up actions and timing for job applications.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the follow-up advisor.',
            enum: ['generateRecommendations', 'determineFollowupTiming', 'createFollowupMessages', 'generateFollowupReports', 'trackFollowupEffectiveness'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific follow-up advisor action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateRecommendations(
    applicationData: any,
    conversationId: string,
    options?: {
      applicationStatus?: 'pending' | 'interview' | 'rejected' | 'offer' | 'all';
      recommendationType?: 'followUp' | 'timing' | 'approach' | 'all';
      considerResponseTime?: boolean;
      generateMultipleStrategies?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateRecommendations',
        payload: {
          applicationData,
          applicationStatus: options?.applicationStatus,
          recommendationType: options?.recommendationType,
          considerResponseTime: options?.considerResponseTime,
          generateMultipleStrategies: options?.generateMultipleStrategies,
        },
      },
      conversationId
    );
  }

  public async determineFollowupTiming(
    conversationId: string,
    options?: {
      timingStrategy?: 'aggressive' | 'moderate' | 'conservative' | 'companyNorm';
      considerRoleLevel?: boolean;
      considerIndustry?: boolean;
      generateAlternatives?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'determineFollowupTiming',
        payload: {
          timingStrategy: options?.timingStrategy,
          considerRoleLevel: options?.considerRoleLevel,
          considerIndustry: options?.considerIndustry,
          generateAlternatives: options?.generateAlternatives,
        },
      },
      conversationId
    );
  }

  public async createFollowupMessages(
    conversationId: string,
    options?: {
      messageType?: 'email' | 'linkedin' | 'phone' | 'inPerson' | 'mixed';
      tone?: 'professional' | 'casual' | 'assertive' | 'humble';
      includeCTA?: boolean;
      personalizationLevel?: 'generic' | 'basic' | 'detailed';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createFollowupMessages',
        payload: {
          messageType: options?.messageType,
          tone: options?.tone,
          includeCTA: options?.includeCTA,
          personalizationLevel: options?.personalizationLevel,
        },
      },
      conversationId
    );
  }

  public async generateFollowupReports(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'analytics';
      includeMetrics?: ('followUpRate' | 'responseRate' | 'interviewConversionRate')[];
      timeframe?: 'week' | 'month' | 'quarter' | 'all';
      compareToBaseline?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateFollowupReports',
        payload: {
          reportFormat: options?.reportFormat,
          includeMetrics: options?.includeMetrics,
          timeframe: options?.timeframe,
          compareToBaseline: options?.compareToBaseline,
        },
      },
      conversationId
    );
  }

  public async trackFollowupEffectiveness(
    conversationId: string,
    options?: {
      effectivenessMetrics?: ('responseRate' | 'interviewsScheduled' | 'offersReceived' | 'timeToResponse')[];
      timeWindow?: '30day' | '60day' | '90day' | 'all';
      identifyBestPractices?: boolean;
      generateOptimizations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackFollowupEffectiveness',
        payload: {
          effectivenessMetrics: options?.effectivenessMetrics,
          timeWindow: options?.timeWindow,
          identifyBestPractices: options?.identifyBestPractices,
          generateOptimizations: options?.generateOptimizations,
        },
      },
      conversationId
    );
  }
}
