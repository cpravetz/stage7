import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class FinancialDataTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FinancialDataTool',
      description: 'Provides comprehensive financial data integration and management capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the financial data tool.',
            enum: ['importData', 'getHistoricalData', 'getFinancialStatements', 'getComplianceData'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific financial data action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async importData(dataSource: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'importData', payload: { dataSource } }, conversationId);
  }

  public async getHistoricalData(companyId: string, timeRange: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'getHistoricalData', payload: { companyId, timeRange } }, conversationId);
  }

  public async getFinancialStatements(companyId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getFinancialStatements', payload: { companyId } }, conversationId);
  }

  public async getComplianceData(regulationType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getComplianceData', payload: { regulationType } }, conversationId);
  }
}
