import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LinkedInTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'LinkedInTool',
      description: 'Enables candidate sourcing and profile analysis from LinkedIn.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the LinkedIn tool.',
            enum: ['searchProfiles', 'getProfileDetails', 'analyzeNetworkConnections'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific LinkedIn action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async searchProfiles(keywords: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'searchProfiles', payload: { keywords } }, conversationId);
  }

  public async getProfileDetails(profileId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getProfileDetails', payload: { profileId } }, conversationId);
  }

  public async analyzeNetworkConnections(profileId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeNetworkConnections', payload: { profileId } }, conversationId);
  }
}
