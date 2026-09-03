import { MCPToolRegistry } from './ToolRegistry';
import { MCPTool, MCPToolCallRequest, MCPToolCallResponse, MCPListToolsRequest, MCPListToolsResponse } from '../types/mcp';
import { logger } from '../utils/logger';

export interface MCPServerOptions {
  name: string;
  version: string;
}

export class MCPServer {
  private registry: MCPToolRegistry;
  private name: string;
  private version: string;

  constructor(options: MCPServerOptions, executor: { execute: (name: string, args: Record<string, unknown>) => Promise<MCPToolCallResponse> }) {
    this.name = options.name;
    this.version = options.version;
    this.registry = new MCPToolRegistry(executor);
  }

  registerTool(tool: MCPTool): void {
    this.registry.register(tool);
  }

  unregisterTool(name: string): boolean {
    return this.registry.unregister(name);
  }

  async handleRequest(request: MCPToolCallRequest | MCPListToolsRequest): Promise<MCPToolCallResponse | MCPListToolsResponse> {
    if (request.method === 'tools/list') {
      return this.registry.list();
    }

    if (request.method === 'tools/call') {
      return this.registry.call(request);
    }

    const method = (request as any).method;
    logger.warn({ method }, 'Unknown MCP method');
    return {
      content: [{ type: 'text', text: `Unknown method: ${method}` }],
      isError: true,
    };
  }

  listTools(): MCPListToolsResponse {
    return this.registry.list();
  }

  getInfo() {
    return {
      name: this.name,
      version: this.version,
      toolCount: this.registry.size(),
    };
  }
}
