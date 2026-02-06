import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ContentPlannerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ContentPlannerTool',
      description: 'Manages content calendars and editorial planning.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the content planner tool.',
            enum: ['createCalendar', 'updateContentSchedule', 'getContentPipeline', 'identifyContentGaps'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific content planner action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createCalendar(
    contentPlan: any,
    conversationId: string,
    options?: {
      targetAudience?: string;
      contentGoals?: string[];
      timeframe?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createCalendar',
        payload: {
          contentPlan,
          targetAudience: options?.targetAudience,
          contentGoals: options?.contentGoals,
          timeframe: options?.timeframe,
        },
      },
      conversationId
    );
  }

  public async updateContentSchedule(
    calendarId: string,
    changes: any,
    conversationId: string,
    options?: {
      reason?: string;
      approvalRequired?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'updateContentSchedule',
        payload: {
          calendarId,
          changes,
          reason: options?.reason,
          approvalRequired: options?.approvalRequired,
        },
      },
      conversationId
    );
  }

  public async getContentPipeline(
    status: string,
    conversationId: string,
    options?: {
      filter?: string;
      sortBy?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getContentPipeline',
        payload: {
          status,
          filter: options?.filter,
          sortBy: options?.sortBy,
        },
      },
      conversationId
    );
  }

  public async identifyContentGaps(
    calendarId: string,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      contentTypes?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyContentGaps',
        payload: {
          calendarId,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          contentTypes: options?.contentTypes,
        },
      },
      conversationId
    );
  }
}
