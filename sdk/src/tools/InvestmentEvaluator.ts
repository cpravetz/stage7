import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InvestmentEvaluator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'InvestmentEvaluator',
      description: 'Evaluates specific investment opportunities using fundamental and technical analysis methods.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the investment evaluator.',
            enum: ['assessOpportunities', 'performFundamentalAnalysis', 'conductTechnicalAnalysis', 'generateInvestmentReports', 'compareInvestmentOptions'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific investment evaluation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async assessOpportunities(investmentData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'assessOpportunities', payload: { investmentData } }, conversationId);
  }

  public async performFundamentalAnalysis(conversationId: string): Promise<any> {
    return this.execute({ action: 'performFundamentalAnalysis', payload: {} }, conversationId);
  }

  public async conductTechnicalAnalysis(conversationId: string): Promise<any> {
    return this.execute({ action: 'conductTechnicalAnalysis', payload: {} }, conversationId);
  }

  public async generateInvestmentReports(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateInvestmentReports', payload: {} }, conversationId);
  }

  public async compareInvestmentOptions(conversationId: string): Promise<any> {
    return this.execute({ action: 'compareInvestmentOptions', payload: {} }, conversationId);
  }
}
