import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class SalesAnalyticsTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'SalesAnalyticsTool',
      description: 'Analyzes sales performance by item, category, daypart, and server',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the sales analytics tool.',
            enum: ['analyzeItemPerformance', 'trackCategoryMix', 'evaluateDaypartSales', 'assessServerPerformance', 'generateSalesReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific sales analytics action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async analyzeItemPerformance(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeItemPerformance', payload: { period } }, conversationId);
  }

  async trackCategoryMix(categories: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackCategoryMix', payload: { categories } }, conversationId);
  }

  async evaluateDaypartSales(daypart: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'evaluateDaypartSales', payload: { daypart } }, conversationId);
  }

  async assessServerPerformance(serverId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'assessServerPerformance', payload: { serverId } }, conversationId);
  }

  async generateSalesReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateSalesReport', payload: {} }, conversationId);
  }
}