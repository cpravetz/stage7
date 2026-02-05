import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class BudgetTrackerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'BudgetTrackerTool',
      description: 'Comprehensive budget management and expense tracking system.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the budget tracker tool.',
            enum: ['createBudget', 'updateExpenses', 'generateBudgetReport', 'setBudgetAlerts'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific budget tracking action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createBudget(
    eventType: string,
    estimatedCosts: any,
    conversationId: string,
    options?: {
      budgetType?: 'event' | 'personal' | 'project' | 'operational';
      timeframe?: 'one_time' | 'monthly' | 'quarterly' | 'annual';
      allocateContingency?: boolean;
      contingencyPercent?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createBudget',
        payload: {
          eventType,
          estimatedCosts,
          budgetType: options?.budgetType,
          timeframe: options?.timeframe,
          allocateContingency: options?.allocateContingency,
          contingencyPercent: options?.contingencyPercent,
        },
      },
      conversationId
    );
  }

  public async updateExpenses(
    category: string,
    amount: number,
    conversationId: string,
    options?: {
      expenseType?: 'actual' | 'estimated' | 'forecast';
      updateActuals?: boolean;
      flagVariance?: boolean;
      varianceThreshold?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'updateExpenses',
        payload: {
          category,
          amount,
          expenseType: options?.expenseType,
          updateActuals: options?.updateActuals,
          flagVariance: options?.flagVariance,
          varianceThreshold: options?.varianceThreshold,
        },
      },
      conversationId
    );
  }

  public async generateBudgetReport(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'variance_analysis' | 'trend';
      includeVariance?: boolean;
      includeForecasts?: boolean;
      compareToPrevious?: boolean;
      timeWindow?: 'month_to_date' | 'quarter_to_date' | 'year_to_date';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateBudgetReport',
        payload: {
          reportFormat: options?.reportFormat,
          includeVariance: options?.includeVariance,
          includeForecasts: options?.includeForecasts,
          compareToPrevious: options?.compareToPrevious,
          timeWindow: options?.timeWindow,
        },
      },
      conversationId
    );
  }

  public async setBudgetAlerts(
    thresholds: any,
    conversationId: string,
    options?: {
      alertTypes?: ('spending_limit' | 'variance' | 'category_overrun' | 'cash_flow')[];
      alertThreshold?: number;
      notificationMethod?: ('email' | 'sms' | 'in_app' | 'dashboard')[];
      escalationRules?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'setBudgetAlerts',
        payload: {
          thresholds,
          alertTypes: options?.alertTypes,
          alertThreshold: options?.alertThreshold,
          notificationMethod: options?.notificationMethod,
          escalationRules: options?.escalationRules,
        },
      },
      conversationId
    );
  }
}
