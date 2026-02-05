import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class TableManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'TableManagementTool',
      description: 'Optimizes table assignments and seating arrangements for maximum efficiency and guest satisfaction',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the table management tool.',
            enum: ['optimizeSeating', 'calculateTurnoverTime', 'balanceServerSections', 'handleSpecialRequests', 'generateFloorMap'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific table management action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async optimizeSeating(floorPlan: any, reservations: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeSeating', payload: { floorPlan, reservations } }, conversationId);
  }

  async calculateTurnoverTime(tableId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateTurnoverTime', payload: { tableId } }, conversationId);
  }

  async balanceServerSections(assignments: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'balanceServerSections', payload: { assignments } }, conversationId);
  }

  async handleSpecialRequests(preferences: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleSpecialRequests', payload: { preferences } }, conversationId);
  }

  async generateFloorMap(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateFloorMap', payload: {} }, conversationId);
  }
}