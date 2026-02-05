import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface CalendarEvent {
  id?: string;
  title: string;
  participants: string[];
  startTime: string;
  endTime: string;
  location?: string;
}

export class CalendarTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CalendarTool',
      description: 'Manages calendar events and schedules.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the calendar.',
            enum: ['getMeetings', 'scheduleMeeting'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific calendar action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
  * Retrieves a list of meetings for a given user within a date range.
  * @param userId The ID of the user.
  * @param dateRange The date range to search for meetings.
  * @returns A list of calendar events.
  */
  public async getMeetings(
    userId: string,
    dateRange: { start: string; end: string },
    conversationId: string,
    options?: {
      includeDeclined?: boolean;
      includeCancelled?: boolean;
      calendar?: string;
      showAvailabilityOnly?: boolean;
    }
  ): Promise<CalendarEvent[]> {
    const result = await this.execute(
      {
        action: 'getMeetings',
        payload: {
          userId,
          dateRange,
          include_declined: options?.includeDeclined,
          include_cancelled: options?.includeCancelled,
          calendar: options?.calendar,
          show_availability_only: options?.showAvailabilityOnly,
        },
      },
      conversationId
    );
    return result;
  }

  /**
  * Schedules a new meeting.
  * @param eventDetails The details of the event to schedule.
  * @returns The created calendar event with ID.
  */
  public async scheduleMeeting(
    eventDetails: Omit<CalendarEvent, 'id'>,
    conversationId: string,
    options?: {
      sendInvitations?: boolean;
      responseRequired?: boolean;
      calendar?: string;
      recurrence?: string;
      reminder?: number; // minutes before
    }
  ): Promise<CalendarEvent> {
    const result = await this.execute(
      {
        action: 'scheduleMeeting',
        payload: {
          ...eventDetails,
          send_invitations: options?.sendInvitations,
          response_required: options?.responseRequired,
          calendar: options?.calendar,
          recurrence: options?.recurrence,
          reminder_minutes: options?.reminder,
        },
      },
      conversationId
    );
    return result;
  }
}
