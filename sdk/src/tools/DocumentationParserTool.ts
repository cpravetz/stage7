import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface ParsedDocument {
  title: string;
  description: string;
  example_snippets: string[];
  schema_arguments?: any[]; // For schema-style parsing
  arguments?: any[]; // For argument_reference style parsing
  attributes?: any[]; // For argument_reference style parsing
}

export class DocumentationParserTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DocumentationParserTool',
      description: 'Parses markdown documentation to extract structured information like title, description, schema/arguments, and examples.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the documentation parser.',
            enum: ['parseMarkdown'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific documentation parser action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Parses markdown content to extract structured documentation.
   * @param markdownContent The full markdown content of the document.
   * @param conversationId The ID of the conversation context.
   * @param parseMode The parsing strategy ('schema', 'argument_reference', or 'auto').
   * @returns A Promise resolving with the structured parsed document.
   */
  public async parseMarkdown(markdownContent: string, conversationId: string, parseMode: 'schema' | 'argument_reference' | 'auto' = 'schema'): Promise<ParsedDocument> {
    const actionPayload = {
      action: 'parseMarkdown',
      payload: {
        markdown_content: markdownContent,
        parse_mode: parseMode
      }
    };
    const result = await this.execute(actionPayload, conversationId);
    return result;
  }
}
