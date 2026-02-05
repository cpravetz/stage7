import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CommunicationScheduler extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CommunicationScheduler',
      description: 'Plans and schedules patient communications at appropriate times and through preferred channels.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the communication scheduler.',
            enum: ['scheduleMessages', 'optimizeCommunicationTiming', 'manageDeliveryChannels', 'generateCommunicationCalendar', 'trackDeliveryStatus'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific communication scheduling action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async scheduleMessages(
    messageList: any[],
    timingPreferences: any,
    conversationId: string,
    options?: {
      optimizeDelivery?: boolean;
      respectPatientPreferences?: boolean;
      considerTimeZones?: boolean;
      flagConflicts?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'scheduleMessages',
        payload: {
          messageList,
          timingPreferences,
          optimizeDelivery: options?.optimizeDelivery,
          respectPatientPreferences: options?.respectPatientPreferences,
          considerTimeZones: options?.considerTimeZones,
          flagConflicts: options?.flagConflicts,
        },
      },
      conversationId
    );
  }

  public async optimizeCommunicationTiming(
    conversationId: string,
    options?: {
      optimizationGoal?: 'engagement' | 'compliance' | 'costReduction' | 'patientSatisfaction';
      engagementHistory?: any;
      analyzePatternSuccess?: boolean;
      generateRecommendations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'optimizeCommunicationTiming',
        payload: {
          optimizationGoal: options?.optimizationGoal,
          engagementHistory: options?.engagementHistory,
          analyzePatternSuccess: options?.analyzePatternSuccess,
          generateRecommendations: options?.generateRecommendations,
        },
      },
      conversationId
    );
  }

  public async manageDeliveryChannels(
    conversationId: string,
    options?: {
      channelPreferences?: ('sms' | 'email' | 'push' | 'voice' | 'portal')[];
      prioritizeByAccessibility?: boolean;
      respectOpts?: boolean;
      trackDeliveryStatus?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'manageDeliveryChannels',
        payload: {
          channelPreferences: options?.channelPreferences,
          prioritizeByAccessibility: options?.prioritizeByAccessibility,
          respectOpts: options?.respectOpts,
          trackDeliveryStatus: options?.trackDeliveryStatus,
        },
      },
      conversationId
    );
  }

  public async generateCommunicationCalendar(
    conversationId: string,
    options?: {
      timeframe?: 'weekly' | 'monthly' | 'quarterly' | 'annual';
      includePatientMilestones?: boolean;
      includeReminders?: boolean;
      incorporatePreferences?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCommunicationCalendar',
        payload: {
          timeframe: options?.timeframe,
          includePatientMilestones: options?.includePatientMilestones,
          includeReminders: options?.includeReminders,
          incorporatePreferences: options?.incorporatePreferences,
        },
      },
      conversationId
    );
  }

  public async trackDeliveryStatus(
    conversationId: string,
    options?: {
      trackingMetrics?: ('delivered' | 'read' | 'engaged' | 'bounced')[];
      generateReport?: boolean;
      alertOnFailure?: boolean;
      identifyIssues?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackDeliveryStatus',
        payload: {
          trackingMetrics: options?.trackingMetrics,
          generateReport: options?.generateReport,
          alertOnFailure: options?.alertOnFailure,
          identifyIssues: options?.identifyIssues,
        },
      },
      conversationId
    );
  }
}
