import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FinancialModelingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FinancialModelingTool',
      description: 'Creates and manages financial models for forecasting and scenario analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the financial modeling tool.',
            enum: ['createModel', 'runScenarios', 'calculateValuation', 'generateProjections'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific financial modeling action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createModel(modelType: string, assumptions: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createModel', payload: { modelType, assumptions } }, conversationId);
  }

  public async runScenarios(modelId: string, parameters: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'runScenarios', payload: { modelId, parameters } }, conversationId);
  }

  public async calculateValuation(modelId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateValuation', payload: { modelId } }, conversationId);
  }

  public async generateProjections(modelId: string, timeRange: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateProjections', payload: { modelId, timeRange } }, conversationId);
  }
}
