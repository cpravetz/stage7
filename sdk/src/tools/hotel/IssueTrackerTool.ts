import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class IssueTrackerTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'IssueTrackerTool',
      description: 'Monitors and tracks resolution progress for guest requests, complaints, and operational issues',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the issue tracker tool.',
            enum: ['monitorProgress', 'setEscalationTriggers', 'generateStatusUpdates', 'analyzeResolutionTimes', 'createIssueReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific issue tracking action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async monitorProgress(issueId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'monitorProgress', payload: { issueId } }, conversationId);
  }

  async setEscalationTriggers(criteria: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'setEscalationTriggers', payload: { criteria } }, conversationId);
  }

  async generateStatusUpdates(issueList: string[], conversationId: string): Promise<any> {
    return this.execute({ action: 'generateStatusUpdates', payload: { issueList } }, conversationId);
  }

  async analyzeResolutionTimes(period: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'analyzeResolutionTimes', payload: { period } }, conversationId);
  }

  async createIssueReport(conversationId: string): Promise<any> {
    return this.execute({ action: 'createIssueReport', payload: {} }, conversationId);
  }
}