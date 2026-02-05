import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class MaintenanceTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MaintenanceTool',
      description: 'Manages maintenance work orders, tracks repair status, and coordinates preventive maintenance',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the maintenance tool.',
            enum: ['createWorkOrder', 'assignTechnician', 'trackRepairStatus', 'schedulePreventiveMaintenance', 'generateMaintenanceReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific maintenance action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async createWorkOrder(issueDetails: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createWorkOrder', payload: { issueDetails } }, conversationId);
  }

  async assignTechnician(workOrderId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'assignTechnician', payload: { workOrderId } }, conversationId);
  }

  async trackRepairStatus(workOrderId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackRepairStatus', payload: { workOrderId } }, conversationId);
  }

  async schedulePreventiveMaintenance(assetId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'schedulePreventiveMaintenance', payload: { assetId } }, conversationId);
  }

  async generateMaintenanceReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateMaintenanceReport', payload: {} }, conversationId);
  }
}