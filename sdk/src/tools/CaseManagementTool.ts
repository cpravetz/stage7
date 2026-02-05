import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CaseManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CaseManagementTool',
      description: 'Organizes and manages legal case files and document collections.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the case management tool.',
            enum: ['organizeFiles', 'createCaseStructure', 'manageDocumentVersions', 'generateCaseTimeline'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific case management action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async organizeFiles(
    caseId: string,
    documents: any[],
    conversationId: string,
    options?: {
      organizationScheme?: 'chronological' | 'byType' | 'byParty' | 'byIssue' | 'hierarchical';
      groupRelatedDocs?: boolean;
      generateFolderStructure?: boolean;
      tagDocuments?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'organizeFiles',
        payload: {
          caseId,
          documents,
          organizationScheme: options?.organizationScheme,
          groupRelatedDocs: options?.groupRelatedDocs,
          generateFolderStructure: options?.generateFolderStructure,
          tagDocuments: options?.tagDocuments,
        },
      },
      conversationId
    );
  }

  public async createCaseStructure(
    caseType: string,
    conversationId: string,
    options?: {
      templateType?: 'standard' | 'complex' | 'minimal' | 'custom';
      includeDeadlines?: boolean;
      includeMilestones?: boolean;
      includeParties?: boolean;
      jurisdictionSpecific?: string;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'createCaseStructure',
        payload: {
          caseType,
          templateType: options?.templateType,
          includeDeadlines: options?.includeDeadlines,
          includeMilestones: options?.includeMilestones,
          includeParties: options?.includeParties,
          jurisdictionSpecific: options?.jurisdictionSpecific,
        },
      },
      conversationId
    );
  }

  public async manageDocumentVersions(
    fileId: string,
    conversationId: string,
    options?: {
      versionControl?: 'simple' | 'detailed' | 'trackChanges';
      keepHistory?: number;
      compareVersions?: boolean;
      identifyKeyChanges?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'manageDocumentVersions',
        payload: {
          fileId,
          versionControl: options?.versionControl,
          keepHistory: options?.keepHistory,
          compareVersions: options?.compareVersions,
          identifyKeyChanges: options?.identifyKeyChanges,
        },
      },
      conversationId
    );
  }

  public async generateCaseTimeline(
    caseId: string,
    conversationId: string,
    options?: {
      granularity?: 'daily' | 'weekly' | 'monthly' | 'byCriticalDates';
      includeDeadlines?: boolean;
      includeMilestones?: boolean;
      highlightCriticalDates?: boolean;
      generateReport?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateCaseTimeline',
        payload: {
          caseId,
          granularity: options?.granularity,
          includeDeadlines: options?.includeDeadlines,
          includeMilestones: options?.includeMilestones,
          highlightCriticalDates: options?.highlightCriticalDates,
          generateReport: options?.generateReport,
        },
      },
      conversationId
    );
  }
}
