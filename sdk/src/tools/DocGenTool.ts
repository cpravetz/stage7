import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface DocGenInput {
  templateId: string;
  data: any;
}

interface DocGenOutput {
  docId: string;
  content: string; // The generated document content
  format: 'markdown' | 'pdf' | 'html';
}

export class DocGenTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DocGenTool',
      description: 'Generates structured documents from templates and provided data.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the document generator.',
            enum: ['generateSpec', 'formatReport'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific document generation action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
  * Generates a product specification document.
  * @param templateId The ID of the template to use.
  * @param data The data to populate the template with.
  * @returns The generated document.
  */
  public async generateSpec(templateId: string, data: any, conversationId: string): Promise<DocGenOutput> {
    const result = await this.execute({ action: 'generateSpec', payload: { templateId, data } }, conversationId);
    return result;
  }

  /**
  * Formats a report.
  * @param data The data for the report.
  * @param format The desired output format.
  * @returns The formatted report.
  */
  public async formatReport(data: any, format: 'markdown' | 'pdf' | 'html', conversationId: string): Promise<DocGenOutput> {
    const result = await this.execute({ action: 'formatReport', payload: { data, format } }, conversationId);
    return result;
  }
}
