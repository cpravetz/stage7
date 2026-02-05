import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FollowUpTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FollowUpTool',
      description: 'Manages customer follow-up and satisfaction verification.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the follow-up tool.',
            enum: ['scheduleFollowUp', 'sendSatisfactionSurvey', 'trackResolutionStatus', 'generateFollowUpReports'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific follow-up action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async scheduleFollowUp(
    ticketId: string,
    timeFrame: string,
    conversationId: string,
    options?: {
      followUpType?: 'satisfaction' | 'statusCheck' | 'reminder' | 'escalation';
      priority?: 'high' | 'normal' | 'low';
      notificationMethod?: 'email' | 'sms' | 'inApp' | 'call';
      assignToAgent?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'scheduleFollowUp',
        payload: {
          ticketId,
          timeFrame,
          followUpType: options?.followUpType,
          priority: options?.priority,
          notificationMethod: options?.notificationMethod,
          assignToAgent: options?.assignToAgent,
        },
      },
      conversationId
    );
  }

  public async sendSatisfactionSurvey(
    customerId: string,
    conversationId: string,
    options?: {
      surveyType?: 'csat' | 'nps' | 'ces' | 'comprehensive';
      deliveryChannel?: 'email' | 'sms' | 'inApp' | 'call';
      includeFollowUp?: boolean;
      incentivize?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'sendSatisfactionSurvey',
        payload: {
          customerId,
          surveyType: options?.surveyType,
          deliveryChannel: options?.deliveryChannel,
          includeFollowUp: options?.includeFollowUp,
          incentivize: options?.incentivize,
        },
      },
      conversationId
    );
  }

  public async trackResolutionStatus(
    ticketId: string,
    conversationId: string,
    options?: {
      statusIndicators?: ('resolved' | 'inProgress' | 'onHold' | 'escalated')[];
      trackingFrequency?: 'realtime' | 'hourly' | 'daily';
      flagDelay?: boolean;
      notifyOnChange?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackResolutionStatus',
        payload: {
          ticketId,
          statusIndicators: options?.statusIndicators,
          trackingFrequency: options?.trackingFrequency,
          flagDelay: options?.flagDelay,
          notifyOnChange: options?.notifyOnChange,
        },
      },
      conversationId
    );
  }

  public async generateFollowUpReports(
    agentId: string,
    conversationId: string,
    options?: {
      reportFormat?: 'individual' | 'team' | 'summary' | 'detailed';
      metricsToInclude?: ('satisfactionScore' | 'resolutionRate' | 'followUpRate' | 'timeToResolve')[];
      timeframe?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
      includeBenchmarks?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateFollowUpReports',
        payload: {
          agentId,
          reportFormat: options?.reportFormat,
          metricsToInclude: options?.metricsToInclude,
          timeframe: options?.timeframe,
          includeBenchmarks: options?.includeBenchmarks,
        },
      },
      conversationId
    );
  }
}
