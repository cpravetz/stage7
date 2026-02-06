import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class RoomAssignmentTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'RoomAssignmentTool',
      description: 'Optimizes room assignments based on guest preferences, room features, availability, and operational efficiency',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the room assignment tool.',
            enum: ['optimizeRoomSelection', 'assignRoomByCategory', 'handleUpgradeRequests', 'balanceOccupancy', 'generateAssignmentReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific room assignment action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async optimizeRoomSelection(guestProfile: any, preferences: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeRoomSelection', payload: { guestProfile, preferences } }, conversationId);
  }

  async assignRoomByCategory(roomType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'assignRoomByCategory', payload: { roomType } }, conversationId);
  }

  async handleUpgradeRequests(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleUpgradeRequests', payload: { guestId } }, conversationId);
  }

  async balanceOccupancy(floorPlan: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'balanceOccupancy', payload: { floorPlan } }, conversationId);
  }

  async generateAssignmentReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateAssignmentReport', payload: {} }, conversationId);
  }
}