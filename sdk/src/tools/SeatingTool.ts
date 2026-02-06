import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class SeatingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'SeatingTool',
      description: 'Creates optimized seating arrangements for events.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the seating tool.',
            enum: ['generateSeatingChart', 'optimizeSeating', 'exportSeatingPlan'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific seating action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateSeatingChart(guestList: any, venueLayout: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateSeatingChart', payload: { guestList, venueLayout } }, conversationId);
  }

  public async optimizeSeating(preferences: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeSeating', payload: { preferences } }, conversationId);
  }

  public async exportSeatingPlan(format: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'exportSeatingPlan', payload: { format } }, conversationId);
  }
}
