import express from 'express';
import { MCPToolRegistry, ToolExecutor } from './server/ToolRegistry';
import { MCPTool, MCPToolCallRequest, MCPListToolsRequest, MCPToolCallResponse } from './types/mcp';
import { logger } from './utils/logger';
import { legacyGeneralTools } from './data/generalTools';

const app: express.Application = express();
app.use(express.json());

const TOOL_EXECUTOR_URL = process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500';

const executor: ToolExecutor = {
  execute: async (name: string, args: Record<string, unknown>): Promise<MCPToolCallResponse> => {
    logger.info({ toolName: name, args }, 'MCP tool execution requested');
    try {
      const response = await fetch(`${TOOL_EXECUTOR_URL}/api/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `tool-${Date.now()}`,
          name,
          type: 'mcp',
          manifest: {},
          input: args,
        }),
      });

      if (response.status === 428) {
        const data = await response.json() as { error?: string; request?: any };
        const result: MCPToolCallResponse = {
          content: [{ type: 'text', text: `CREDENTIAL_REQUIRED: ${data.error || 'Missing credentials'}\n${JSON.stringify(data.request || {}, null, 2)}` }],
          isError: true,
        };
        return result;
      }

      if (!response.ok) {
        const text = await response.text();
        const result: MCPToolCallResponse = {
          content: [{ type: 'text', text: `Tool executor returned ${response.status}: ${text.slice(0, 200)}` }],
          isError: true,
        };
        return result;
      }

      const result = await response.json() as {
        status: string;
        output?: Record<string, unknown>;
        error?: string;
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };

      if (result.status === 'completed' && result.output) {
        const responseResult: MCPToolCallResponse = {
          content: [{ type: 'text', text: JSON.stringify(result.output, null, 2) }],
        };
        return responseResult;
      }

      if (result.content && Array.isArray(result.content)) {
        const normalizedContent = result.content.map((item) => ({
          type: item.type as 'text' | 'image' | 'resource',
          text: item.text,
        }));
        return { content: normalizedContent, isError: result.isError };
      }

      const errorResult: MCPToolCallResponse = {
        content: [{ type: 'text', text: result.error || 'Tool execution returned no output' }],
        isError: true,
      };
      return errorResult;
    } catch (err) {
      logger.error({ toolName: name, err: err instanceof Error ? err.message : String(err) }, 'MCP tool execution failed');
      const errorResult: MCPToolCallResponse = {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
      return errorResult;
    }
  },
};

const registry = new MCPToolRegistry(executor);

function registerGeneralTools(): void {
  for (const tool of legacyGeneralTools) {
    const mcpTool: MCPTool = {
      name: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      outputSchema: tool.outputSchema,
      annotations: {
        title: tool.name,
        readOnlyHint: tool.type === 'mcp',
      },
    };
    registry.register(mcpTool);
  }
  logger.info({ count: registry.size() }, 'Registered general MCP tools');
}

registerGeneralTools();

export function registerAssistantTools(tools: MCPTool[]): void {
  for (const tool of tools) {
    registry.register(tool);
  }
  logger.info({ count: tools.length, total: registry.size() }, 'Registered assistant-specific MCP tools');
}

app.get('/api/mcp-runtime/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mcp-runtime', tools: registry.size() });
});

app.get('/api/mcp-runtime/tools', (_req, res) => {
  res.json(registry.list());
});

app.post('/api/mcp-runtime/mcp', async (req, res) => {
  const request = req.body as MCPToolCallRequest | MCPListToolsRequest;
  if (request.method === 'tools/list') {
    res.json(registry.list());
  } else if (request.method === 'tools/call') {
    const callReq = request as MCPToolCallRequest;
    const tool = registry.get(callReq.params.name);
    if (!tool) {
      res.status(404).json({ content: [{ type: 'error', error: `Tool not found: ${callReq.params.name}` }], isError: true });
      return;
    }
    const result = await executor.execute(callReq.params.name, callReq.params.arguments || {});
    res.json(result);
  } else {
    res.status(400).json({ content: [{ type: 'error', error: `Unknown method: ${(req.body as { method?: string }).method}` }], isError: true });
  }
});

const PORT = process.env.PORT || 3300;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT, tools: registry.size() }, 'MCP runtime service listening');
  });
}

export { MCPToolRegistry, ToolExecutor } from './server/ToolRegistry';
export { MCPServer } from './server/MCPServer';
export { StdioTransport } from './transport/StdioTransport';
export { HttpTransport } from './transport/HttpTransport';
export * from './types/mcp';
