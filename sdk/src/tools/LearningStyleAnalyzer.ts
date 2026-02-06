import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LearningStyleAnalyzer extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'LearningStyleAnalyzer',
      description: 'Analyzes student learning preferences and cognitive styles to optimize instructional approaches.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the learning style analyzer.',
            enum: ['analyzePreferences', 'determineOptimalApproach', 'identifyCognitiveStrengths', 'generateLearningProfile'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific learning style analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzePreferences(studentData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzePreferences', payload: { studentData } }, conversationId);
  }

  public async determineOptimalApproach(learningStyle: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'determineOptimalApproach', payload: { learningStyle } }, conversationId);
  }

  public async identifyCognitiveStrengths(assessmentResults: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyCognitiveStrengths', payload: { assessmentResults } }, conversationId);
  }

  public async generateLearningProfile(conversationId: string): Promise<any> {
    return this.execute({ action: 'generateLearningProfile', payload: {} }, conversationId);
  }
}
