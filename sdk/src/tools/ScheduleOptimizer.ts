import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ScheduleOptimizer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ScheduleOptimizer',
      description: 'Optimizes complex appointment schedules considering urgency, provider availability, and patient constraints.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the schedule optimizer.',
            enum: ['analyzeScheduleConstraints', 'prioritizeUrgentAppointments', 'optimizeMultiProviderSchedule', 'generateScheduleOptions', 'evaluateScheduleEfficiency'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific schedule optimization action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeScheduleConstraints(data: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeScheduleConstraints', payload: { data } }, conversationId);
  }

  public async prioritizeUrgentAppointments(list: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'prioritizeUrgentAppointments', payload: { list } }, conversationId);
  }

  public async optimizeMultiProviderSchedule(providers: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeMultiProviderSchedule', payload: { providers } }, conversationId);
  }

  public async generateScheduleOptions(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateScheduleOptions', payload: {} }, conversationId);
  }

  public async evaluateScheduleEfficiency(conversationId: string): Promise<any> {
    return this.execute({ action: 'evaluateScheduleEfficiency', payload: {} }, conversationId);
  }
}
