import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class AssessmentTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'AssessmentTool',
      description: 'Manages candidate assessments and skill evaluations.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the assessment tool.',
            enum: ['createAssessment', 'scoreAssessment', 'compareCandidateResults', 'generateSkillReports'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific assessment action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createAssessment(candidateId: string, assessmentType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'createAssessment', payload: { candidateId, assessmentType } }, conversationId);
  }

  public async scoreAssessment(assessmentId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'scoreAssessment', payload: { assessmentId } }, conversationId);
  }

  public async compareCandidateResults(jobId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'compareCandidateResults', payload: { jobId } }, conversationId);
  }

  public async generateSkillReports(candidateIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'generateSkillReports', payload: { candidateIds } }, conversationId);
  }
}
