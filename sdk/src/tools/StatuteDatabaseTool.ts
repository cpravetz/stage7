import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class StatuteDatabaseTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'StatuteDatabaseTool',
      description: 'Accesses up-to-date statutory databases and regulatory frameworks.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the statute database tool.',
            enum: ['findStatutes', 'getRegulationDetails', 'checkStatutoryCompliance', 'trackRegulatoryChanges'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific statute database action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async findStatutes(jurisdiction: string, topic: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findStatutes', payload: { jurisdiction, topic } }, conversationId);
  }

  public async getRegulationDetails(regulationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getRegulationDetails', payload: { regulationId } }, conversationId);
  }

  public async checkStatutoryCompliance(documentContent: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'checkStatutoryCompliance', payload: { documentContent } }, conversationId);
  }

  public async trackRegulatoryChanges(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackRegulatoryChanges', payload: {} }, conversationId);
  }
}
