import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class OrderOptimizerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'OrderOptimizerTool',
      description: 'Optimizes purchase orders to minimize costs and delivery fees while maintaining freshness',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the order optimizer tool.',
            enum: ['consolidateOrders', 'calculateOrderQuantities', 'optimizeDeliverySchedule', 'minimizeFreight', 'generateOrderStrategy'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific order optimizer action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async consolidateOrders(suppliers: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'consolidateOrders', payload: { suppliers } }, conversationId);
  }

  async calculateOrderQuantities(demand: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateOrderQuantities', payload: { demand } }, conversationId);
  }

  async optimizeDeliverySchedule(suppliers: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeDeliverySchedule', payload: { suppliers } }, conversationId);
  }

  async minimizeFreight(orders: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'minimizeFreight', payload: { orders } }, conversationId);
  }

  async generateOrderStrategy(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateOrderStrategy', payload: {} }, conversationId);
  }
}