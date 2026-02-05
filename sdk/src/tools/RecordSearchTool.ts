import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class RecordSearchTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'RecordSearchTool',
      description: 'Provides advanced search capabilities for electronic health records and medical documents.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the record search tool.',
            enum: ['findMedicalRecords', 'advancedMedicalSearch', 'retrieveTestResults', 'generateSearchReport', 'trackDocumentAccess'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific record search action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async findMedicalRecords(query: string, patientId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findMedicalRecords', payload: { query, patientId } }, conversationId);
  }

  public async advancedMedicalSearch(criteria: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'advancedMedicalSearch', payload: { criteria } }, conversationId);
  }

  public async retrieveTestResults(patientId: string, testType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'retrieveTestResults', payload: { patientId, testType } }, conversationId);
  }

  public async generateSearchReport(query: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateSearchReport', payload: { query } }, conversationId);
  }

  public async trackDocumentAccess(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackDocumentAccess', payload: {} }, conversationId);
  }
}
