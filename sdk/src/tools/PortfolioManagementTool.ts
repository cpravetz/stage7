import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface Asset {
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  assetType: 'stock' | 'bond' | 'etf' | 'crypto' | 'commodity' | 'other';
}

interface Portfolio {
  id: string;
  name: string;
  assets: Asset[];
  totalValue: number;
  totalCost: number;
  totalReturn: number;
  returnPercentage: number;
}

interface PortfolioAllocation {
  assetType: string;
  value: number;
  percentage: number;
}

interface RebalanceRecommendation {
  currentAllocation: PortfolioAllocation[];
  targetAllocation: PortfolioAllocation[];
  actions: {
    action: 'buy' | 'sell';
    symbol: string;
    quantity: number;
    reason: string;
  }[];
}

export class PortfolioManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'PortfolioManagementTool',
      description: 'Manages investment portfolios including tracking, analysis, and rebalancing.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the portfolio management tool.',
            enum: ['getPortfolio', 'addAsset', 'removeAsset', 'analyzePerformance', 'rebalancePortfolio', 'getAllocation'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific portfolio management action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Retrieves portfolio details.
   * @param portfolioId The ID of the portfolio.
   * @returns Portfolio information.
   */
  public async getPortfolio(
    portfolioId: string,
    conversationId: string,
    options?: {
      includePerformanceMetrics?: boolean;
      includeBenchmarks?: boolean;
      includeRiskMetrics?: boolean;
    }
  ): Promise<Portfolio> {
    const result = await this.execute(
      {
        action: 'getPortfolio',
        payload: {
          portfolioId,
          include_performance_metrics: options?.includePerformanceMetrics,
          include_benchmarks: options?.includeBenchmarks,
          include_risk_metrics: options?.includeRiskMetrics,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Adds an asset to the portfolio.
   * @param portfolioId The ID of the portfolio.
   * @param asset The asset to add.
   * @returns Updated portfolio.
   */
  public async addAsset(
    portfolioId: string,
    asset: Asset,
    conversationId: string,
    options?: {
      rebalanceAfter?: boolean;
      taxLotTracking?: boolean;
    }
  ): Promise<Portfolio> {
    const result = await this.execute(
      {
        action: 'addAsset',
        payload: {
          portfolioId,
          asset,
          rebalance_after: options?.rebalanceAfter,
          tax_lot_tracking: options?.taxLotTracking,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Removes an asset from the portfolio.
   * @param portfolioId The ID of the portfolio.
   * @param symbol The symbol of the asset to remove.
   * @returns Updated portfolio.
   */
  public async removeAsset(
    portfolioId: string,
    symbol: string,
    conversationId: string,
    options?: {
      taxLotSelection?: 'fifo' | 'lifo' | 'lowestCost' | 'highestCost';
      rebalanceAfter?: boolean;
    }
  ): Promise<Portfolio> {
    const result = await this.execute(
      {
        action: 'removeAsset',
        payload: {
          portfolioId,
          symbol,
          tax_lot_selection: options?.taxLotSelection,
          rebalance_after: options?.rebalanceAfter,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Analyzes portfolio performance.
   * @param portfolioId The ID of the portfolio.
   * @param timeRange The time range for analysis.
   * @returns Performance analysis.
   */
  public async analyzePerformance(
    portfolioId: string,
    timeRange: { start: string; end: string },
    conversationId: string,
    options?: {
      includeBenchmarkComparison?: boolean;
      includeRiskAnalysis?: boolean;
      includeAttribution?: boolean;
    }
  ): Promise<any> {
    const result = await this.execute(
      {
        action: 'analyzePerformance',
        payload: {
          portfolioId,
          timeRange,
          include_benchmark_comparison: options?.includeBenchmarkComparison,
          include_risk_analysis: options?.includeRiskAnalysis,
          include_attribution: options?.includeAttribution,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Generates rebalancing recommendations.
   * @param portfolioId The ID of the portfolio.
   * @param targetAllocation The desired allocation percentages.
   * @returns Rebalancing recommendations.
   */
  public async rebalancePortfolio(
    portfolioId: string,
    targetAllocation: PortfolioAllocation[],
    conversationId: string,
    options?: {
      considerTaxLoss?: boolean;
      considerTransactionCosts?: boolean;
      driftThreshold?: number;
    }
  ): Promise<RebalanceRecommendation> {
    const result = await this.execute(
      {
        action: 'rebalancePortfolio',
        payload: {
          portfolioId,
          targetAllocation,
          consider_tax_loss: options?.considerTaxLoss,
          consider_transaction_costs: options?.considerTransactionCosts,
          drift_threshold: options?.driftThreshold,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Gets current portfolio allocation.
   * @param portfolioId The ID of the portfolio.
   * @returns Current allocation breakdown.
   */
  public async getAllocation(
    portfolioId: string,
    conversationId: string,
    options?: {
      groupBy?: 'assetType' | 'sector' | 'geography';
      includeCash?: boolean;
    }
  ): Promise<PortfolioAllocation[]> {
    const result = await this.execute(
      {
        action: 'getAllocation',
        payload: {
          portfolioId,
          group_by: options?.groupBy,
          include_cash: options?.includeCash,
        },
      },
      conversationId
    );
    return result;
  }
}

