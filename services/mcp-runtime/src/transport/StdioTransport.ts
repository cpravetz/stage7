import { MCPServer } from '../server/MCPServer';
import { MCPToolCallRequest, MCPListToolsRequest } from '../types/mcp';
import { logger } from '../utils/logger';

export class StdioTransport {
  private server: MCPServer;
  private running = false;

  constructor(server: MCPServer) {
    this.server = server;
  }

  start(): void {
    this.running = true;
    logger.info('MCP stdio transport started');

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (chunk: string) => {
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const request = JSON.parse(line);
          const response = await this.server.handleRequest(request as MCPToolCallRequest | MCPListToolsRequest);
          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (error) {
          logger.error({ error, line }, 'Failed to process stdio message');
        }
      }
    });
  }

  stop(): void {
    this.running = false;
    logger.info('MCP stdio transport stopped');
  }
}
