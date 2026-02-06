import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ContentCreator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ContentCreator',
      description: 'Generates educational content including lesson plans, presentations, and interactive learning materials.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the content creator.',
            enum: ['generateMaterials', 'createLessonPlans', 'developInteractiveActivities', 'designMultimediaPresentations', 'generateTeacherGuides'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific content creation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateMaterials(
    learningObjectives: any,
    conversationId: string,
    options?: {
      materialsTypes?: ('handout' | 'slides' | 'workbook' | 'reference' | 'all')[];
      educationLevel?: 'elementary' | 'middle' | 'high' | 'university' | 'professional';
      includeAnswers?: boolean;
      includeVariations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateMaterials',
        payload: {
          learningObjectives,
          materialsTypes: options?.materialsTypes,
          educationLevel: options?.educationLevel,
          includeAnswers: options?.includeAnswers,
          includeVariations: options?.includeVariations,
        },
      },
      conversationId
    );
  }

  public async createLessonPlans(
    conversationId: string,
    options?: {
      duration?: 'short' | 'standard' | 'extended';
      includeTimings?: boolean;
      includeAssessments?: boolean;
      includeResourceList?: boolean;
      adaptiveInstructionSupport?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createLessonPlans',
        payload: {
          duration: options?.duration,
          includeTimings: options?.includeTimings,
          includeAssessments: options?.includeAssessments,
          includeResourceList: options?.includeResourceList,
          adaptiveInstructionSupport: options?.adaptiveInstructionSupport,
        },
      },
      conversationId
    );
  }

  public async developInteractiveActivities(
    conversationId: string,
    options?: {
      activityTypes?: ('simulation' | 'roleplay' | 'game' | 'discussion' | 'projectBased')[];
      engagementLevel?: 'low' | 'moderate' | 'high';
      technologyRequired?: boolean;
      groupConfiguration?: 'individual' | 'pair' | 'small' | 'whole';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'developInteractiveActivities',
        payload: {
          activityTypes: options?.activityTypes,
          engagementLevel: options?.engagementLevel,
          technologyRequired: options?.technologyRequired,
          groupConfiguration: options?.groupConfiguration,
        },
      },
      conversationId
    );
  }

  public async designMultimediaPresentations(
    conversationId: string,
    options?: {
      mediaTypes?: ('video' | 'animation' | 'audio' | 'interactive' | 'slides')[];
      designStyle?: 'minimalist' | 'detailed' | 'visual' | 'text-heavy';
      includeTranscripts?: boolean;
      includeAccessibilityFeatures?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'designMultimediaPresentations',
        payload: {
          mediaTypes: options?.mediaTypes,
          designStyle: options?.designStyle,
          includeTranscripts: options?.includeTranscripts,
          includeAccessibilityFeatures: options?.includeAccessibilityFeatures,
        },
      },
      conversationId
    );
  }

  public async generateTeacherGuides(
    conversationId: string,
    options?: {
      guideDepth?: 'overview' | 'detailed' | 'comprehensive';
      includeAnswerKeys?: boolean;
      includePedagogicalNotes?: boolean;
      includeDifferentiationStrategies?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateTeacherGuides',
        payload: {
          guideDepth: options?.guideDepth,
          includeAnswerKeys: options?.includeAnswerKeys,
          includePedagogicalNotes: options?.includePedagogicalNotes,
          includeDifferentiationStrategies: options?.includeDifferentiationStrategies,
        },
      },
      conversationId
    );
  }
}
