import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResourceTagger extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ResourceTagger',
      description: 'Adds educational metadata and tags to learning materials for enhanced searchability and standards alignment.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the resource tagger.',
            enum: ['addEducationalTags', 'createTaggingSchema', 'searchByLearningObjective', 'generateTaggingReport', 'validateStandardsAlignment'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific resource tagging action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async addEducationalTags(resourceId: string, standards: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'addEducationalTags', payload: { resourceId, standards } }, conversationId);
  }

  public async createTaggingSchema(subject: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'createTaggingSchema', payload: { subject } }, conversationId);
  }

  public async searchByLearningObjective(objectiveCode: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'searchByLearningObjective', payload: { objectiveCode } }, conversationId);
  }

  public async generateTaggingReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateTaggingReport', payload: {} }, conversationId);
  }

  public async validateStandardsAlignment(conversationId: string): Promise<any> {
    return this.execute({ action: 'validateStandardsAlignment', payload: {} }, conversationId);
  }
}
