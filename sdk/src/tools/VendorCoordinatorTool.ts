import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class VendorCoordinatorTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'VendorCoordinatorTool',
      description: 'Manages communication and coordination with multiple vendors.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the vendor coordinator tool.',
            enum: ['checkAvailability', 'sendBookingRequests', 'trackVendorStatus', 'manageVendorContracts'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific vendor coordinator action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async checkAvailability(vendorId: string, dateRange: { start: string, end: string }, conversationId: string): Promise<any> {
    return this.execute({ action: 'checkAvailability', payload: { vendorId, dateRange } }, conversationId);
  }

  public async sendBookingRequests(vendorIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'sendBookingRequests', payload: { vendorIds } }, conversationId);
  }

  public async trackVendorStatus(vendorIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'trackVendorStatus', payload: { vendorIds } }, conversationId);
  }

  public async manageVendorContracts(vendorIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'manageVendorContracts', payload: { vendorIds } }, conversationId);
  }
}
