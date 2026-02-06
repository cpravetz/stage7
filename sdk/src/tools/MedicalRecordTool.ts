import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class MedicalRecordTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MedicalRecordTool',
      description: 'Organizes and manages electronic health records with comprehensive categorization and retrieval capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the medical record tool.',
            enum: ['categorizeRecords', 'extractKeyInformation', 'organizeByCondition', 'generateMedicalTimeline', 'ensureHIPAACompliance'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific medical record action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async categorizeRecords(
    recordList: any[],
    conversationId: string,
    options?: {
      recordTypes?: ('lab_results' | 'diagnoses' | 'medications' | 'procedures' | 'allergies')[];
      groupBy?: 'type' | 'date' | 'provider';
      includeAnalysis?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'categorizeRecords',
        payload: {
          recordList,
          recordTypes: options?.recordTypes,
          groupBy: options?.groupBy,
          includeAnalysis: options?.includeAnalysis,
        },
      },
      conversationId
    );
  }

  public async extractKeyInformation(
    documents: any[],
    conversationId: string,
    options?: {
      focusAreas?: ('diagnoses' | 'medications' | 'vitals' | 'lab_values')[];
      format?: 'structured' | 'timeline' | 'summary';
      includeContext?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'extractKeyInformation',
        payload: {
          documents,
          focusAreas: options?.focusAreas,
          format: options?.format,
          includeContext: options?.includeContext,
        },
      },
      conversationId
    );
  }

  public async organizeByCondition(
    patientId: string,
    conversationId: string,
    options?: {
      timeRange?: { start?: string; end?: string };
      includeRelated?: boolean;
      sortBy?: 'date' | 'severity' | 'condition';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'organizeByCondition',
        payload: {
          patientId,
          timeRange: options?.timeRange,
          includeRelated: options?.includeRelated,
          sortBy: options?.sortBy,
        },
      },
      conversationId
    );
  }

  public async generateMedicalTimeline(
    patientId: string,
    conversationId: string,
    options?: {
      timeRange?: { start?: string; end?: string };
      granularity?: 'daily' | 'monthly' | 'yearly';
      includeEvents?: ('diagnoses' | 'medications' | 'procedures' | 'visits')[];
      highlightCritical?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateMedicalTimeline',
        payload: {
          patientId,
          timeRange: options?.timeRange,
          granularity: options?.granularity,
          includeEvents: options?.includeEvents,
          highlightCritical: options?.highlightCritical,
        },
      },
      conversationId
    );
  }

  public async ensureHIPAACompliance(
    records: any,
    conversationId: string,
    options?: {
      privacyLevel?: 'full' | 'summary' | 'redacted';
      auditLog?: boolean;
      shareWith?: string[];
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'ensureHIPAACompliance',
        payload: {
          records,
          privacyLevel: options?.privacyLevel,
          auditLog: options?.auditLog,
          shareWith: options?.shareWith,
        },
      },
      conversationId
    );
  }
}
