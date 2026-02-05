import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LegalRiskAssessmentTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'LegalRiskAssessmentTool',
      description: 'Evaluates legal and financial risks in contracts and legal documents.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the legal risk assessment tool.',
            enum: ['evaluateRisks', 'analyzeLiabilityClauses', 'generateRiskReport', 'compareRiskLevels'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific legal risk assessment action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async evaluateRisks(contractContent: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'evaluateRisks', payload: { contractContent } }, conversationId);
  }

  public async analyzeLiabilityClauses(documentId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeLiabilityClauses', payload: { documentId } }, conversationId);
  }

  public async generateRiskReport(analysisResults: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateRiskReport', payload: { analysisResults } }, conversationId);
  }

  public async compareRiskLevels(contractIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'compareRiskLevels', payload: { contractIds } }, conversationId);
  }
}
