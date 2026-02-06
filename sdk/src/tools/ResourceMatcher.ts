import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResourceMatcher extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ResourceMatcher',
      description: 'Matches patient needs with appropriate healthcare resources considering specialty, location, and insurance requirements.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the resource matcher.',
            enum: ['analyzePatientRequirements', 'evaluateResourceCompatibility', 'generateMatchingOptions', 'optimizeResourceAllocation', 'trackMatchingSuccess'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific resource matching action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzePatientRequirements(
    data: any,
    conversationId: string,
    options?: {
      requirementType?: 'specialty' | 'location' | 'insurance' | 'accessibility' | 'comprehensive';
      prioritizeBy?: 'accessibility' | 'quality' | 'distance' | 'cost' | 'reputation';
      includePreferences?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzePatientRequirements',
        payload: {
          data,
          requirementType: options?.requirementType,
          prioritizeBy: options?.prioritizeBy,
          includePreferences: options?.includePreferences,
        },
      },
      conversationId
    );
  }

  public async evaluateResourceCompatibility(
    resources: any,
    conversationId: string,
    options?: {
      compatibilityFactors?: ('specialty' | 'location' | 'insurance' | 'availability' | 'rating')[];
      matchingThreshold?: number;
      returnTopMatches?: number;
      includeAlternatives?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'evaluateResourceCompatibility',
        payload: {
          resources,
          compatibilityFactors: options?.compatibilityFactors,
          matchingThreshold: options?.matchingThreshold,
          returnTopMatches: options?.returnTopMatches,
          includeAlternatives: options?.includeAlternatives,
        },
      },
      conversationId
    );
  }

  public async generateMatchingOptions(
    conversationId: string,
    options?: {
      matchCount?: 3 | 5 | 10 | 'all';
      includeRanking?: boolean;
      includeComparison?: boolean;
      includeDistances?: boolean;
      includeWaitTimes?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateMatchingOptions',
        payload: {
          matchCount: options?.matchCount,
          includeRanking: options?.includeRanking,
          includeComparison: options?.includeComparison,
          includeDistances: options?.includeDistances,
          includeWaitTimes: options?.includeWaitTimes,
        },
      },
      conversationId
    );
  }

  public async optimizeResourceAllocation(
    conversationId: string,
    options?: {
      optimizationMetrics?: ('cost' | 'quality' | 'access' | 'balanced')[];
      considerCapacity?: boolean;
      considerDemand?: boolean;
      generateAlternatives?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'optimizeResourceAllocation',
        payload: {
          optimizationMetrics: options?.optimizationMetrics,
          considerCapacity: options?.considerCapacity,
          considerDemand: options?.considerDemand,
          generateAlternatives: options?.generateAlternatives,
        },
      },
      conversationId
    );
  }

  public async trackMatchingSuccess(
    conversationId: string,
    options?: {
      successMetrics?: ('patient_satisfaction' | 'engagement' | 'outcomes' | 'access' | 'cost')[];
      timeWindow?: '30days' | '90days' | '6months' | '1year';
      compareToBaseline?: boolean;
      generateReport?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'trackMatchingSuccess',
        payload: {
          successMetrics: options?.successMetrics,
          timeWindow: options?.timeWindow,
          compareToBaseline: options?.compareToBaseline,
          generateReport: options?.generateReport,
        },
      },
      conversationId
    );
  }
}
