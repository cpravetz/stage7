import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class VarianceAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'VarianceAnalysisTool',
      description: 'Identifies and analyzes variances between actual and budgeted performance',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the variance analysis tool.',
            enum: ['identifyDeviations', 'analyzeFoodCostVariance', 'trackLaborVariance', 'explainVariances', 'generateVarianceReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific variance analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async identifyDeviations(category: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyDeviations', payload: { category } }, conversationId);
  }

  async analyzeFoodCostVariance(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeFoodCostVariance', payload: { period } }, conversationId);
  }

  async trackLaborVariance(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackLaborVariance', payload: { period } }, conversationId);
  }

  async explainVariances(deviations: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'explainVariances', payload: { deviations } }, conversationId);
  }

  async generateVarianceReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateVarianceReport', payload: {} }, conversationId);
  }
}