import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ApplicationTracker extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ApplicationTracker',
      description: 'Organizes and manages job applications, statuses, and deadlines for comprehensive tracking.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the application tracker.',
            enum: ['organizeApplications', 'categorizeByStatus', 'setDeadlineReminders', 'generateApplicationReports', 'trackApplicationProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific application tracking action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async organizeApplications(
    applicationData: any,
    conversationId: string,
    options?: {
      organizationMethod?: 'byDate' | 'byCompany' | 'byRole' | 'byLocation' | 'byStatus';
      groupByStatus?: boolean;
      sortBy?: 'dateApplied' | 'deadline' | 'priority' | 'lastUpdated';
      includePrioritization?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'organizeApplications',
        payload: {
          applicationData,
          organizationMethod: options?.organizationMethod,
          groupByStatus: options?.groupByStatus,
          sortBy: options?.sortBy,
          includePrioritization: options?.includePrioritization,
        },
      },
      conversationId
    );
  }

  public async categorizeByStatus(
    conversationId: string,
    options?: {
      statusTypes?: ('applied' | 'pending' | 'interview' | 'rejected' | 'accepted' | 'negotiating')[];
      includeSubcategories?: boolean;
      generateStatistics?: boolean;
      identifyTrends?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'categorizeByStatus',
        payload: {
          statusTypes: options?.statusTypes,
          includeSubcategories: options?.includeSubcategories,
          generateStatistics: options?.generateStatistics,
          identifyTrends: options?.identifyTrends,
        },
      },
      conversationId
    );
  }

  public async setDeadlineReminders(
    conversationId: string,
    options?: {
      reminderTiming?: ('1day' | '3days' | '1week' | 'custom')[];
      notificationMethod?: 'email' | 'sms' | 'inApp' | 'all';
      prioritizeByDeadline?: boolean;
      flagCriticalDeadlines?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'setDeadlineReminders',
        payload: {
          reminderTiming: options?.reminderTiming,
          notificationMethod: options?.notificationMethod,
          prioritizeByDeadline: options?.prioritizeByDeadline,
          flagCriticalDeadlines: options?.flagCriticalDeadlines,
        },
      },
      conversationId
    );
  }

  public async generateApplicationReports(
    conversationId: string,
    options?: {
      reportType?: 'summary' | 'detailed' | 'analytics';
      includeMetrics?: ('applications' | 'responseRate' | 'interviewRate' | 'offerRate')[];
      timeRange?: 'week' | 'month' | 'quarter' | 'year' | 'all';
      includeComparison?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateApplicationReports',
        payload: {
          reportType: options?.reportType,
          includeMetrics: options?.includeMetrics,
          timeRange: options?.timeRange,
          includeComparison: options?.includeComparison,
        },
      },
      conversationId
    );
  }

  public async trackApplicationProgress(
    conversationId: string,
    options?: {
      metricsToTrack?: ('timeline' | 'feedback' | 'nextSteps' | 'communicationLog')[];
      updateFrequency?: 'daily' | 'weekly' | 'onUpdate';
      highlightSlow?: boolean;
      suggestFollowUp?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackApplicationProgress',
        payload: {
          metricsToTrack: options?.metricsToTrack,
          updateFrequency: options?.updateFrequency,
          highlightSlow: options?.highlightSlow,
          suggestFollowUp: options?.suggestFollowUp,
        },
      },
      conversationId
    );
  }
}
