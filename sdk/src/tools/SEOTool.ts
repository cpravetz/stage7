import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class SEOTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'SEOTool',
      description: 'Optimizes content for search engines and discoverability.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the SEO tool.',
            enum: ['optimizeContent', 'generateSEOMetadata', 'analyzeKeywordPerformance', 'suggestRelatedKeywords'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific SEO action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async optimizeContent(
    content: any,
    keywords: string[],
    conversationId: string,
    options?: {
      targetAudience?: string;
      industry?: string;
      contentType?: string;
      language?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'optimizeContent',
        payload: {
          content,
          keywords,
          targetAudience: options?.targetAudience,
          industry: options?.industry,
          contentType: options?.contentType,
          language: options?.language,
        },
      },
      conversationId
    );
  }

  public async generateSEOMetadata(
    content: any,
    conversationId: string,
    options?: {
      keywords?: string[];
      targetAudience?: string;
      contentType?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateSEOMetadata',
        payload: {
          content,
          keywords: options?.keywords,
          targetAudience: options?.targetAudience,
          contentType: options?.contentType,
        },
      },
      conversationId
    );
  }

  public async analyzeKeywordPerformance(
    keywords: string[],
    conversationId: string,
    options?: {
      industry?: string;
      targetAudience?: string;
      timeRange?: string;
      competitors?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeKeywordPerformance',
        payload: {
          keywords,
          industry: options?.industry,
          targetAudience: options?.targetAudience,
          timeRange: options?.timeRange,
          competitors: options?.competitors,
        },
      },
      conversationId
    );
  }

  public async suggestRelatedKeywords(
    content: any,
    conversationId: string,
    options?: {
      industry?: string;
      targetAudience?: string;
      contentType?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'suggestRelatedKeywords',
        payload: {
          content,
          industry: options?.industry,
          targetAudience: options?.targetAudience,
          contentType: options?.contentType,
        },
      },
      conversationId
    );
  }
}
