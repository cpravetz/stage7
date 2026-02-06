import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ReservationCoordinator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ReservationCoordinator',
      description: 'Resolves complex reservation issues including overbooking, cancellations, and special accommodation requests',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the reservation coordinator tool.',
            enum: ['resolveOverbooking', 'findAlternativeAccommodations', 'coordinateGroupRooming', 'handleLastMinuteChanges', 'manageWaitlist'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific reservation coordination action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async resolveOverbooking(affectedReservations: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'resolveOverbooking', payload: { affectedReservations } }, conversationId);
  }

  async findAlternativeAccommodations(requirements: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'findAlternativeAccommodations', payload: { requirements } }, conversationId);
  }

  async coordinateGroupRooming(groupId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'coordinateGroupRooming', payload: { groupId } }, conversationId);
  }

  async handleLastMinuteChanges(reservationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleLastMinuteChanges', payload: { reservationId } }, conversationId);
  }

  async manageWaitlist(conversationId: string): Promise<any> {
    return this.execute({ action: 'manageWaitlist', payload: {} }, conversationId);
  }
}