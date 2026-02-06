import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ReportingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ReportingTool',
      description: 'Generates comprehensive financial reports and visualizations.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the reporting tool.',
            enum: ['generateReport', 'generateComplianceReport', 'createVisualizations', 'exportReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific reporting action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateReport(reportType: string, data: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateReport', payload: { reportType, data } }, conversationId);
  }

  public async generateComplianceReport(regulationType: string, data: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateComplianceReport', payload: { regulationType, data } }, conversationId);
  }

  public async createVisualizations(data: any, chartType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'createVisualizations', payload: { data, chartType } }, conversationId);
  }

  public async exportReport(reportId: string, format: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'exportReport', payload: { reportId, format } }, conversationId);
  }
}
