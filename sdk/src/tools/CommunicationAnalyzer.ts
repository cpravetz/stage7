import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CommunicationAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CommunicationAnalyzer',
      description: 'Assesses communication skills, style, and effectiveness for targeted coaching and improvement.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the communication analyzer.',
            enum: ['assessSkills', 'analyzeCommunicationStyle', 'evaluateEffectiveness', 'generateCommunicationReport', 'identifyImprovementAreas'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific communication analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async assessSkills(
    communicationData: any,
    conversationId: string,
    options?: {
      skillCategories?: ('clarity' | 'engagement' | 'listening' | 'empathy' | 'persuasion')[];
      context?: 'professional' | 'presentation' | 'interpersonal' | 'written' | 'mixed';
      generateScore?: boolean;
      includeBenchmarks?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'assessSkills',
        payload: {
          communicationData,
          skillCategories: options?.skillCategories,
          context: options?.context,
          generateScore: options?.generateScore,
          includeBenchmarks: options?.includeBenchmarks,
        },
      },
      conversationId
    );
  }

  public async analyzeCommunicationStyle(
    conversationId: string,
    options?: {
      styleCategories?: ('assertive' | 'passive' | 'aggressive' | 'cooperative' | 'direct' | 'indirect')[];
      effectiveness?: 'high_impact' | 'moderate' | 'low_impact';
      contextual?: boolean;
      suggestAlternatives?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeCommunicationStyle',
        payload: {
          styleCategories: options?.styleCategories,
          effectiveness: options?.effectiveness,
          contextual: options?.contextual,
          suggestAlternatives: options?.suggestAlternatives,
        },
      },
      conversationId
    );
  }

  public async evaluateEffectiveness(
    conversationId: string,
    options?: {
      effectivenessMetrics?: ('message_clarity' | 'audience_engagement' | 'call_to_action' | 'feedback_response' | 'goal_achievement')[];
      compareToGoals?: boolean;
      includeImpact?: boolean;
      generateMetrics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'evaluateEffectiveness',
        payload: {
          effectivenessMetrics: options?.effectivenessMetrics,
          compareToGoals: options?.compareToGoals,
          includeImpact: options?.includeImpact,
          generateMetrics: options?.generateMetrics,
        },
      },
      conversationId
    );
  }

  public async generateCommunicationReport(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'comparative' | 'development_plan';
      includeStrengths?: boolean;
      includeWeaknesses?: boolean;
      generateActionItems?: boolean;
      timeframe?: 'immediate' | 'short_term' | 'long_term';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCommunicationReport',
        payload: {
          reportFormat: options?.reportFormat,
          includeStrengths: options?.includeStrengths,
          includeWeaknesses: options?.includeWeaknesses,
          generateActionItems: options?.generateActionItems,
          timeframe: options?.timeframe,
        },
      },
      conversationId
    );
  }

  public async identifyImprovementAreas(
    conversationId: string,
    options?: {
      prioritizeBy?: 'impact' | 'difficulty' | 'effort' | 'importance';
      targetRole?: string;
      generateCoaching?: boolean;
      generateResources?: boolean;
      timeframe?: '30days' | '90days' | '6months' | '1year';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyImprovementAreas',
        payload: {
          prioritizeBy: options?.prioritizeBy,
          targetRole: options?.targetRole,
          generateCoaching: options?.generateCoaching,
          generateResources: options?.generateResources,
          timeframe: options?.timeframe,
        },
      },
      conversationId
    );
  }
}
