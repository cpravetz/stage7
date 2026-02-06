import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class AppointmentScheduler extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'AppointmentScheduler',
      description: 'Coordinates patient appointments across multiple providers, facilities, and care settings.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the appointment scheduler.',
            enum: ['checkAvailability', 'scheduleAppointments', 'resolveConflicts', 'generateAppointmentCalendar', 'sendReminders'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific appointment scheduling action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async checkAvailability(providerIds: string[], timeRange: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'checkAvailability', payload: { providerIds, timeRange } }, conversationId);
  }

  public async scheduleAppointments(appointmentList: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'scheduleAppointments', payload: { appointmentList } }, conversationId);
  }

  public async resolveConflicts(scheduleData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'resolveConflicts', payload: { scheduleData } }, conversationId);
  }

  public async generateAppointmentCalendar(patientId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateAppointmentCalendar', payload: { patientId } }, conversationId);
  }

  public async sendReminders(appointmentIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'sendReminders', payload: { appointmentIds } }, conversationId);
  }
}
