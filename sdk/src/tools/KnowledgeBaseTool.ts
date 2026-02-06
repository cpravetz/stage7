import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class KnowledgeBaseTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'KnowledgeBaseTool',
      description: 'Provides integration with knowledge base systems and self-service content.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the knowledge base tool.',
            enum: ['searchArticles', 'getArticleDetails', 'updateKnowledgeBase', 'generateFAQs'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific knowledge base action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async searchArticles(
    keywords: string[],
    conversationId: string,
    options?: {
      category?: string;
      language?: string;
      sortBy?: 'relevance' | 'date' | 'popularity';
      limit?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'searchArticles',
        payload: {
          keywords,
          category: options?.category,
          language: options?.language,
          sort_by: options?.sortBy,
          limit: options?.limit,
        },
      },
      conversationId
    );
  }

  public async getArticleDetails(
    articleId: string,
    conversationId: string,
    options?: {
      includeRelated?: boolean;
      includeMetadata?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getArticleDetails',
        payload: {
          articleId,
          include_related: options?.includeRelated,
          include_metadata: options?.includeMetadata,
        },
      },
      conversationId
    );
  }

  public async updateKnowledgeBase(
    articleData: any,
    conversationId: string,
    options?: {
      publishImmediately?: boolean;
      requiresApproval?: boolean;
      updateReferences?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'updateKnowledgeBase',
        payload: {
          articleData,
          publish_immediately: options?.publishImmediately,
          requires_approval: options?.requiresApproval,
          update_references: options?.updateReferences,
        },
      },
      conversationId
    );
  }

  public async generateFAQs(
    topic: string,
    conversationId: string,
    options?: {
      depth?: 'shallow' | 'medium' | 'deep';
      includeExamples?: boolean;
      targetAudience?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateFAQs',
        payload: {
          topic,
          depth: options?.depth,
          include_examples: options?.includeExamples,
          target_audience: options?.targetAudience,
        },
      },
      conversationId
    );
  }
}
