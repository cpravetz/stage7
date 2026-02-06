import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface ConfluencePage {
  id?: string;
  title: string;
  content: string; // Can be in storage format (ADF), wiki markup, or markdown
  spaceId: string;
  parentId?: string;
  url?: string;
}

export class ConfluenceTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'ConfluenceTool',
      description: 'Manages pages and content within Atlassian Confluence. Can create, read, and search pages.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with Confluence.',
            enum: ['createPage', 'getPageContent', 'searchPages'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific Confluence action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
  * Creates a new Confluence page.
  * @param page Details of the page to create.
  * @param conversationId The conversation ID.
  * @param options Optional configuration for page creation.
  * @returns The created Confluence page with ID and URL, including toolType for frontend rendering.
  */
   public async createPage(
     page: Omit<ConfluencePage, 'id' | 'url'>,
     conversationId: string,
     options?: {
       labels?: string[];
       notifyWatchers?: boolean;
       status?: string;
     }
   ): Promise<ConfluencePage & { toolType: 'confluence' }> {
     const result = await this.execute(
       {
         action: 'createPage',
         payload: {
           ...page,
           labels: options?.labels,
           notify_watchers: options?.notifyWatchers,
           status: options?.status,
         },
       },
       conversationId
     );
     return { ...result, toolType: 'confluence' };
   }
  /**
  * Retrieves the content of a specific Confluence page.
  * @param pageIdOrTitle The ID or title of the Confluence page.
  * @param conversationId The conversation ID.
  * @param options Optional configuration for page retrieval.
  * @returns The Confluence page details including its content with toolType for frontend rendering.
  */
   public async getPageContent(
     pageIdOrTitle: string,
     conversationId: string,
     options?: {
       spaceId?: string;
       includeHistory?: boolean;
       includeAttachments?: boolean;
       expand?: string[];
     }
   ): Promise<ConfluencePage & { toolType: 'confluence' }> {
     const result = await this.execute(
       {
         action: 'getPageContent',
         payload: {
           pageIdOrTitle,
           space_id: options?.spaceId,
           include_history: options?.includeHistory,
           include_attachments: options?.includeAttachments,
           expand: options?.expand,
         },
       },
       conversationId
     );
     return { ...result, toolType: 'confluence' };
   }
  /**
  * Searches for Confluence pages based on a query string.
  * @param query The search query string.
  * @param conversationId The conversation ID.
  * @param options Optional configuration for page search.
  * @returns A list of matching Confluence pages (summary info) with toolType for frontend rendering.
  */
   public async searchPages(
     query: string,
     conversationId: string,
     options?: {
       spaceId?: string;
       limit?: number;
       status?: string[];
       type?: string[];
     }
   ): Promise<(ConfluencePage & { toolType: 'confluence' })[]> {
     const result = await this.execute(
       {
         action: 'searchPages',
         payload: {
           query,
           space_id: options?.spaceId,
           limit: options?.limit,
           status: options?.status,
           type: options?.type,
         },
       },
       conversationId
     );
     return result.map((page: ConfluencePage) => ({ ...page, toolType: 'confluence' }));
   }
}
