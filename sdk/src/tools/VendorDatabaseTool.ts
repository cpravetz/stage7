import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class VendorDatabaseTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'VendorDatabaseTool',
      description: 'Accesses comprehensive database of event vendors with ratings and reviews.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the vendor database tool.',
            enum: ['findVendors', 'getVendorRatings', 'compareVendorQuotes'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific vendor database action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async findVendors(serviceType: string, location: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findVendors', payload: { serviceType, location } }, conversationId);
  }

  public async getVendorRatings(vendorIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'getVendorRatings', payload: { vendorIds } }, conversationId);
  }

  public async compareVendorQuotes(vendorIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'compareVendorQuotes', payload: { vendorIds } }, conversationId);
  }
}
