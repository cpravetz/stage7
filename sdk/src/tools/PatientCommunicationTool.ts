import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PatientCommunicationTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'PatientCommunicationTool',
      description: 'Creates and manages patient communications including follow-up instructions, reminders, and educational materials.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the patient communication tool.',
            enum: ['generateMessage', 'createFollowUpInstructions', 'scheduleMedicationReminders', 'generateEducationalContent', 'trackPatientResponses'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific patient communication action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async generateMessage(messageType: string, patientData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateMessage', payload: { messageType, patientData } }, conversationId);
  }

  public async createFollowUpInstructions(treatmentPlan: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createFollowUpInstructions', payload: { treatmentPlan } }, conversationId);
  }

  public async scheduleMedicationReminders(medicationList: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'scheduleMedicationReminders', payload: { medicationList } }, conversationId);
  }

  public async generateEducationalContent(condition: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateEducationalContent', payload: { condition } }, conversationId);
  }

  public async trackPatientResponses(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackPatientResponses', payload: {} }, conversationId);
  }
}
