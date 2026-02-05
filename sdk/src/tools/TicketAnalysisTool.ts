import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class TicketAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'TicketAnalysisTool',
      description: 'Provides comprehensive support ticket analysis and prioritization capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the ticket analysis tool.',
            enum: ['analyzeTickets', 'prioritizeTickets', 'categorizeIssues', 'detectUrgency'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific ticket analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeTickets(ticketData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeTickets', payload: { ticketData } }, conversationId);
  }

  public async prioritizeTickets(tickets: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'prioritizeTickets', payload: { tickets } }, conversationId);
  }

  public async categorizeIssues(ticketText: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'categorizeIssues', payload: { ticketText } }, conversationId);
  }

  public async detectUrgency(ticketData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'detectUrgency', payload: { ticketData } }, conversationId);
  }
}
