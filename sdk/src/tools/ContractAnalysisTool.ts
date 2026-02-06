import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ContractAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ContractAnalysisTool',
      description: 'Analyzes legal contracts to identify key clauses, obligations, risks, and compliance issues.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the contract analysis tool.',
            enum: ['analyzeDocument', 'extractKeyClauses', 'identifyRisks', 'compareContracts'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific contract analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeDocument(
    documentContent: any,
    conversationId: string,
    options?: {
      analysisType?: 'obligations' | 'risks' | 'compliance' | 'comprehensive';
      jurisdiction?: string;
      highlightClauses?: boolean;
      generateSummary?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeDocument',
        payload: {
          documentContent,
          analysisType: options?.analysisType,
          jurisdiction: options?.jurisdiction,
          highlightClauses: options?.highlightClauses,
          generateSummary: options?.generateSummary,
        },
      },
      conversationId
    );
  }

  public async extractKeyClauses(
    documentId: string,
    conversationId: string,
    options?: {
      clauseTypes?: ('payment' | 'liability' | 'termination' | 'confidentiality' | 'performance')[];
      includeComments?: boolean;
      prioritize?: 'risk' | 'importance' | 'frequency';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'extractKeyClauses',
        payload: {
          documentId,
          clauseTypes: options?.clauseTypes,
          includeComments: options?.includeComments,
          prioritize: options?.prioritize,
        },
      },
      conversationId
    );
  }

  public async identifyRisks(
    contractText: string,
    conversationId: string,
    options?: {
      riskLevel?: 'low' | 'medium' | 'high' | 'critical';
      riskCategories?: ('legal' | 'financial' | 'operational' | 'reputational')[];
      generateMitigation?: boolean;
      compareToTemplates?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'identifyRisks',
        payload: {
          contractText,
          riskLevel: options?.riskLevel,
          riskCategories: options?.riskCategories,
          generateMitigation: options?.generateMitigation,
          compareToTemplates: options?.compareToTemplates,
        },
      },
      conversationId
    );
  }

  public async compareContracts(
    contractIds: string[],
    conversationId: string,
    options?: {
      compareMetrics?: ('terms' | 'clauses' | 'risks' | 'pricing')[];
      highlightDifferences?: boolean;
      recommendBetter?: boolean;
      prioritize?: 'favorable' | 'risky' | 'comprehensive';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'compareContracts',
        payload: {
          contractIds,
          compareMetrics: options?.compareMetrics,
          highlightDifferences: options?.highlightDifferences,
          recommendBetter: options?.recommendBetter,
          prioritize: options?.prioritize,
        },
      },
      conversationId
    );
  }
}
