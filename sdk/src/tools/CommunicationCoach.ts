import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CommunicationCoach extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CommunicationCoach',
      description: 'Develops tailored coaching programs to improve communication skills, executive presence, and interpersonal effectiveness.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the communication coach.',
            enum: ['developPlan', 'createCommunicationExercises', 'designPresenceTraining', 'generateCoachingProgram', 'trackCoachingProgress'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific communication coaching action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async developPlan(coachingGoals: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'developPlan', payload: { coachingGoals } }, conversationId);
  }

  public async createCommunicationExercises(conversationId: string): Promise<any> {
    return this.execute({ action: 'createCommunicationExercises', payload: {} }, conversationId);
  }

  public async designPresenceTraining(conversationId: string): Promise<any> {
    return this.execute({ action: 'designPresenceTraining', payload: {} }, conversationId);
  }

  public async generateCoachingProgram(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateCoachingProgram', payload: {} }, conversationId);
  }

  public async trackCoachingProgress(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackCoachingProgress', payload: {} }, conversationId);
  }
}
