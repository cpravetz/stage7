import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class AttendeeTrackerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'AttendeeTrackerTool',
      description: 'Manages attendee lists, RSVPs, and preferences.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the attendee tracker tool.',
            enum: ['importGuestList', 'sendInvitations', 'trackRSVPs', 'manageDietaryPreferences', 'generateAttendeeReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific attendee tracking action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async importGuestList(file: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'importGuestList', payload: { file } }, conversationId);
  }

  public async sendInvitations(guestList: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'sendInvitations', payload: { guestList } }, conversationId);
  }

  public async trackRSVPs(eventId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackRSVPs', payload: { eventId } }, conversationId);
  }

  public async manageDietaryPreferences(guestIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'manageDietaryPreferences', payload: { guestIds } }, conversationId);
  }

  public async generateAttendeeReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateAttendeeReport', payload: {} }, conversationId);
  }
}
