import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResumeAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ResumeAnalyzer',
      description: 'Evaluates resume effectiveness and identifies areas for improvement and optimization.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the resume analyzer.',
            enum: ['analyzeResume', 'assessContentQuality', 'evaluateFormatting', 'generateImprovementReports', 'compareAgainstJobDescription'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific resume analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeResume(
    resumeData: any,
    conversationId: string,
    options?: {
      analysisScope?: 'overall' | 'content' | 'format' | 'ats_optimization';
      generateScore?: boolean;
      includeSuggestions?: boolean;
      focusAreas?: ('skills' | 'experience' | 'education' | 'achievements')[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeResume',
        payload: {
          resumeData,
          analysisScope: options?.analysisScope,
          generateScore: options?.generateScore,
          includeSuggestions: options?.includeSuggestions,
          focusAreas: options?.focusAreas,
        },
      },
      conversationId
    );
  }

  public async assessContentQuality(
    conversationId: string,
    options?: {
      evaluateMetrics?: ('clarity' | 'impact' | 'completeness' | 'relevance' | 'metrics')[];
      compareToRole?: string;
      generateRanking?: boolean;
      suggestReplacements?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'assessContentQuality',
        payload: {
          evaluateMetrics: options?.evaluateMetrics,
          compareToRole: options?.compareToRole,
          generateRanking: options?.generateRanking,
          suggestReplacements: options?.suggestReplacements,
        },
      },
      conversationId
    );
  }

  public async evaluateFormatting(
    conversationId: string,
    options?: {
      formatChecks?: ('ats_friendly' | 'readability' | 'design' | 'consistency' | 'length')[];
      templatePreference?: 'modern' | 'traditional' | 'creative';
      flagIssues?: boolean;
      generateAlternatives?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'evaluateFormatting',
        payload: {
          formatChecks: options?.formatChecks,
          templatePreference: options?.templatePreference,
          flagIssues: options?.flagIssues,
          generateAlternatives: options?.generateAlternatives,
        },
      },
      conversationId
    );
  }

  public async generateImprovementReports(
    conversationId: string,
    options?: {
      prioritizeBy?: 'impact' | 'effort' | 'importance';
      reportFormat?: 'summary' | 'detailed' | 'action_items';
      includeExamples?: boolean;
      generateRevisions?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateImprovementReports',
        payload: {
          prioritizeBy: options?.prioritizeBy,
          reportFormat: options?.reportFormat,
          includeExamples: options?.includeExamples,
          generateRevisions: options?.generateRevisions,
        },
      },
      conversationId
    );
  }

  public async compareAgainstJobDescription(
    conversationId: string,
    options?: {
      includeScore?: boolean;
      flagGaps?: boolean;
      suggestAdditions?: boolean;
      prioritizeCritical?: boolean;
      highlightMatches?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'compareAgainstJobDescription',
        payload: {
          includeScore: options?.includeScore,
          flagGaps: options?.flagGaps,
          suggestAdditions: options?.suggestAdditions,
          prioritizeCritical: options?.prioritizeCritical,
          highlightMatches: options?.highlightMatches,
        },
      },
      conversationId
    );
  }
}
