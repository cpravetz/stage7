import * as http from 'http';
import { Application } from 'express';
import { Assistant } from './Assistant';
import { HttpCoreEngineClient } from './HttpCoreEngineClient';
import { ServiceTokenManager } from '@cktmcs/shared';
import { Tool } from './Tool';
import { createAssistantServer } from './AssistantServer';
import { addAdditionalEndpoints } from './additionalEndpoints';
import { addStandardMiddleware } from './AssistantMiddleware';
import { createAssistantWebSocket } from './AssistantWebSocket';
import { MessageParser } from './parser/MessageParser';

export interface QuickAssistantConfig {
  id: string;
  name: string;
  role: string;
  personality: string;
  tools: Tool[] | ((coreEngineClient: HttpCoreEngineClient) => Tool[] | Promise<Tool[]>);
  port?: number;
  urlBase?: string;
  serviceId?: string;
  secretEnvVar?: string;
  securityManagerUrl?: string;
  clientSecret?: string;
  postOfficeUrl?: string;
}

export interface AssistantInstance {
  assistant: Assistant;
  app: Application;
  server: http.Server;
  messageParser: MessageParser;
}

/**
 * Simplified assistant initialization that handles all boilerplate:
 * - Token manager setup
 * - Core engine client creation
 * - Assistant instantiation
 * - Express server setup
 * - WebSocket configuration
 * - Standard middleware application
 * - Message parser initialization
 * 
 * This reduces assistant setup from ~250 lines to ~20 lines.
 * 
 * Example usage:
 * ```typescript
 * const { assistant, app, server } = await createQuickAssistant({
 *   id: 'sales-assistant',
 *   name: 'Sales Assistant',
 *   role: 'Assists with sales tasks',
 *   personality: 'Professional and proactive',
 *   tools: [crmTool, emailTool],
 *   port: 3005
 * });
 * ```
 */
export async function createQuickAssistant(
  config: QuickAssistantConfig
): Promise<AssistantInstance> {
  const port = config.port || parseInt(process.env.PORT || '3000');
  const serviceId = config.serviceId || config.id;
  const secretEnvVar = config.secretEnvVar || `${config.id.toUpperCase().replace(/-/g, '_')}_API_SECRET`;
  const securityManagerUrl =
    config.securityManagerUrl || process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
  const clientSecret = config.clientSecret || process.env[secretEnvVar] || 'stage7AuthSecret';
  const postOfficeUrl =
    config.postOfficeUrl || process.env.POSTOFFICE_URL || 'http://localhost:5020';

  // Initialize token manager for authentication
  const tokenManager = ServiceTokenManager.getInstance(
    securityManagerUrl,
    serviceId,
    clientSecret
  );

  // Create core engine client
  const coreEngineClient = new HttpCoreEngineClient(
    postOfficeUrl,
    async () => tokenManager.getToken()
  );

  // Resolve tools - allow function that receives coreEngineClient (can be async)
  const tools = typeof config.tools === 'function' 
    ? await config.tools(coreEngineClient)
    : config.tools;

  // Initialize message parser for natural language → structured commands
  const messageParser = new MessageParser({
    tools: tools,
    logLevel: 'info'
  });

  // Create assistant instance
  const assistant = new Assistant({
    id: config.id,
    name: config.name,
    role: config.role,
    personality: config.personality,
    coreEngineClient,
    tools: tools,
    port: port.toString(),
    urlBase: config.urlBase || `${config.id}-api`
  });

  // Create Express server with assistant endpoints
  const app = createAssistantServer(assistant);
  const server = http.createServer(app);

  // Add SDK-provided endpoints (/conversations, /message, etc.)
  addAdditionalEndpoints(app, assistant);

  // Add standard middleware (logging, parsing, error handling)
  addStandardMiddleware(app, assistant, messageParser);

  // Create WebSocket server for real-time updates
  createAssistantWebSocket(server, assistant);

  // Start listening
  server.listen(port, () => {
    console.log(`[${assistant.id}] ${assistant.name} API listening on port ${port}`);
    console.log(`[${assistant.id}] REST API: http://localhost:${port}`);
    console.log(`[${assistant.id}] WebSocket: ws://localhost:${port}/ws/conversations/{id}`);
    console.log(`[${assistant.id}] Assistant initialized: ${assistant.name}`);
  });

  return {
    assistant,
    app,
    server,
    messageParser
  };
}
