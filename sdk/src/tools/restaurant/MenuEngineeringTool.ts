import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class MenuEngineeringTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MenuEngineeringTool',
      description: 'Analyzes menu performance using profitability and popularity metrics',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the menu engineering tool.',
            enum: ['analyzePerformance', 'categorizeItems', 'identifyStars', 'recommendChanges', 'generateEngineeringMatrix'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific menu engineering action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async analyzePerformance(menuItems: any, salesData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzePerformance', payload: { menuItems, salesData } }, conversationId);
  }

  async categorizeItems(profitability: number, popularity: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'categorizeItems', payload: { profitability, popularity } }, conversationId);
  }

  async identifyStars(conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyStars', payload: {} }, conversationId);
  }

  async recommendChanges(category: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'recommendChanges', payload: { category } }, conversationId);
  }

  async generateEngineeringMatrix(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateEngineeringMatrix', payload: {} }, conversationId);
  }
}