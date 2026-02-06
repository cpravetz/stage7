import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class TaskDispatchTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'TaskDispatchTool',
      description: 'Routes guest requests and operational tasks to appropriate departments and staff members',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the task dispatch tool.',
            enum: ['assignStaff', 'routeRequest', 'balanceWorkload', 'trackTaskCompletion', 'generateDispatchReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific task dispatch action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async assignStaff(taskType: string, priority: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'assignStaff', payload: { taskType, priority } }, conversationId);
  }

  async routeRequest(department: string, details: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'routeRequest', payload: { department, details } }, conversationId);
  }

  async balanceWorkload(staffList: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'balanceWorkload', payload: { staffList } }, conversationId);
  }

  async trackTaskCompletion(taskId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackTaskCompletion', payload: { taskId } }, conversationId);
  }

  async generateDispatchReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateDispatchReport', payload: {} }, conversationId);
  }
}