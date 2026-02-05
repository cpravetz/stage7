import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FeedbackCollector extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FeedbackCollector',
      description: 'Gathers and processes feedback from team members, peers, and stakeholders for comprehensive performance evaluation.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the feedback collector.',
            enum: ['gatherInput', 'processFeedbackData', 'analyzeFeedbackPatterns', 'generateFeedbackSummary', 'trackFeedbackOverTime'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific feedback collection action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async gatherInput(
    feedbackSources: any,
    conversationId: string,
    options?: {
      collectionMethod?: '360' | 'survey' | 'interview' | 'focus_group' | 'mixed';
      confidentiality?: 'anonymous' | 'confidential' | 'identified';
      includeDownward?: boolean;
      includeUpward?: boolean;
      includePeer?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'gatherInput',
        payload: {
          feedbackSources,
          collectionMethod: options?.collectionMethod,
          confidentiality: options?.confidentiality,
          includeDownward: options?.includeDownward,
          includeUpward: options?.includeUpward,
          includePeer: options?.includePeer,
        },
      },
      conversationId
    );
  }

  public async processFeedbackData(
    conversationId: string,
    options?: {
      processingType?: 'standardization' | 'normalization' | 'aggregation' | 'all';
      removeOutliers?: boolean;
      flagInvalidResponses?: boolean;
      generateQualityMetrics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'processFeedbackData',
        payload: {
          processingType: options?.processingType,
          removeOutliers: options?.removeOutliers,
          flagInvalidResponses: options?.flagInvalidResponses,
          generateQualityMetrics: options?.generateQualityMetrics,
        },
      },
      conversationId
    );
  }

  public async analyzeFeedbackPatterns(
    conversationId: string,
    options?: {
      analysisType?: 'thematic' | 'sentiment' | 'behavioral' | 'comparative';
      includeStatisticalAnalysis?: boolean;
      identifyConsistencies?: boolean;
      identifyConflicts?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeFeedbackPatterns',
        payload: {
          analysisType: options?.analysisType,
          includeStatisticalAnalysis: options?.includeStatisticalAnalysis,
          identifyConsistencies: options?.identifyConsistencies,
          identifyConflicts: options?.identifyConflicts,
        },
      },
      conversationId
    );
  }

  public async generateFeedbackSummary(
    conversationId: string,
    options?: {
      summaryFormat?: 'dashboard' | 'narrative' | 'bullets' | 'detailed';
      includeStrengths?: boolean;
      includeDevelopmentAreas?: boolean;
      includeAggregates?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateFeedbackSummary',
        payload: {
          summaryFormat: options?.summaryFormat,
          includeStrengths: options?.includeStrengths,
          includeDevelopmentAreas: options?.includeDevelopmentAreas,
          includeAggregates: options?.includeAggregates,
        },
      },
      conversationId
    );
  }

  public async trackFeedbackOverTime(
    conversationId: string,
    options?: {
      timeWindow?: '6month' | '1year' | '18month' | '2year';
      trendMetrics?: ('improvement' | 'decline' | 'stability' | 'volatility')[];
      compareToBaseline?: boolean;
      generateForecasts?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackFeedbackOverTime',
        payload: {
          timeWindow: options?.timeWindow,
          trendMetrics: options?.trendMetrics,
          compareToBaseline: options?.compareToBaseline,
          generateForecasts: options?.generateForecasts,
        },
      },
      conversationId
    );
  }
}
