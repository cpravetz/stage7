import express from 'express';
import { MCPToolRegistry, ToolExecutor } from './server/ToolRegistry';
import { MCPTool, MCPToolCallRequest, MCPListToolsRequest } from './types/mcp';
import { logger } from './utils/logger';
import { legacyGeneralTools } from './data/generalTools';

const app: express.Application = express();
app.use(express.json());

const executor: ToolExecutor = {
  execute: async (name: string, args: Record<string, unknown>) => {
    logger.info({ toolName: name, args }, 'MCP tool execution requested');
    return {
      content: [{ type: 'text', text: `MCP execution result for ${name}: ${JSON.stringify(args)}` }],
    };
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
