import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class RecipeCostingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'RecipeCostingTool',
      description: 'Calculates accurate food costs for menu items including ingredients, waste, and portion control',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the recipe costing tool.',
            enum: ['calculateItemCost', 'trackIngredientPrices', 'includeWasteFactor', 'updateCosts', 'generateCostReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific recipe costing action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async calculateItemCost(recipeId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateItemCost', payload: { recipeId } }, conversationId);
  }

  async trackIngredientPrices(ingredientId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackIngredientPrices', payload: { ingredientId } }, conversationId);
  }

  async includeWasteFactor(percentage: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'includeWasteFactor', payload: { percentage } }, conversationId);
  }

  async updateCosts(priceChanges: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'updateCosts', payload: { priceChanges } }, conversationId);
  }

  async generateCostReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateCostReport', payload: {} }, conversationId);
  }
}