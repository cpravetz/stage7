import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class AssessmentGenerator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'AssessmentGenerator',
      description: 'Creates diverse assessment instruments including quizzes, tests, and performance tasks aligned with learning objectives.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the assessment generator.',
            enum: ['createQuestions', 'generateAssessmentTypes', 'balanceQuestionDistribution', 'ensureContentValidity', 'generateAnswerKeys'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific assessment generation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createQuestions(
    objectives: any,
    difficulty: string,
    conversationId: string,
    options?: {
      questionTypes?: ('multiple_choice' | 'short_answer' | 'essay' | 'project' | 'practical')[];
      bloomsLevel?: ('remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create')[];
      quantity?: number;
      includeAnswerKey?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createQuestions',
        payload: {
          objectives,
          difficulty,
          questionTypes: options?.questionTypes,
          bloomsLevel: options?.bloomsLevel,
          quantity: options?.quantity,
          includeAnswerKey: options?.includeAnswerKey,
        },
      },
      conversationId
    );
  }

  public async generateAssessmentTypes(
    conversationId: string,
    options?: {
      assessmentType?: 'formative' | 'summative' | 'diagnostic' | 'performance_based';
      aligned?: boolean;
      includeRubrics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateAssessmentTypes',
        payload: {
          assessmentType: options?.assessmentType,
          aligned: options?.aligned,
          includeRubrics: options?.includeRubrics,
        },
      },
      conversationId
    );
  }

  public async balanceQuestionDistribution(
    conversationId: string,
    options?: {
      targetDistribution?: Record<string, number>;
      bloomsBalance?: boolean;
      difficultyBalance?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'balanceQuestionDistribution',
        payload: {
          targetDistribution: options?.targetDistribution,
          bloomsBalance: options?.bloomsBalance,
          difficultyBalance: options?.difficultyBalance,
        },
      },
      conversationId
    );
  }

  public async ensureContentValidity(
    conversationId: string,
    options?: {
      alignmentCheck?: boolean;
      validityReport?: boolean;
      suggestImprovements?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'ensureContentValidity',
        payload: {
          alignmentCheck: options?.alignmentCheck,
          validityReport: options?.validityReport,
          suggestImprovements: options?.suggestImprovements,
        },
      },
      conversationId
    );
  }

  public async generateAnswerKeys(
    conversationId: string,
    options?: {
      includeRubrics?: boolean;
      includeScoringGuide?: boolean;
      detailLevel?: 'summary' | 'detailed' | 'comprehensive';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateAnswerKeys',
        payload: {
          includeRubrics: options?.includeRubrics,
          includeScoringGuide: options?.includeScoringGuide,
          detailLevel: options?.detailLevel,
        },
      },
      conversationId
    );
  }
}
