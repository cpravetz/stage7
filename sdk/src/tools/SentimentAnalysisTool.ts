import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class SentimentAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'SentimentAnalysisTool',
      description: 'Analyzes customer sentiment and emotional tone in support interactions.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the sentiment analysis tool.',
            enum: ['analyzeSentiment', 'trackSentimentTrends', 'detectFrustration', 'generateSentimentReports'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific sentiment analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeSentiment(
    interactionText: string,
    conversationId: string,
    options?: {
      sentimentType?: 'overall' | 'by_topic' | 'emotional_analysis' | 'intent';
      detailedMetrics?: boolean;
      includeConfidence?: boolean;
      flagNegative?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeSentiment',
        payload: {
          interactionText,
          sentimentType: options?.sentimentType,
          detailedMetrics: options?.detailedMetrics,
          includeConfidence: options?.includeConfidence,
          flagNegative: options?.flagNegative,
        },
      },
      conversationId
    );
  }

  public async trackSentimentTrends(
    timeRange: string,
    conversationId: string,
    options?: {
      trackBy?: 'day' | 'week' | 'month' | 'channel';
      compareToBaseline?: boolean;
      identifyInfluencers?: boolean;
      generateAlerts?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackSentimentTrends',
        payload: {
          timeRange,
          trackBy: options?.trackBy,
          compareToBaseline: options?.compareToBaseline,
          identifyInfluencers: options?.identifyInfluencers,
          generateAlerts: options?.generateAlerts,
        },
      },
      conversationId
    );
  }

  public async detectFrustration(
    interactionData: any,
    conversationId: string,
    options?: {
      frustrationType?: 'escalation' | 'churn_risk' | 'repeat_issue' | 'unresolved';
      severityThreshold?: number;
      recommendActions?: boolean;
      triggerEscalation?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'detectFrustration',
        payload: {
          interactionData,
          frustrationType: options?.frustrationType,
          severityThreshold: options?.severityThreshold,
          recommendActions: options?.recommendActions,
          triggerEscalation: options?.triggerEscalation,
        },
      },
      conversationId
    );
  }

  public async generateSentimentReports(
    customerId: string,
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'trend_analysis';
      timeRange?: '7days' | '30days' | '90days' | 'all';
      includeChannelBreakdown?: boolean;
      generateRecommendations?: boolean;
      compareToMetrics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateSentimentReports',
        payload: {
          customerId,
          reportFormat: options?.reportFormat,
          timeRange: options?.timeRange,
          includeChannelBreakdown: options?.includeChannelBreakdown,
          generateRecommendations: options?.generateRecommendations,
          compareToMetrics: options?.compareToMetrics,
        },
      },
      conversationId
    );
  }
}
