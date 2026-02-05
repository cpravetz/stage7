import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class RoomStatusTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'RoomStatusTool',
      description: 'Maintains real-time room status inventory including availability, cleaning status, and maintenance holds',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the room status tool.',
            enum: ['updateAvailability', 'trackRoomCondition', 'manageOutOfOrderRooms', 'syncInventorySystem', 'generateStatusDashboard'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific room status action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async updateAvailability(roomNumber: string, status: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'updateAvailability', payload: { roomNumber, status } }, conversationId);
  }

  async trackRoomCondition(roomNumber: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackRoomCondition', payload: { roomNumber } }, conversationId);
  }

  async manageOutOfOrderRooms(roomList: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'manageOutOfOrderRooms', payload: { roomList } }, conversationId);
  }

  async syncInventorySystem(conversationId: string): Promise<any> {
    return this.execute({ action: 'syncInventorySystem', payload: {} }, conversationId);
  }

  async generateStatusDashboard(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateStatusDashboard', payload: {} }, conversationId);
  }
}