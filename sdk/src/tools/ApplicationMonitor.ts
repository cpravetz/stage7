import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ApplicationMonitor extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ApplicationMonitor',
      description: 'Monitors application status and provides updates on progress and follow-up requirements.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the application monitor.',
            enum: ['trackStatus', 'monitorDeadlines', 'identifyFollowupOpportunities', 'generateStatusReports', 'predictApplicationOutcomes'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific application monitoring action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async trackStatus(
    applicationData: any,
    conversationId: string,
    options?: {
      trackingMetrics?: ('timeline' | 'responsiveness' | 'engagement' | 'progress')[];
      alertOnNoProgress?: boolean;
      noProgressThreshold?: number;
      generateInsights?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackStatus',
        payload: {
          applicationData,
          trackingMetrics: options?.trackingMetrics,
          alertOnNoProgress: options?.alertOnNoProgress,
          noProgressThreshold: options?.noProgressThreshold,
          generateInsights: options?.generateInsights,
        },
      },
      conversationId
    );
  }

  public async monitorDeadlines(
    conversationId: string,
    options?: {
      deadlineType?: ('application' | 'interview' | 'response' | 'decision')[];
      alertTiming?: '1day' | '3days' | '1week' | 'custom';
      prioritizeUrgent?: boolean;
      flagAtRisk?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'monitorDeadlines',
        payload: {
          deadlineType: options?.deadlineType,
          alertTiming: options?.alertTiming,
          prioritizeUrgent: options?.prioritizeUrgent,
          flagAtRisk: options?.flagAtRisk,
        },
      },
      conversationId
    );
  }

  public async identifyFollowupOpportunities(
    conversationId: string,
    options?: {
      followupType?: ('email' | 'phone' | 'interview' | 'infoRequest' | 'statusCheck')[];
      timingSuggestion?: boolean;
      generateTemplates?: boolean;
      rankByPriority?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyFollowupOpportunities',
        payload: {
          followupType: options?.followupType,
          timingSuggestion: options?.timingSuggestion,
          generateTemplates: options?.generateTemplates,
          rankByPriority: options?.rankByPriority,
        },
      },
      conversationId
    );
  }

  public async generateStatusReports(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'dashboard';
      includeAnalytics?: boolean;
      timeframe?: 'weekly' | 'monthly' | 'custom';
      includeRecommendations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateStatusReports',
        payload: {
          reportFormat: options?.reportFormat,
          includeAnalytics: options?.includeAnalytics,
          timeframe: options?.timeframe,
          includeRecommendations: options?.includeRecommendations,
        },
      },
      conversationId
    );
  }

  public async predictApplicationOutcomes(
    conversationId: string,
    options?: {
      predictionModel?: 'conservative' | 'balanced' | 'optimistic';
      includeConfidenceScores?: boolean;
      identifyRiskFactors?: boolean;
      suggestImprovements?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'predictApplicationOutcomes',
        payload: {
          predictionModel: options?.predictionModel,
          includeConfidenceScores: options?.includeConfidenceScores,
          identifyRiskFactors: options?.identifyRiskFactors,
          suggestImprovements: options?.suggestImprovements,
        },
      },
      conversationId
    );
  }
}
