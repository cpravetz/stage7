import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class DocumentTaggingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DocumentTaggingTool',
      description: 'Adds metadata and tags to legal documents for improved search and retrieval.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the document tagging tool.',
            enum: ['addTags', 'extractMetadata', 'createTaggingSchema', 'searchByTags'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific document tagging action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async addTags(documentId: string, tags: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'addTags', payload: { documentId, tags } }, conversationId);
  }

  public async extractMetadata(documentContent: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'extractMetadata', payload: { documentContent } }, conversationId);
  }

  public async createTaggingSchema(caseType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'createTaggingSchema', payload: { caseType } }, conversationId);
  }

  public async searchByTags(tagList: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'searchByTags', payload: { tagList } }, conversationId);
  }
}
