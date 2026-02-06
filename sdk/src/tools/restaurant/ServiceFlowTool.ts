import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class ServiceFlowTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ServiceFlowTool',
      description: 'Monitors and coordinates real-time service flow across tables and courses',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the service flow tool.',
            enum: ['trackTableProgress', 'coordinateCourseTiming', 'alertServiceIssues', 'optimizeTurnover', 'generateServiceReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific service flow action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async trackTableProgress(tableId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackTableProgress', payload: { tableId } }, conversationId);
  }

  async coordinateCourseTiming(tableGroup: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'coordinateCourseTiming', payload: { tableGroup } }, conversationId);
  }

  async alertServiceIssues(criteria: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'alertServiceIssues', payload: { criteria } }, conversationId);
  }

  async optimizeTurnover(tableId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeTurnover', payload: { tableId } }, conversationId);
  }

  async generateServiceReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateServiceReport', payload: {} }, conversationId);
  }
}