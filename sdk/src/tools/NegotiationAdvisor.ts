import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class NegotiationAdvisor extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'NegotiationAdvisor',
      description: 'Develops salary negotiation strategies and talking points for job offers.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the negotiation advisor.',
            enum: ['developStrategy', 'createNegotiationApproach', 'generateTalkingPoints', 'generateNegotiationReports', 'predictNegotiationOutcomes'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific negotiation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async developStrategy(offerData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'developStrategy', payload: { offerData } }, conversationId);
  }

  public async createNegotiationApproach(conversationId: string): Promise<any> {
    return this.execute({ action: 'createNegotiationApproach', payload: {} }, conversationId);
  }

  public async generateTalkingPoints(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateTalkingPoints', payload: {} }, conversationId);
  }

  public async generateNegotiationReports(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateNegotiationReports', payload: {} }, conversationId);
  }

  public async predictNegotiationOutcomes(conversationId: string): Promise<any> {
    return this.execute({ action: 'predictNegotiationOutcomes', payload: {} }, conversationId);
  }
}
