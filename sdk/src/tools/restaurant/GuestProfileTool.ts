import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class GuestProfileTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'GuestProfileTool',
      description: 'Maintains detailed guest profiles including dining history, preferences, allergies, and special occasions',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the guest profile tool.',
            enum: ['retrieveHistory', 'recordPreferences', 'trackDietaryRestrictions', 'identifyVIPGuests', 'generateGuestInsights'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific guest profile action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async retrieveHistory(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'retrieveHistory', payload: { guestId } }, conversationId);
  }

  async recordPreferences(guestId: string, preferences: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'recordPreferences', payload: { guestId, preferences } }, conversationId);
  }

  async trackDietaryRestrictions(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackDietaryRestrictions', payload: { guestId } }, conversationId);
  }

  async identifyVIPGuests(conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyVIPGuests', payload: {} }, conversationId);
  }

  async generateGuestInsights(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateGuestInsights', payload: {} }, conversationId);
  }
}