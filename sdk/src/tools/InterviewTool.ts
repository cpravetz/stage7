import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InterviewTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'InterviewTool',
      description: 'Manages interview scheduling, coordination, and feedback collection.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the interview tool.',
            enum: ['scheduleInterviews', 'sendInterviewInvites', 'collectFeedback', 'generateInterviewReports'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific interview action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async scheduleInterviews(
    candidateIds: string[],
    interviewerIds: string[],
    conversationId: string,
    options?: {
      position?: string;
      interviewType?: 'phone' | 'video' | 'in-person';
      timeframe?: string;
      sendReminders?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'scheduleInterviews',
        payload: {
          candidateIds,
          interviewerIds,
          position: options?.position,
          interview_type: options?.interviewType,
          timeframe: options?.timeframe,
          send_reminders: options?.sendReminders,
        },
      },
      conversationId
    );
  }

  public async sendInterviewInvites(
    interviewData: any,
    conversationId: string,
    options?: {
      includeCalendarInvite?: boolean;
      includeJobDescription?: boolean;
      customMessage?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'sendInterviewInvites',
        payload: {
          interviewData,
          include_calendar_invite: options?.includeCalendarInvite,
          include_job_description: options?.includeJobDescription,
          custom_message: options?.customMessage,
        },
      },
      conversationId
    );
  }

  public async collectFeedback(
    interviewId: string,
    conversationId: string,
    options?: {
      feedbackTemplate?: string;
      includeScoring?: boolean;
      requireComments?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'collectFeedback',
        payload: {
          interviewId,
          feedback_template: options?.feedbackTemplate,
          include_scoring: options?.includeScoring,
          require_comments: options?.requireComments,
        },
      },
      conversationId
    );
  }

  public async generateInterviewReports(
    candidateId: string,
    conversationId: string,
    options?: {
      includeScores?: boolean;
      includeRecommendations?: boolean;
      format?: 'summary' | 'detailed';
    }
  ): Promise<any> {
    return this.execute({ action: 'generateInterviewReports', payload: { candidateId } }, conversationId);
  }
}
