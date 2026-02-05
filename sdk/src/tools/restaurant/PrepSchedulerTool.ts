import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class PrepSchedulerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'PrepSchedulerTool',
      description: 'Generates prioritized prep lists based on demand forecasts and inventory levels',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the prep scheduler tool.',
            enum: ['generatePrepList', 'prioritizeTasks', 'calculateQuantities', 'assignStations', 'trackPrepCompletion'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific prep scheduler action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async generatePrepList(date: string, menuItems: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generatePrepList', payload: { date, menuItems } }, conversationId);
  }

  async prioritizeTasks(urgency: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'prioritizeTasks', payload: { urgency } }, conversationId);
  }

  async calculateQuantities(forecast: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateQuantities', payload: { forecast } }, conversationId);
  }

  async assignStations(prepList: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'assignStations', payload: { prepList } }, conversationId);
  }

  async trackPrepCompletion(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackPrepCompletion', payload: {} }, conversationId);
  }
}