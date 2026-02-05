import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class BettingPerformanceAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        bettingData: {
          type: 'object',
          description: 'Betting history and performance data',
          properties: {
            bets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  betAmount: { type: 'number' },
                  odds: { type: 'number' },
                  outcome: { type: 'string', enum: ['win', 'loss', 'push'] },
                  date: { type: 'string' },
                  sport: { type: 'string' },
                  market: { type: 'string' }
                }
              }
            },
            bankrollHistory: { type: 'array', items: { type: 'number' } },
            timePeriod: { type: 'string', description: 'Time period for analysis' }
          }
        }
      },
      required: ['bettingData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        performanceMetrics: {
          type: 'object',
          description: 'Calculated performance metrics',
          properties: {
            winRate: { type: 'number' },
            roi: { type: 'number' },
            profitLoss: { type: 'number' },
            averageOdds: { type: 'number' }
          }
        },
        bettingPatterns: { type: 'string', description: 'Analysis of betting patterns' },
        performanceReports: { type: 'string', description: 'Comprehensive performance analysis report' },
        strengthsWeaknesses: { type: 'object', description: 'Identified strengths and weaknesses' }
      }
    };

    super({
      name: 'BettingPerformanceAnalyzer',
      description: 'Evaluates betting performance using multiple metrics and historical data analysis. Provides performance metrics with pattern analysis and improvement suggestions.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async analyzeHistory(
    bettingData: any,
    conversationId: string,
    options?: {
      analysisDepth?: 'summary' | 'detailed' | 'comprehensive';
      timeGranularity?: 'daily' | 'weekly' | 'monthly' | 'yearly';
      identifyTrends?: boolean;
      compareAgainstBaseline?: boolean;
      identifySeasonalPatterns?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bettingData,
        analysisDepth: options?.analysisDepth,
        timeGranularity: options?.timeGranularity,
        identifyTrends: options?.identifyTrends,
        compareAgainstBaseline: options?.compareAgainstBaseline,
        identifySeasonalPatterns: options?.identifySeasonalPatterns,
      },
      conversationId
    );
  }

  public async calculatePerformanceMetrics(
    bettingData: any,
    conversationId: string,
    options?: {
      metricsToInclude?: ('winRate' | 'roi' | 'profitLoss' | 'averageOdds' | 'sharpRatio' | 'drawdown')[];
      adjustForOdds?: boolean;
      timeWeighted?: boolean;
      includeExpectedValue?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bettingData,
        metricsToInclude: options?.metricsToInclude,
        adjustForOdds: options?.adjustForOdds,
        timeWeighted: options?.timeWeighted,
        includeExpectedValue: options?.includeExpectedValue,
      },
      conversationId
    );
  }

  public async evaluateBettingPatterns(
    bettingData: any,
    conversationId: string,
    options?: {
      patternCategories?: ('sport' | 'market' | 'stakeSize' | 'timing' | 'odds')[];
      identifyProfitableSports?: boolean;
      identifyLosingSports?: boolean;
      recommendFocusAreas?: boolean;
      suggestPatternAdjustments?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        bettingData,
        patternCategories: options?.patternCategories,
        identifyProfitableSports: options?.identifyProfitableSports,
        identifyLosingSports: options?.identifyLosingSports,
        recommendFocusAreas: options?.recommendFocusAreas,
        suggestPatternAdjustments: options?.suggestPatternAdjustments,
      },
      conversationId
    );
  }
}