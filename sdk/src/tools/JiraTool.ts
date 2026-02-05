import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface JiraIssue {
  id?: string;
  key?: string;
  summary: string;
  description?: string;
  type: string; // e.g., "Story", "Task", "Bug", "Epic"
  priority?: string; // e.g., "High", "Medium", "Low"
  assignee?: string; // User ID or username
  status?: string; // e.g., "To Do", "In Progress", "Done"
  projectId: string; // The ID or key of the Jira project
  // Add other common Jira fields as needed
}

export class JiraTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'JiraTool',
      description: 'Manages tasks, issues, and projects within Atlassian Jira. Can create, read, update, and query Jira issues.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with Jira.',
            enum: ['createIssue', 'getIssueDetails', 'updateIssueStatus', 'queryIssues'],
          },
          // Common properties for all actions, or specific properties for each action type
          payload: {
            type: 'object',
            description: 'The payload for the specific Jira action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
  * Creates a new Jira issue.
  * @param issue Details of the issue to create.
  * @param conversationId The conversation ID.
  * @param options Optional configuration for issue creation.
  * @returns The created Jira issue with ID and key, including toolType for frontend rendering.
  */
   public async createIssue(
     issue: Omit<JiraIssue, 'id' | 'key' | 'status'>,
     conversationId: string,
     options?: {
       labels?: string[];
       components?: string[];
       dueDate?: string;
       notifyUsers?: boolean;
     }
   ): Promise<JiraIssue & { toolType: 'jira' }> {
     const result = await this.execute(
       {
         action: 'createIssue',
         payload: {
           ...issue,
           labels: options?.labels,
           components: options?.components,
           due_date: options?.dueDate,
           notify_users: options?.notifyUsers,
         },
       },
       conversationId
     );
     return { ...result, toolType: 'jira' };
   }
  /**
  * Retrieves details of a specific Jira issue.
  * @param issueIdOrKey The ID or key of the Jira issue.
  * @returns The Jira issue details with toolType for frontend rendering.
  */
   public async getIssueDetails(issueIdOrKey: string, conversationId: string): Promise<JiraIssue & { toolType: 'jira' }> {
     const result = await this.execute({ action: 'getIssueDetails', payload: { issueIdOrKey } }, conversationId);
     return { ...result, toolType: 'jira' };
   }
  /**
  * Updates the status of a specific Jira issue.
  * @param issueIdOrKey The ID or key of the Jira issue.
  * @param newStatus The new status to set for the issue.
  * @returns The updated Jira issue details with toolType for frontend rendering.
  */
   public async updateIssueStatus(issueIdOrKey: string, newStatus: string, conversationId: string): Promise<JiraIssue & { toolType: 'jira' }> {
     const result = await this.execute({ action: 'updateIssueStatus', payload: { issueIdOrKey, newStatus } }, conversationId);
     return { ...result, toolType: 'jira' };
   }
  /**
  * Queries Jira issues using JQL (Jira Query Language).
  * @param jqlQuery The JQL query string.
  * @returns A list of matching Jira issues with toolType for frontend rendering.
  */
   public async queryIssues(jqlQuery: string, conversationId: string): Promise<(JiraIssue & { toolType: 'jira' })[]> {
     const result = await this.execute({ action: 'queryIssues', payload: { jqlQuery } }, conversationId);
     return result.map((issue: JiraIssue) => ({ ...issue, toolType: 'jira' }));
   }
}
