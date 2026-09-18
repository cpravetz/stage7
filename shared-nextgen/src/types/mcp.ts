export interface MCPTool {
  id?: string;
  name: string;
  displayName?: string;
  description: string;
  type?: 'mcp' | 'openapi' | 'code' | 'reasoning';
  manifest?: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
  triggers?: Array<Record<string, unknown>>;
  reasoningConfig?: Record<string, unknown>;
  externalConfig?: Record<string, unknown>;
  confirmBeforeSend?: boolean;
  isSkill?: boolean;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{ type: 'text' | 'error'; text?: string; error?: string }>;
  isError?: boolean;
}
