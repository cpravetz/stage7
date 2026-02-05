import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class MedicalTriageTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MedicalTriageTool',
      description: 'Assesses patient symptoms and medical history to determine appropriate care level and urgency.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the medical triage tool.',
            enum: ['analyzeSymptoms', 'determineCareLevel', 'identifyUrgentCases', 'generateTriageReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific medical triage action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeSymptoms(symptomList: string[], medicalHistory: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeSymptoms', payload: { symptomList, medicalHistory } }, conversationId);
  }

  public async determineCareLevel(patientData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'determineCareLevel', payload: { patientData } }, conversationId);
  }

  public async identifyUrgentCases(triageResults: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyUrgentCases', payload: { triageResults } }, conversationId);
  }

  public async generateTriageReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateTriageReport', payload: {} }, conversationId);
  }
}
