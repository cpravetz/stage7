import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class GuestCommunicationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'GuestCommunicationTool',
      description: 'Manages guest communications including pre-arrival messages, in-stay updates, and post-departure follow-ups',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the guest communication tool.',
            enum: ['sendPreArrivalMessage', 'deliverInStayUpdate', 'generatePostStayFeedback', 'managePreferences', 'trackEngagement'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific guest communication action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async sendPreArrivalMessage(reservationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'sendPreArrivalMessage', payload: { reservationId } }, conversationId);
  }

  async deliverInStayUpdate(roomNumber: string, message: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'deliverInStayUpdate', payload: { roomNumber, message } }, conversationId);
  }

  async generatePostStayFeedback(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generatePostStayFeedback', payload: { guestId } }, conversationId);
  }

  async managePreferences(communicationType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'managePreferences', payload: { communicationType } }, conversationId);
  }

  async trackEngagement(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackEngagement', payload: {} }, conversationId);
  }
}