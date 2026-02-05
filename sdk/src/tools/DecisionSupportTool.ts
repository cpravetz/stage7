import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class DecisionSupportTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DecisionSupportTool',
      description: 'Assists with investment decision-making by analyzing options and evaluating trade-offs.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the decision support tool.',
            enum: ['analyzeOptions', 'evaluateTradeoffs', 'compareInvestmentScenarios', 'generateDecisionReports', 'assessOpportunityCosts'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific decision support action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeOptions(
    investmentChoices: any,
    conversationId: string,
    options?: {
      evaluationCriteria?: ('return' | 'risk' | 'liquidity' | 'tax_efficiency' | 'alignment')[];
      weightCriteria?: boolean;
      generateRanking?: boolean;
      includeSensitivity?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeOptions',
        payload: {
          investmentChoices,
          evaluationCriteria: options?.evaluationCriteria,
          weightCriteria: options?.weightCriteria,
          generateRanking: options?.generateRanking,
          includeSensitivity: options?.includeSensitivity,
        },
      },
      conversationId
    );
  }

  public async evaluateTradeoffs(
    conversationId: string,
    options?: {
      tradeoffTypes?: ('risk_return' | 'growth_income' | 'growth_stability' | 'time_money')[];
      riskProfile?: 'conservative' | 'moderate' | 'aggressive';
      timeHorizon?: 'short' | 'medium' | 'long';
      highlightCritical?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'evaluateTradeoffs',
        payload: {
          tradeoffTypes: options?.tradeoffTypes,
          riskProfile: options?.riskProfile,
          timeHorizon: options?.timeHorizon,
          highlightCritical: options?.highlightCritical,
        },
      },
      conversationId
    );
  }

  public async compareInvestmentScenarios(
    conversationId: string,
    options?: {
      scenarioCount?: 3 | 5 | 7 | 10;
      scenarioType?: 'best_worst_expected' | 'risk_based' | 'custom';
      metrics?: ('return' | 'volatility' | 'sharpe' | 'max_drawdown')[];
      includeForecasts?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'compareInvestmentScenarios',
        payload: {
          scenarioCount: options?.scenarioCount,
          scenarioType: options?.scenarioType,
          metrics: options?.metrics,
          includeForecasts: options?.includeForecasts,
        },
      },
      conversationId
    );
  }

  public async generateDecisionReports(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'executive_brief' | 'comparative_analysis';
      includeRisks?: boolean;
      includeAssumptions?: boolean;
      includeRecommendation?: boolean;
      timeHorizon?: 'short' | 'medium' | 'long';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateDecisionReports',
        payload: {
          reportFormat: options?.reportFormat,
          includeRisks: options?.includeRisks,
          includeAssumptions: options?.includeAssumptions,
          includeRecommendation: options?.includeRecommendation,
          timeHorizon: options?.timeHorizon,
        },
      },
      conversationId
    );
  }

  public async assessOpportunityCosts(
    conversationId: string,
    options?: {
      compareTo?: 'benchmark' | 'alternatives' | 'historical' | 'target_return';
      timeHorizon?: '1year' | '5years' | '10years';
      includeInflation?: boolean;
      generateBreakeven?: boolean;
      suggestAlternatives?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'assessOpportunityCosts',
        payload: {
          compareTo: options?.compareTo,
          timeHorizon: options?.timeHorizon,
          includeInflation: options?.includeInflation,
          generateBreakeven: options?.generateBreakeven,
          suggestAlternatives: options?.suggestAlternatives,
        },
      },
      conversationId
    );
  }
}
