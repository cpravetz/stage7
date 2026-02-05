import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class ResumeAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ResumeAnalysisTool',
      description: 'Provides advanced resume parsing, analysis, and candidate matching capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the resume analysis tool.',
            enum: ['analyzeResumes', 'calculateFitScores', 'extractSkills', 'generateCandidateProfiles'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific resume analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeResumes(resumeData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeResumes', payload: { resumeData } }, conversationId);
  }

  public async calculateFitScores(candidateId: string, jobId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'calculateFitScores', payload: { candidateId, jobId } }, conversationId);
  }

  public async extractSkills(resumeText: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'extractSkills', payload: { resumeText } }, conversationId);
  }

  public async generateCandidateProfiles(candidateIds: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'generateCandidateProfiles', payload: { candidateIds } }, conversationId);
  }
}
