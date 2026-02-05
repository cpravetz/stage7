import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class FinancialAnalyticsTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FinancialAnalyticsTool',
      description: 'Provides comprehensive financial reporting including P&L, cost analysis, and performance metrics',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the financial analytics tool.',
            enum: ['gatherData', 'generatePL', 'calculatePrimeCost', 'trackKeyMetrics', 'generateFinancialDashboard'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific financial analytics action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async gatherData(period: string, categories: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'gatherData', payload: { period, categories } }, conversationId);
  }

  async generatePL(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generatePL', payload: { period } }, conversationId);
  }

  async calculatePrimeCost(conversationId: string): Promise<any> {
    return this.execute({ action: 'calculatePrimeCost', payload: {} }, conversationId);
  }

  async trackKeyMetrics(KPIs: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackKeyMetrics', payload: { KPIs } }, conversationId);
  }

  async generateFinancialDashboard(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateFinancialDashboard', payload: {} }, conversationId);
  }
}