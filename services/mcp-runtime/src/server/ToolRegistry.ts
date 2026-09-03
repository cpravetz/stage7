import { MCPTool, MCPToolCallRequest, MCPToolCallResponse, MCPListToolsRequest, MCPListToolsResponse } from '../types/mcp';
import { logger } from '../utils/logger';

export interface ToolExecutor {
  execute(name: string, args: Record<string, unknown>): Promise<MCPToolCallResponse>;
}

export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private executor: ToolExecutor;

  constructor(executor: ToolExecutor) {
    this.executor = executor;
  }

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    logger.info({ tool: tool.name }, 'MCP tool registered');
  }

  unregister(name: string): boolean {
    const existed = this.tools.has(name);
    this.tools.delete(name);
    return existed;
  }

  list(): MCPListToolsResponse {
    return {
      tools: Array.from(this.tools.values()),
    };
  }

  get(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  async call(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const tool = this.tools.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${request.params.name}` }],
        isError: true,
      };
    }
    return this.executor.execute(request.params.name, request.params.arguments || {});
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  size(): number {
    return this.tools.size;
  }
}
