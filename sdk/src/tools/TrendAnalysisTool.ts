import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class TrendAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'TrendAnalysisTool',
      description: 'Identifies trending topics, hashtags, and content formats across platforms.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the trend analysis tool.',
            enum: ['getTrendingTopics', 'analyzeHashtagPerformance', 'identifyViralContentPatterns'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific trend analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async getTrendingTopics(
    industry: string,
    platforms: string[],
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      timeframe?: string;
      includeRegional?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getTrendingTopics',
        payload: {
          industry,
          platforms,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          timeframe: options?.timeframe,
          includeRegional: options?.includeRegional,
        },
      },
      conversationId
    );
  }

  public async analyzeHashtagPerformance(
    hashtags: string[],
    conversationId: string,
    options?: {
      platform?: string;
      timeRange?: string;
      targetAudience?: string;
      contentCategory?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeHashtagPerformance',
        payload: {
          hashtags,
          platform: options?.platform,
          timeRange: options?.timeRange,
          targetAudience: options?.targetAudience,
          contentCategory: options?.contentCategory,
        },
      },
      conversationId
    );
  }

  public async identifyViralContentPatterns(
    timeRange: string,
    conversationId: string,
    options?: {
      industry?: string;
      platforms?: string[];
      contentType?: string[];
      targetAudience?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyViralContentPatterns',
        payload: {
          timeRange,
          industry: options?.industry,
          platforms: options?.platforms,
          contentType: options?.contentType,
          targetAudience: options?.targetAudience,
        },
      },
      conversationId
    );
  }
}
