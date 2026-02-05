import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ServerCommunicationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ServerCommunicationTool',
      description: 'Facilitates real-time communication between front and back-of-house during service',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the server communication tool.',
            enum: ['sendUpdates', 'alertKitchenTiming', 'notifySpecialRequests', 'broadcastAnnouncements', 'trackCommunicationLog'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific server communication action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async sendUpdates(serverId: string, message: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'sendUpdates', payload: { serverId, message } }, conversationId);
  }

  async alertKitchenTiming(tableId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'alertKitchenTiming', payload: { tableId } }, conversationId);
  }

  async notifySpecialRequests(orderId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'notifySpecialRequests', payload: { orderId } }, conversationId);
  }

  async broadcastAnnouncements(messageType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'broadcastAnnouncements', payload: { messageType } }, conversationId);
  }

  async trackCommunicationLog(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackCommunicationLog', payload: {} }, conversationId);
  }
}