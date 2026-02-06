import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class GuestProfileTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'GuestProfileTool',
      description: 'Manages comprehensive guest profiles including preferences, history, loyalty status, and special requirements',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the guest profile tool.',
            enum: ['retrievePreferences', 'updateGuestHistory', 'analyzeLoyaltyStatus', 'identifyVIPGuests', 'generateGuestInsights'],
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

  async retrievePreferences(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'retrievePreferences', payload: { guestId } }, conversationId);
  }

  async updateGuestHistory(stayDetails: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'updateGuestHistory', payload: { stayDetails } }, conversationId);
  }

  async analyzeLoyaltyStatus(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeLoyaltyStatus', payload: { guestId } }, conversationId);
  }

  async identifyVIPGuests(conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyVIPGuests', payload: {} }, conversationId);
  }

  async generateGuestInsights(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateGuestInsights', payload: {} }, conversationId);
  }
}