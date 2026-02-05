import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class FloorManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FloorManagementTool',
      description: 'Manages dining room operations including section assignments, server workload, and guest flow',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the floor management tool.',
            enum: ['optimizeSeating', 'balanceSections', 'manageWalkIns', 'trackTableStatus', 'generateFloorAnalytics'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific floor management action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async optimizeSeating(currentState: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeSeating', payload: { currentState } }, conversationId);
  }

  async balanceSections(serverIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'balanceSections', payload: { serverIds } }, conversationId);
  }

  async manageWalkIns(partySize: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'manageWalkIns', payload: { partySize } }, conversationId);
  }

  async trackTableStatus(floor: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackTableStatus', payload: { floor } }, conversationId);
  }

  async generateFloorAnalytics(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateFloorAnalytics', payload: {} }, conversationId);
  }
}