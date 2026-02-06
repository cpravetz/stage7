import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class GuestServiceTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'GuestServiceTool',
      description: 'Assists with guest service requests and complaint resolution through standardized procedures and solution recommendations',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the guest service tool.',
            enum: ['determineSolution', 'recommendCompensation', 'generateServiceRecovery', 'trackGuestSatisfaction', 'createServiceReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific guest service action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async determineSolution(issueType: string, severity: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'determineSolution', payload: { issueType, severity } }, conversationId);
  }

  async recommendCompensation(complaintDetails: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'recommendCompensation', payload: { complaintDetails } }, conversationId);
  }

  async generateServiceRecovery(scenario: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateServiceRecovery', payload: { scenario } }, conversationId);
  }

  async trackGuestSatisfaction(guestId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackGuestSatisfaction', payload: { guestId } }, conversationId);
  }

  async createServiceReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'createServiceReport', payload: {} }, conversationId);
  }
}