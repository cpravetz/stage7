import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ConciergeKnowledgeTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ConciergeKnowledgeTool',
      description: 'Provides comprehensive local knowledge and personalized recommendations for dining, entertainment, and activities',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the concierge knowledge tool.',
            enum: ['generateRecommendations', 'searchRestaurants', 'findActivities', 'provideDirections', 'retrieveEventCalendar'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific concierge action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async generateRecommendations(preferences: any, occasion: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateRecommendations', payload: { preferences, occasion } }, conversationId);
  }

  async searchRestaurants(cuisine: string, priceRange: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'searchRestaurants', payload: { cuisine, priceRange } }, conversationId);
  }

  async findActivities(interests: string[], date: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findActivities', payload: { interests, date } }, conversationId);
  }

  async provideDirections(destination: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'provideDirections', payload: { destination } }, conversationId);
  }

  async retrieveEventCalendar(dateRange: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'retrieveEventCalendar', payload: { dateRange } }, conversationId);
  }
}