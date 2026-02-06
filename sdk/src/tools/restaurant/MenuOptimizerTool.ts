import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class MenuOptimizerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MenuOptimizerTool',
      description: 'Recommends menu changes to improve profitability and guest satisfaction',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the menu optimizer tool.',
            enum: ['recommendChanges', 'optimizePricing', 'suggestMenuMix', 'analyzeCompetition', 'generateOptimizationReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific menu optimizer action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async recommendChanges(currentMenu: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'recommendChanges', payload: { currentMenu } }, conversationId);
  }

  async optimizePricing(itemId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizePricing', payload: { itemId } }, conversationId);
  }

  async suggestMenuMix(goals: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'suggestMenuMix', payload: { goals } }, conversationId);
  }

  async analyzeCompetition(marketData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeCompetition', payload: { marketData } }, conversationId);
  }

  async generateOptimizationReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateOptimizationReport', payload: {} }, conversationId);
  }
}