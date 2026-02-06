import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class StaffPerformanceTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'StaffPerformanceTool',
      description: 'Evaluates staff and departmental performance through service metrics, guest feedback, and operational efficiency measures',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the staff performance tool.',
            enum: ['generateMetrics', 'trackServiceQuality', 'analyzeGuestFeedback', 'identifyTrainingNeeds', 'createPerformanceReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific staff performance action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async generateMetrics(department: string, period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateMetrics', payload: { department, period } }, conversationId);
  }

  async trackServiceQuality(staffId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackServiceQuality', payload: { staffId } }, conversationId);
  }

  async analyzeGuestFeedback(department: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeGuestFeedback', payload: { department } }, conversationId);
  }

  async identifyTrainingNeeds(conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyTrainingNeeds', payload: {} }, conversationId);
  }

  async createPerformanceReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'createPerformanceReport', payload: {} }, conversationId);
  }
}