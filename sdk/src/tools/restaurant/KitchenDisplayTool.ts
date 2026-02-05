import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class KitchenDisplayTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'KitchenDisplayTool',
      description: 'Manages kitchen ticket flow and order sequencing across stations',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the kitchen display tool.',
            enum: ['optimizeTicketFlow', 'coordinateMultiTable', 'prioritizeOrders', 'trackCookTimes', 'alertExpoReady'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific kitchen display action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async optimizeTicketFlow(orders: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeTicketFlow', payload: { orders } }, conversationId);
  }

  async coordinateMultiTable(orders: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'coordinateMultiTable', payload: { orders } }, conversationId);
  }

  async prioritizeOrders(urgency: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'prioritizeOrders', payload: { urgency } }, conversationId);
  }

  async trackCookTimes(orderId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackCookTimes', payload: { orderId } }, conversationId);
  }

  async alertExpoReady(orderId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'alertExpoReady', payload: { orderId } }, conversationId);
  }
}