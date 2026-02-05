import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class StaffSchedulerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'StaffSchedulerTool',
      description: 'Creates optimized staff schedules balancing labor costs, coverage needs, and employee preferences',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the staff scheduler tool.',
            enum: ['optimizeShifts', 'handleTimeOffRequests', 'findCoverageReplacements', 'trackOvertimeRisks', 'generateSchedule'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific staff scheduling action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async optimizeShifts(requirements: any, availability: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeShifts', payload: { requirements, availability } }, conversationId);
  }

  async handleTimeOffRequests(staffId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleTimeOffRequests', payload: { staffId } }, conversationId);
  }

  async findCoverageReplacements(shiftId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findCoverageReplacements', payload: { shiftId } }, conversationId);
  }

  async trackOvertimeRisks(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackOvertimeRisks', payload: {} }, conversationId);
  }

  async generateSchedule(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateSchedule', payload: { period } }, conversationId);
  }
}