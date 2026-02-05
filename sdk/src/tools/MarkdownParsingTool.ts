import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class MarkdownParsingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MarkdownParsingTool',
      description: 'Parses and processes Markdown formatted text, extracts specific sections, or converts to other formats.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the markdown parser.',
            enum: ['extractSection', 'convertToJson', 'summarizeMarkdown'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific markdown parsing action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
  * Extracts a section from a Markdown document.
  * @param markdown The Markdown content.
  * @param heading The heading of the section to extract.
  * @returns The extracted section content.
  */
  public async extractSection(markdown: string, heading: string, conversationId: string): Promise<string> {
    const result = await this.execute({ action: 'extractSection', payload: { markdown, heading } }, conversationId);
    return result;
  }

  /**
  * Converts Markdown to JSON.
  * @param markdown The Markdown content.
  * @returns The JSON representation of the Markdown.
  */
  public async convertToJson(markdown: string, conversationId: string): Promise<any> {
    const result = await this.execute({ action: 'convertToJson', payload: { markdown } }, conversationId);
    return result;
  }

  /**
  * Summarizes a Markdown document.
  * @param markdown The Markdown content.
  * @returns The summary of the document.
  */
  public async summarizeMarkdown(markdown: string, conversationId: string): Promise<string> {
    const result = await this.execute({ action: 'summarizeMarkdown', payload: { markdown } }, conversationId);
    return result;
  }
}
