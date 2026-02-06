import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class RecipeManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'RecipeManagementTool',
      description: 'Maintains standardized recipes with ingredients, quantities, procedures, and plating instructions',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the recipe management tool.',
            enum: ['manageRecipes', 'standardizePortions', 'calculateScaling', 'trackRecipeVersions', 'generateRecipeCards'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific recipe management action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async manageRecipes(recipeId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'manageRecipes', payload: { recipeId } }, conversationId);
  }

  async standardizePortions(recipe: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'standardizePortions', payload: { recipe } }, conversationId);
  }

  async calculateScaling(servings: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateScaling', payload: { servings } }, conversationId);
  }

  async trackRecipeVersions(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackRecipeVersions', payload: {} }, conversationId);
  }

  async generateRecipeCards(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateRecipeCards', payload: {} }, conversationId);
  }
}