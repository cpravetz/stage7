import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class OfferEvaluator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'OfferEvaluator',
      description: 'Assesses job offers and counteroffers for comprehensive evaluation and comparison.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the offer evaluator.',
            enum: ['assessCounter', 'compareMultipleOffers', 'evaluateTotalCompensation', 'generateOfferReports', 'analyzeLongTermValue'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific offer evaluation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async assessCounter(offerData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'assessCounter', payload: { offerData } }, conversationId);
  }

  public async compareMultipleOffers(conversationId: string): Promise<any> {
    return this.execute({ action: 'compareMultipleOffers', payload: {} }, conversationId);
  }

  public async evaluateTotalCompensation(conversationId: string): Promise<any> {
    return this.execute({ action: 'evaluateTotalCompensation', payload: {} }, conversationId);
  }

  public async generateOfferReports(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateOfferReports', payload: {} }, conversationId);
  }

  public async analyzeLongTermValue(conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeLongTermValue', payload: {} }, conversationId);
  }
}
