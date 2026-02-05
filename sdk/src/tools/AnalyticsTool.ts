import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class AnalyticsTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'AnalyticsTool',
      description: 'Provides comprehensive content performance analytics across all platforms.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the analytics tool.',
            enum: ['getEngagementMetrics', 'getSEOPerformance', 'getAudienceInsights', 'generatePerformanceReport', 'trackConversionRates'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific analytics action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async getEngagementMetrics(
    platforms: string[],
    timeRange: string,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      metrics?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getEngagementMetrics',
        payload: {
          platforms,
          timeRange,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          metrics: options?.metrics,
        },
      },
      conversationId
    );
  }

  public async getSEOPerformance(
    contentIds: string[],
    conversationId: string,
    options?: {
      keywords?: string[];
      competitors?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getSEOPerformance',
        payload: {
          contentIds,
          keywords: options?.keywords,
          competitors: options?.competitors,
        },
      },
      conversationId
    );
  }

  public async getAudienceInsights(
    audienceSegment: string,
    conversationId: string,
    options?: {
      demographics?: { ageRange?: string; location?: string; interests?: string[] };
      contentPreferences?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getAudienceInsights',
        payload: {
          audienceSegment,
          demographics: options?.demographics,
          contentPreferences: options?.contentPreferences,
        },
      },
      conversationId
    );
  }

  public async generatePerformanceReport(
    contentIds: string[],
    conversationId: string,
    options?: {
      includeMetrics?: string[];
      format?: string;
      includeRecommendations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generatePerformanceReport',
        payload: {
          contentIds,
          includeMetrics: options?.includeMetrics,
          format: options?.format,
          includeRecommendations: options?.includeRecommendations,
        },
      },
      conversationId
    );
  }

  public async trackConversionRates(
    campaignId: string,
    conversationId: string,
    options?: {
      platforms?: string[];
      goals?: string[];
      timeRange?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackConversionRates',
        payload: {
          campaignId,
          platforms: options?.platforms,
          goals: options?.goals,
          timeRange: options?.timeRange,
        },
      },
      conversationId
    );
  }
}
