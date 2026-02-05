import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ReservationSystemTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ReservationSystemTool',
      description: 'Manages comprehensive reservation system including bookings, waitlist, walk-ins, and cancellations',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the reservation system tool.',
            enum: ['checkAvailability', 'createReservation', 'manageWaitlist', 'handleCancellations', 'sendConfirmations', 'trackNoShows'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific reservation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async checkAvailability(dateTime: string, partySize: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'checkAvailability', payload: { dateTime, partySize } }, conversationId);
  }

  async createReservation(guestDetails: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createReservation', payload: { guestDetails } }, conversationId);
  }

  async manageWaitlist(priority: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'manageWaitlist', payload: { priority } }, conversationId);
  }

  async handleCancellations(reservationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleCancellations', payload: { reservationId } }, conversationId);
  }

  async sendConfirmations(reservationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'sendConfirmations', payload: { reservationId } }, conversationId);
  }

  async trackNoShows(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackNoShows', payload: {} }, conversationId);
  }
}