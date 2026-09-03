import express from 'express';
import toolRoutes from './routes/tools';
import { Tool } from './types';
import { toolRegistry } from './utils/sharedInstance';
import { legacyGeneralTools } from './data/generalTools';
import logger from './utils/logger';
import { ToolNotFoundError, ValidationError } from './utils/errors';

const app: express.Application = express();
app.use(express.json());

const defaultTools: Tool[] = [
  {
    id: 'get_weather',
    name: 'Get Weather',
    description: 'Retrieve current weather information for a specified location.',
    type: 'code',
    manifest: { module: 'weather', action: 'get_current' },
    inputSchema: { location: { type: 'string', required: true } },
    outputSchema: { temperature: 'number', condition: 'string', humidity: 'number' },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'calculate',
    name: 'Calculate',
    description: 'Perform mathematical calculations and evaluations safely.',
    type: 'code',
    manifest: { module: 'math', action: 'evaluate' },
    inputSchema: { expression: { type: 'string', required: true } },
    outputSchema: { result: 'number' },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'search_web',
    name: 'Search Web',
    description: 'Search the internet for information using a query string.',
    type: 'code',
    manifest: { module: 'search', action: 'web_search' },
    inputSchema: { query: { type: 'string', required: true }, max_results: { type: 'number', default: 5 } },
    outputSchema: { results: 'array', snippets: 'array' },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'api_client',
    name: 'API Client',
    description: 'Make generic REST API calls to external services.',
    type: 'openapi',
    manifest: { method: 'GET', urlTemplate: 'https://api.example.com/{path}' },
    inputSchema: { path: { type: 'string', required: true }, params: { type: 'object' } },
    outputSchema: { status: 'number', data: 'object' },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'file_ops',
    name: 'File Operations',
    description: 'Read, write, and manage files in a secure sandboxed environment.',
    type: 'code',
    manifest: { module: 'files', action: 'manage' },
    inputSchema: { operation: { type: 'string', required: true, enum: ['read', 'write', 'list'] }, path: { type: 'string', required: true } },
    outputSchema: { content: 'string', success: 'boolean' },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const allDefaults = [...defaultTools, ...legacyGeneralTools];

for (const tool of allDefaults) {
  if (!toolRegistry.get(tool.id)) {
    toolRegistry.register(tool);
  }
}
logger.info({ count: toolRegistry.list().length }, 'Registered default tools');

app.get('/api/tool-executor/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tool-executor', tools: toolRegistry.list().length });
});

app.get('/api/tool-executor/tools', (_req, res) => {
  res.json({ tools: toolRegistry.list() });
});

app.use('/api/tool-executor', toolRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ToolNotFoundError) {
    return res.status(404).json({ success: false, error: err.message, statusCode: 404 });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ success: false, error: err.message, statusCode: 400 });
  }
  logger.error({ err: err?.message || String(err) }, 'Unhandled error in tool-executor');
  res.status(500).json({ success: false, error: err?.message || 'Internal server error', statusCode: 500 });
});

const PORT = process.env.PORT || 3500;

app.listen(PORT, () => {
  logger.info({ port: PORT, tools: toolRegistry.list().length }, 'Tool Executor service listening');
});

export { legacyGeneralTools } from './data/generalTools';
export default app;
