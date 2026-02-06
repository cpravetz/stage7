import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ActivityDesigner extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ActivityDesigner',
      description: 'Creates interactive and collaborative learning activities to enhance student engagement and comprehension.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the activity designer.',
            enum: ['createEngagingTasks', 'designCollaborativeProjects', 'developInteractiveExercises', 'generateActivityInstructions', 'assessActivityEffectiveness'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific activity design action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createEngagingTasks(learningObjectives: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createEngagingTasks', payload: { learningObjectives } }, conversationId);
  }

  public async designCollaborativeProjects(conversationId: string): Promise<any> {
    return this.execute({ action: 'designCollaborativeProjects', payload: {} }, conversationId);
  }

  public async developInteractiveExercises(conversationId: string): Promise<any> {
    return this.execute({ action: 'developInteractiveExercises', payload: {} }, conversationId);
  }

  public async generateActivityInstructions(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateActivityInstructions', payload: {} }, conversationId);
  }

  public async assessActivityEffectiveness(conversationId: string): Promise<any> {
    return this.execute({ action: 'assessActivityEffectiveness', payload: {} }, conversationId);
  }
}
