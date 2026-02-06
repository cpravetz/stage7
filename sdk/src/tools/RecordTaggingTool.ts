import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class RecordTaggingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'RecordTaggingTool',
      description: 'Adds medical metadata and tags to health records for improved search, retrieval, and analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the record tagging tool.',
            enum: ['addMedicalTags', 'createTaggingSchema', 'searchByDiagnosis', 'extractTreatmentHistory', 'generateTagReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific record tagging action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async addMedicalTags(documentId: string, diagnosticCodes: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'addMedicalTags', payload: { documentId, diagnosticCodes } }, conversationId);
  }

  public async createTaggingSchema(specialty: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'createTaggingSchema', payload: { specialty } }, conversationId);
  }

  public async searchByDiagnosis(diagnosisCode: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'searchByDiagnosis', payload: { diagnosisCode } }, conversationId);
  }

  public async extractTreatmentHistory(patientId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'extractTreatmentHistory', payload: { patientId } }, conversationId);
  }

  public async generateTagReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateTagReport', payload: {} }, conversationId);
  }
}
