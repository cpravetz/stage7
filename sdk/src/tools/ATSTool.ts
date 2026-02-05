import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ATSTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ATSTool',
      description: 'Provides comprehensive applicant tracking system integration and candidate management.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the ATS tool.',
            enum: ['createJobOpening', 'searchCandidates', 'getCandidateDetails', 'updateCandidateStatus', 'getInterviewFeedback'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific ATS action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createJobOpening(jobData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createJobOpening', payload: { jobData } }, conversationId);
  }

  public async searchCandidates(criteria: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'searchCandidates', payload: { criteria } }, conversationId);
  }

  public async getCandidateDetails(candidateId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getCandidateDetails', payload: { candidateId } }, conversationId);
  }

  public async updateCandidateStatus(candidateId: string, status: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'updateCandidateStatus', payload: { candidateId, status } }, conversationId);
  }

  public async getInterviewFeedback(candidateId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getInterviewFeedback', payload: { candidateId } }, conversationId);
  }
}
