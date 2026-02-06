import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class EQAssessmentTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'EQAssessmentTool',
      description: 'Measures emotional intelligence competencies including self-awareness, self-regulation, motivation, empathy, and social skills.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the EQ assessment tool.',
            enum: ['evaluateEQ', 'analyzeEmotionalCompetencies', 'identifyStrengthsWeaknesses', 'generateEQReport', 'trackEQDevelopment'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific EQ assessment action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async evaluateEQ(assessmentData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'evaluateEQ', payload: { assessmentData } }, conversationId);
  }

  public async analyzeEmotionalCompetencies(conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeEmotionalCompetencies', payload: {} }, conversationId);
  }

  public async identifyStrengthsWeaknesses(conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyStrengthsWeaknesses', payload: {} }, conversationId);
  }

  public async generateEQReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateEQReport', payload: {} }, conversationId);
  }

  public async trackEQDevelopment(conversationId: string): Promise<any> {
    return this.execute({ action: 'trackEQDevelopment', payload: {} }, conversationId);
  }
}
