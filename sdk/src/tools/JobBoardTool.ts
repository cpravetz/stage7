import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class JobBoardTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'JobBoardTool',
      description: 'Manages job posting distribution and candidate sourcing across multiple job boards.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the job board tool.',
            enum: ['postToBoards', 'searchJobBoards', 'trackApplicationSources'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific job board action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async postToBoards(jobPosting: any, boardIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'postToBoards', payload: { jobPosting, boardIds } }, conversationId);
  }

  public async searchJobBoards(criteria: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'searchJobBoards', payload: { criteria } }, conversationId);
  }

  public async trackApplicationSources(jobId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'trackApplicationSources', payload: { jobId } }, conversationId);
  }
}
