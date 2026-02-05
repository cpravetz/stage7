import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class InterviewQuestionGenerator extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'InterviewQuestionGenerator',
      description: 'Creates likely interview questions based on job description, company, and industry standards.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the interview question generator.',
            enum: ['createQuestions', 'generateBehavioralQuestions', 'developTechnicalQuestions', 'generateQuestionSets', 'predictInterviewFocus'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific interview question generation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async createQuestions(jobData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'createQuestions', payload: { jobData } }, conversationId);
  }

  public async generateBehavioralQuestions(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateBehavioralQuestions', payload: {} }, conversationId);
  }

  public async developTechnicalQuestions(conversationId: string): Promise<any> {
    return this.execute({ action: 'developTechnicalQuestions', payload: {} }, conversationId);
  }

  public async generateQuestionSets(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateQuestionSets', payload: {} }, conversationId);
  }

  public async predictInterviewFocus(conversationId: string): Promise<any> {
    return this.execute({ action: 'predictInterviewFocus', payload: {} }, conversationId);
  }
}
