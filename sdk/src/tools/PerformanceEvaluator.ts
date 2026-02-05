import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PerformanceEvaluator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'PerformanceEvaluator',
      description: 'Assesses investment performance using multiple metrics and benchmark comparisons.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the performance evaluator.',
            enum: ['assessReturns', 'calculatePerformanceMetrics', 'compareAgainstBenchmarks', 'generatePerformanceReports', 'analyzeRiskAdjustedReturns'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific performance evaluation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async assessReturns(investmentData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'assessReturns', payload: { investmentData } }, conversationId);
  }

  public async calculatePerformanceMetrics(conversationId: string): Promise<any> {
    return this.execute({ action: 'calculatePerformanceMetrics', payload: {} }, conversationId);
  }

  public async compareAgainstBenchmarks(conversationId: string): Promise<any> {
    return this.execute({ action: 'compareAgainstBenchmarks', payload: {} }, conversationId);
  }

  public async generatePerformanceReports(conversationId: string): Promise<any> {
    return this.execute({ action: 'generatePerformanceReports', payload: {} }, conversationId);
  }

  public async analyzeRiskAdjustedReturns(conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeRiskAdjustedReturns', payload: {} }, conversationId);
  }
}
