import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ExternalBookingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ExternalBookingTool',
      description: 'Coordinates external reservations for restaurants, tours, transportation, and entertainment on behalf of guests',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the external booking tool.',
            enum: ['arrangeReservations', 'bookTransportation', 'reserveTours', 'confirmBookings', 'handleCancellations'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific external booking action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async arrangeReservations(venue: string, partySize: number, time: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'arrangeReservations', payload: { venue, partySize, time } }, conversationId);
  }

  async bookTransportation(type: string, destination: string, time: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'bookTransportation', payload: { type, destination, time } }, conversationId);
  }

  async reserveTours(tourType: string, date: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'reserveTours', payload: { tourType, date } }, conversationId);
  }

  async confirmBookings(bookingIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'confirmBookings', payload: { bookingIds } }, conversationId);
  }

  async handleCancellations(bookingId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleCancellations', payload: { bookingId } }, conversationId);
  }
}