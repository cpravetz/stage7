import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InvestmentEducator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'InvestmentEducator',
      description: 'Provides educational content and explanations of investment concepts and financial principles.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the investment educator.',
            enum: ['explainConcepts', 'createEducationalContent', 'developLearningMaterials', 'generateInvestmentGuides', 'assessKnowledgeGaps'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific investment education action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async explainConcepts(topic: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'explainConcepts', payload: { topic } }, conversationId);
  }

  public async createEducationalContent(conversationId: string): Promise<any> {
    return this.execute({ action: 'createEducationalContent', payload: {} }, conversationId);
  }

  public async developLearningMaterials(conversationId: string): Promise<any> {
    return this.execute({ action: 'developLearningMaterials', payload: {} }, conversationId);
  }

  public async generateInvestmentGuides(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateInvestmentGuides', payload: {} }, conversationId);
  }

  public async assessKnowledgeGaps(conversationId: string): Promise<any> {
    return this.execute({ action: 'assessKnowledgeGaps', payload: {} }, conversationId);
  }
}
