import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LegalResearchTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'LegalResearchTool',
      description: 'Performs comprehensive legal research across case law databases and legal resources.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the legal research tool.',
            enum: ['searchCaseLaw', 'findLegalPrecedents', 'getCaseDetails', 'analyzeLegalTrends'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific legal research action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async searchCaseLaw(
    keywords: string[],
    jurisdiction: string,
    conversationId: string,
    options?: {
      caseType?: string;
      dateRange?: { start: string; end: string };
      precedent?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'searchCaseLaw',
        payload: {
          keywords,
          jurisdiction,
          case_type: options?.caseType,
          date_range: options?.dateRange,
          precedent: options?.precedent,
        },
      },
      conversationId
    );
  }

  public async findLegalPrecedents(
    legalIssue: string,
    conversationId: string,
    options?: {
      jurisdiction?: string;
      includeInternational?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'findLegalPrecedents',
        payload: {
          legalIssue,
          jurisdiction: options?.jurisdiction,
          include_international: options?.includeInternational,
        },
      },
      conversationId
    );
  }

  public async getCaseDetails(
    caseId: string,
    conversationId: string,
    options?: {
      includeAnalysis?: boolean;
      includeCitations?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'getCaseDetails',
        payload: {
          caseId,
          include_analysis: options?.includeAnalysis,
          include_citations: options?.includeCitations,
        },
      },
      conversationId
    );
  }

  public async analyzeLegalTrends(
    topic: string,
    conversationId: string,
    options?: {
      jurisdiction?: string;
      timeframe?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'analyzeLegalTrends',
        payload: {
          topic,
          jurisdiction: options?.jurisdiction,
          timeframe: options?.timeframe,
        },
      },
      conversationId
    );
  }
}

