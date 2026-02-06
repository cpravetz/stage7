import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class IssueAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'IssueAnalysisTool',
      description: 'Analyzes customer issues and identifies root causes and solutions.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the issue analysis tool.',
            enum: ['analyzeIssue', 'identifyRootCause', 'suggestSolutions', 'generateTroubleshootingSteps'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific issue analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async analyzeIssue(issueDescription: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeIssue', payload: { issueDescription } }, conversationId);
  }

  public async identifyRootCause(issueData: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'identifyRootCause', payload: { issueData } }, conversationId);
  }

  public async suggestSolutions(issueType: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'suggestSolutions', payload: { issueType } }, conversationId);
  }

  public async generateTroubleshootingSteps(issueId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateTroubleshootingSteps', payload: { issueId } }, conversationId);
  }
}
