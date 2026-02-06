import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class WasteManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'WasteManagementTool',
      description: 'Tracks food waste, identifies patterns, and recommends waste reduction strategies',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the waste management tool.',
            enum: ['recordWaste', 'analyzeWastePatterns', 'calculateWasteCost', 'recommendReductions', 'generateWasteReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific waste management action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async recordWaste(itemId: string, quantity: number, reason: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'recordWaste', payload: { itemId, quantity, reason } }, conversationId);
  }

  async analyzeWastePatterns(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeWastePatterns', payload: { period } }, conversationId);
  }

  async calculateWasteCost(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateWasteCost', payload: { period } }, conversationId);
  }

  async recommendReductions(category: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'recommendReductions', payload: { category } }, conversationId);
  }

  async generateWasteReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateWasteReport', payload: {} }, conversationId);
  }
}