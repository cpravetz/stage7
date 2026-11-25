import { MCPTool } from '@stage7-nextgen/shared';
import { logger } from '../utils/logger';

/**
 * Per-process registry of assistant-declared tool bindings.
 *
 * This used to be a re-export from the mcp-runtime service package — a
 * cross-service workspace import. The registry it populated was process-local
 * and never read back by worker-pool; tool *execution* always goes through
 * tool-executor over HTTP. Keeping the registry here preserves the boot and
 * assistant-CRUD logging semantics without the service-boundary violation.
 */
const assistantTools = new Map<string, MCPTool>();

export function registerAssistantTools(tools: MCPTool[]): void {
  for (const tool of tools) {
    assistantTools.set(tool.name, tool);
  }
  logger.info(
    { count: tools.length, total: assistantTools.size },
    'Registered assistant-specific MCP tools',
  );
}
