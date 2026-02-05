import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ContentAdaptationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ContentAdaptationTool',
      description: 'Adapts content for different platforms while maintaining core message.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the content adaptation tool.',
            enum: ['adaptForPlatform', 'createPlatformVariations', 'optimizeContentLength'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific content adaptation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async adaptForPlatform(
    originalContent: any,
    targetPlatform: string,
    conversationId: string,
    options?: {
      targetAudience?: string;
      tone?: string;
      preserveKey?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'adaptForPlatform',
        payload: {
          originalContent,
          targetPlatform,
          targetAudience: options?.targetAudience,
          tone: options?.tone,
          preserveKey: options?.preserveKey,
        },
      },
      conversationId
    );
  }

  public async createPlatformVariations(
    content: any,
    platforms: string[],
    conversationId: string,
    options?: {
      targetAudience?: string;
      tone?: string;
      includeHashtags?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createPlatformVariations',
        payload: {
          content,
          platforms,
          targetAudience: options?.targetAudience,
          tone: options?.tone,
          includeHashtags: options?.includeHashtags,
        },
      },
      conversationId
    );
  }

  public async optimizeContentLength(
    content: any,
    platform: string,
    conversationId: string,
    options?: {
      targetAudience?: string;
      contentType?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'optimizeContentLength',
        payload: {
          content,
          platform,
          targetAudience: options?.targetAudience,
          contentType: options?.contentType,
        },
      },
      conversationId
    );
  }
}
