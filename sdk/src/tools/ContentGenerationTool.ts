import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ContentGenerationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ContentGenerationTool',
      description: 'Generates high-quality content for various platforms and formats.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the content generation tool.',
            enum: ['generateBlogPost', 'generateSocialPosts', 'createVideoScript', 'writeEmailNewsletter'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific content generation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateBlogPost(
    topic: string,
    outline: any,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      keywords?: string[];
      tone?: string;
      length?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateBlogPost',
        payload: {
          topic,
          outline,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          keywords: options?.keywords,
          tone: options?.tone,
          length: options?.length,
        },
      },
      conversationId
    );
  }

  public async generateSocialPosts(
    platform: string,
    contentBrief: any,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      hashtags?: string[];
      tone?: string;
      callToAction?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateSocialPosts',
        payload: {
          platform,
          contentBrief,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          hashtags: options?.hashtags,
          tone: options?.tone,
          callToAction: options?.callToAction,
        },
      },
      conversationId
    );
  }

  public async createVideoScript(
    topic: string,
    style: string,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      duration?: string;
      tone?: string;
      keyMessages?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createVideoScript',
        payload: {
          topic,
          style,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          duration: options?.duration,
          tone: options?.tone,
          keyMessages: options?.keyMessages,
        },
      },
      conversationId
    );
  }

  public async writeEmailNewsletter(
    template: string,
    content: any,
    conversationId: string,
    options?: {
      contentGoals?: string[];
      targetAudience?: string;
      subject?: string;
      tone?: string;
      callToAction?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'writeEmailNewsletter',
        payload: {
          template,
          content,
          contentGoals: options?.contentGoals,
          targetAudience: options?.targetAudience,
          subject: options?.subject,
          tone: options?.tone,
          callToAction: options?.callToAction,
        },
      },
      conversationId
    );
  }
}
