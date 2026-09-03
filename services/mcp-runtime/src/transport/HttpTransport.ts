import express from 'express';
import { MCPServer } from '../server/MCPServer';
import { MCPToolCallRequest, MCPListToolsRequest } from '../types/mcp';
import { logger } from '../utils/logger';

export class HttpTransport {
  private app: express.Application;
  private server: MCPServer;
  private port: number;

  constructor(server: MCPServer, port: number) {
    this.server = server;
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.post('/mcp', async (req, res) => {
      try {
        const request = req.body as MCPToolCallRequest | MCPListToolsRequest;
        const response = await this.server.handleRequest(request);
        res.json(response);
      } catch (error) {
        logger.error({ error }, 'HTTP transport error');
        res.status(500).json({
          content: [{ type: 'text', text: 'Internal server error' }],
          isError: true,
        });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', ...this.server.getInfo() });
    });
  }

  start(): void {
    this.app.listen(this.port, () => {
      logger.info({ port: this.port }, 'MCP HTTP transport listening');
    });
  }
}
