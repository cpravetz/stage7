import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PlanningTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'PlanningTool',
      description: 'Assists with support process improvement and action planning.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the planning tool.',
            enum: ['createActionPlan', 'trackImprovementProgress', 'generateTrainingRecommendations', 'optimizeSupportWorkflow'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific planning action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createActionPlan(insightsData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createActionPlan', payload: { insightsData } }, conversationId);
  }

  public async trackImprovementProgress(planId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackImprovementProgress', payload: { planId } }, conversationId);
  }

  public async generateTrainingRecommendations(performanceData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateTrainingRecommendations', payload: { performanceData } }, conversationId);
  }

  public async optimizeSupportWorkflow(teamData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'optimizeSupportWorkflow', payload: { teamData } }, conversationId);
  }
}
