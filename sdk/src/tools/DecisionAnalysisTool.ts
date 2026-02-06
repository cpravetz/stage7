import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class DecisionAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DecisionAnalysisTool',
      description: 'Analyzes strategic decision options, evaluates trade-offs, and provides data-driven recommendations for complex business choices.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the decision analysis tool.',
            enum: ['analyzeOptions', 'evaluateTradeoffs', 'compareAlternatives', 'generateDecisionReport', 'assessDecisionImpact'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific decision analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeOptions(
    decisionData: any,
    conversationId: string,
    options?: {
      analysisFramework?: 'multicriteria' | 'costBenefit' | 'decisionTree' | 'probabilistic';
      includeRiskAssessment?: boolean;
      identifyDominantOptions?: boolean;
      rankByPreference?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeOptions',
        payload: {
          decisionData,
          analysisFramework: options?.analysisFramework,
          includeRiskAssessment: options?.includeRiskAssessment,
          identifyDominantOptions: options?.identifyDominantOptions,
          rankByPreference: options?.rankByPreference,
        },
      },
      conversationId
    );
  }

  public async evaluateTradeoffs(
    conversationId: string,
    options?: {
      tradeoffFactors?: ('cost' | 'time' | 'quality' | 'risk' | 'scalability')[];
      prioritizationMethod?: 'weighted' | 'lexicographic' | 'equalWeight';
      generatePareto?: boolean;
      highlightConflicts?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'evaluateTradeoffs',
        payload: {
          tradeoffFactors: options?.tradeoffFactors,
          prioritizationMethod: options?.prioritizationMethod,
          generatePareto: options?.generatePareto,
          highlightConflicts: options?.highlightConflicts,
        },
      },
      conversationId
    );
  }

  public async compareAlternatives(
    conversationId: string,
    options?: {
      comparisonCriteria?: ('ROI' | 'feasibility' | 'impact' | 'alignment' | 'resources')[];
      generateSimilarityMatrix?: boolean;
      identifyBestMatch?: boolean;
      includeVisualization?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'compareAlternatives',
        payload: {
          comparisonCriteria: options?.comparisonCriteria,
          generateSimilarityMatrix: options?.generateSimilarityMatrix,
          identifyBestMatch: options?.identifyBestMatch,
          includeVisualization: options?.includeVisualization,
        },
      },
      conversationId
    );
  }

  public async generateDecisionReport(
    conversationId: string,
    options?: {
      reportFormat?: 'executive' | 'detailed' | 'technical';
      includeRationale?: boolean;
      includeAlternatives?: boolean;
      includeRiskAnalysis?: boolean;
      generateRecommendation?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateDecisionReport',
        payload: {
          reportFormat: options?.reportFormat,
          includeRationale: options?.includeRationale,
          includeAlternatives: options?.includeAlternatives,
          includeRiskAnalysis: options?.includeRiskAnalysis,
          generateRecommendation: options?.generateRecommendation,
        },
      },
      conversationId
    );
  }

  public async assessDecisionImpact(
    conversationId: string,
    options?: {
      impactCategories?: ('financial' | 'operational' | 'strategic' | 'organizational' | 'external')[];
      timeframe?: 'shortTerm' | 'mediumTerm' | 'longTerm';
      includeSecondaryEffects?: boolean;
      identifyRisks?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'assessDecisionImpact',
        payload: {
          impactCategories: options?.impactCategories,
          timeframe: options?.timeframe,
          includeSecondaryEffects: options?.includeSecondaryEffects,
          identifyRisks: options?.identifyRisks,
        },
      },
      conversationId
    );
  }
}
