export interface MCPTool {
  id?: string;
  name: string;
  displayName?: string;
  description: string;
  type?: 'mcp' | 'openapi' | 'code' | 'reasoning' | 'native';  // 'native' = in-process TypeScript executor selected by manifest.executor
  manifest?: Record<string, unknown>;
  actionLabel?: string;
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
