import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CaseSearchTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CaseSearchTool',
      description: 'Provides advanced search capabilities for legal case files and documents.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the case search tool.',
            enum: ['findDocuments', 'advancedSearch', 'retrieveDocumentVersions', 'generateSearchReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific case search action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async findDocuments(
    query: string,
    caseId: string,
    conversationId: string,
    options?: {
      searchIn?: ('titles' | 'content' | 'metadata' | 'all')[];
      documentTypes?: ('motion' | 'brief' | 'deposition' | 'evidence' | 'all')[];
      includeExactMatch?: boolean;
      limitResults?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'findDocuments',
        payload: {
          query,
          caseId,
          searchIn: options?.searchIn,
          documentTypes: options?.documentTypes,
          includeExactMatch: options?.includeExactMatch,
          limitResults: options?.limitResults,
        },
      },
      conversationId
    );
  }

  public async advancedSearch(
    criteria: any,
    conversationId: string,
    options?: {
      dateRange?: { start: string; end: string };
      authors?: string[];
      relevanceThreshold?: number;
      includeRelated?: boolean;
      rankByRelevance?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'advancedSearch',
        payload: {
          criteria,
          dateRange: options?.dateRange,
          authors: options?.authors,
          relevanceThreshold: options?.relevanceThreshold,
          includeRelated: options?.includeRelated,
          rankByRelevance: options?.rankByRelevance,
        },
      },
      conversationId
    );
  }

  public async retrieveDocumentVersions(
    fileId: string,
    conversationId: string,
    options?: {
      versionRange?: 'all' | 'latest' | 'custom';
      includeMetadata?: boolean;
      includeChangeLog?: boolean;
      generateComparison?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'retrieveDocumentVersions',
        payload: {
          fileId,
          versionRange: options?.versionRange,
          includeMetadata: options?.includeMetadata,
          includeChangeLog: options?.includeChangeLog,
          generateComparison: options?.generateComparison,
        },
      },
      conversationId
    );
  }

  public async generateSearchReport(
    query: string,
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'withHighlights';
      includeStatistics?: boolean;
      includeRelevanceScores?: boolean;
      groupByDocumentType?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateSearchReport',
        payload: {
          query,
          reportFormat: options?.reportFormat,
          includeStatistics: options?.includeStatistics,
          includeRelevanceScores: options?.includeRelevanceScores,
          groupByDocumentType: options?.groupByDocumentType,
        },
      },
      conversationId
    );
  }
}
