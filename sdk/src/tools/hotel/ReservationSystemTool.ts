import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ReservationSystemTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ReservationSystemTool',
      description: 'Manages the complete reservation system including bookings, modifications, cancellations, and inventory management',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the reservation system tool.',
            enum: ['checkAvailability', 'createReservation', 'modifyBooking', 'cancelReservation', 'manageGroupBookings'],
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

  async checkAvailability(dateRange: any, roomType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'checkAvailability', payload: { dateRange, roomType } }, conversationId);
  }

  async createReservation(guestDetails: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createReservation', payload: { guestDetails } }, conversationId);
  }

  async modifyBooking(reservationId: string, changes: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'modifyBooking', payload: { reservationId, changes } }, conversationId);
  }

  async cancelReservation(reservationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'cancelReservation', payload: { reservationId } }, conversationId);
  }

  async manageGroupBookings(groupDetails: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'manageGroupBookings', payload: { groupDetails } }, conversationId);
  }
}