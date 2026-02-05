import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResponseTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ResponseTool',
      description: 'Generates intelligent, context-aware responses for customer inquiries.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the response tool.',
            enum: ['generateResponse', 'customizeResponse', 'translateResponse', 'generateFollowUp'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific response action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateResponse(ticketData: any, customerContext: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateResponse', payload: { ticketData, customerContext } }, conversationId);
  }

  public async customizeResponse(responseTemplate: string, customerData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'customizeResponse', payload: { responseTemplate, customerData } }, conversationId);
  }

  public async translateResponse(responseText: string, language: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'translateResponse', payload: { responseText, language } }, conversationId);
  }

  public async generateFollowUp(responseId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateFollowUp', payload: { responseId } }, conversationId);
  }
}
