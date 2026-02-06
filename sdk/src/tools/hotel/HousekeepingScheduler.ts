import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class HousekeepingScheduler extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'HousekeepingScheduler',
      description: 'Optimizes housekeeping schedules and task assignments for maximum efficiency and guest satisfaction',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the housekeeping scheduler tool.',
            enum: ['optimizeAssignments', 'prioritizeRooms', 'trackCleaningProgress', 'manageLinenInventory', 'generateHousekeepingReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific housekeeping action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async optimizeAssignments(checkoutList: any[], staff: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeAssignments', payload: { checkoutList, staff } }, conversationId);
  }

  async prioritizeRooms(urgency: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'prioritizeRooms', payload: { urgency } }, conversationId);
  }

  async trackCleaningProgress(rooms: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'trackCleaningProgress', payload: { rooms } }, conversationId);
  }

  async manageLinenInventory(conversationId: string): Promise<any> {
    return this.execute({ action: 'manageLinenInventory', payload: {} }, conversationId);
  }

  async generateHousekeepingReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateHousekeepingReport', payload: {} }, conversationId);
  }
}