import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResumeOptimizer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ResumeOptimizer',
      description: 'Optimizes resume content and structure for specific job requirements and applicant tracking systems.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the resume optimizer.',
            enum: ['optimizeContent', 'tailorForATS', 'enhanceKeywordUsage', 'generateOptimizedResume', 'improveReadability'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific resume optimization action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async optimizeContent(
    resumeData: any,
    jobDescription: string,
    conversationId: string,
    options?: {
      targetRole?: string;
      targetCompany?: string;
      industry?: string;
      keywords?: string[];
      tone?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'optimizeContent',
        payload: {
          resumeData,
          jobDescription,
          targetRole: options?.targetRole,
          targetCompany: options?.targetCompany,
          industry: options?.industry,
          keywords: options?.keywords,
          tone: options?.tone,
        },
      },
      conversationId
    );
  }

  public async tailorForATS(
    conversationId: string,
    options?: {
      jobDescription?: string;
      resumeContent?: any;
      targetRole?: string;
      industry?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'tailorForATS',
        payload: {
          jobDescription: options?.jobDescription,
          resumeContent: options?.resumeContent,
          targetRole: options?.targetRole,
          industry: options?.industry,
        },
      },
      conversationId
    );
  }

  public async enhanceKeywordUsage(
    conversationId: string,
    options?: {
      jobDescription?: string;
      resumeContent?: any;
      industry?: string;
      requiredKeywords?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'enhanceKeywordUsage',
        payload: {
          jobDescription: options?.jobDescription,
          resumeContent: options?.resumeContent,
          industry: options?.industry,
          requiredKeywords: options?.requiredKeywords,
        },
      },
      conversationId
    );
  }

  public async generateOptimizedResume(
    conversationId: string,
    options?: {
      resumeData?: any;
      jobDescription?: string;
      targetRole?: string;
      format?: string;
      includeMetrics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateOptimizedResume',
        payload: {
          resumeData: options?.resumeData,
          jobDescription: options?.jobDescription,
          targetRole: options?.targetRole,
          format: options?.format,
          includeMetrics: options?.includeMetrics,
        },
      },
      conversationId
    );
  }

  public async improveReadability(
    conversationId: string,
    options?: {
      resumeContent?: any;
      targetAudience?: string;
      style?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'improveReadability',
        payload: {
          resumeContent: options?.resumeContent,
          targetAudience: options?.targetAudience,
          style: options?.style,
        },
      },
      conversationId
    );
  }
}
