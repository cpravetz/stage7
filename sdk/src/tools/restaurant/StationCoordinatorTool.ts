import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class StationCoordinatorTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'StationCoordinatorTool',
      description: 'Balances workload across kitchen stations and identifies potential bottlenecks',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the station coordinator tool.',
            enum: ['balanceWorkload', 'identifyBottlenecks', 'redistributeTasks', 'trackStationPerformance', 'generateKitchenReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific station coordinator action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async balanceWorkload(stations: any, orders: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'balanceWorkload', payload: { stations, orders } }, conversationId);
  }

  async identifyBottlenecks(currentState: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyBottlenecks', payload: { currentState } }, conversationId);
  }

  async redistributeTasks(overloadedStation: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'redistributeTasks', payload: { overloadedStation } }, conversationId);
  }

  async trackStationPerformance(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackStationPerformance', payload: {} }, conversationId);
  }

  async generateKitchenReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateKitchenReport', payload: {} }, conversationId);
  }
}