// @ts-nocheck
import { createExternalActionSkill } from '../code-skill-factory';

export const PRODUCT_MARKDOWN_PARSING = createExternalActionSkill({
    id: 'product-markdown-parsing',
    name: 'Markdown Parsing',
    description: 'Parse product docs and PRDs from markdown into structured data. Uses configurable parsing endpoint or local helper logic.',
    system: 'markdown_parser',
    action: 'parse_document',
    endpoint: {
      method: 'POST',
      configKey: 'baseUrl',
    },
    auth: {
      type: 'api_key',
      credentialEnvKeyMap: {
        apiKey: { envVar: 'MARKDOWN_PARSER_API_KEY' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        apiUrl: { type: 'string', description: 'Parser service base URL' },
        apiKey: { type: 'string', description: 'API key for parser service' },
        format: { type: 'string', description: 'Output format: json, yaml, html' },
        parserPlugins: { type: 'array', items: { type: 'string' }, description: 'Parser plugin names' },
        outputSchemas: { type: 'object', description: 'Output schema definitions' },
        sectionRules: { type: 'object', description: 'Section extraction rules' },
        linkResolvers: { type: 'object', description: 'Link resolution configurations' },
      },
      required: ['apiUrl'],
    },
    credentialSource: {
      apiKey: { envVar: 'MARKDOWN_PARSER_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Markdown content to parse' },
        sourceUrl: { type: 'string', description: 'Optional source URL' },
        extractSections: { type: 'array', items: { type: 'string' }, description: 'Section names to extract from the document' },
        format: { type: 'string', enum: ['json', 'yaml', 'html'], description: 'Output format for the parsed document' },
      },
      required: ['content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 20000,
  triggers: [{ kind: 'user', phrase_examples: ["Parse markdown", "Convert document", "Extract content"] }],
  });
