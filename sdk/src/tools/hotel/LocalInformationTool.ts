import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class LocalInformationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'LocalInformationTool',
      description: 'Provides detailed local information including attractions, transportation, events, emergency services, and area insights',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the local information tool.',
            enum: ['retrieveDetails', 'getTransportationOptions', 'findEmergencyServices', 'provideAreaInsights', 'generateLocalGuide'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific local information action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async retrieveDetails(locationName: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'retrieveDetails', payload: { locationName } }, conversationId);
  }

  async getTransportationOptions(destination: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getTransportationOptions', payload: { destination } }, conversationId);
  }

  async findEmergencyServices(serviceType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findEmergencyServices', payload: { serviceType } }, conversationId);
  }

  async provideAreaInsights(neighborhood: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'provideAreaInsights', payload: { neighborhood } }, conversationId);
  }

  async generateLocalGuide(interests: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'generateLocalGuide', payload: { interests } }, conversationId);
  }
}