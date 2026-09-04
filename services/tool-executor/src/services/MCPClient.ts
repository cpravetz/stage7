import { Tool } from '../types';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string; data?: string }>;
  isError?: boolean;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export class MCPClient {
  private config: MCPServerConfig;
  private process?: ReturnType<typeof import('child_process').spawn>;
  private initialized = false;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private buffer = '';

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`MCP server ${this.config.id} missing command configuration`);
    }

    const { spawn } = await import('child_process');
    this.process = spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[mcp:${this.config.id}] ${data.toString()}`);
    });

    this.process.on('exit', (code) => {
      console.warn(`[mcp:${this.config.id}] process exited with code ${code}`);
      this.initialized = false;
    });

    await this.initialize();
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = undefined;
      this.initialized = false;
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) await this.connect();
    const response = await this.sendRequest('tools/list', {});
    return (response?.tools || []) as MCPTool[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.initialized) await this.connect();
    const response = await this.sendRequest('tools/call', { name, arguments: args });
    return response as MCPToolCallResult;
  }

  async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'stage7-tool-executor', version: '1.0.0' },
    });

    if (response) {
      await this.sendRequest('notifications/initialized', {});
      this.initialized = true;
      console.log(`[mcp:${this.config.id}] initialized`);
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdout) {
        return reject(new Error(`MCP server ${this.config.id} not connected`));
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      (this.process.stdout as any).write(message + '\n');
    });
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          if (message.error) {
            reject(new Error(message.error.message || 'MCP request failed'));
          } else {
            resolve(message.result);
          }
        }
      } catch (err) {
        console.error(`[mcp:${this.config.id}] failed to parse message: ${line}`);
      }
    }
  }
}

export class MCPHTTPClient {
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.config.url) {
      throw new Error(`MCP HTTP server ${this.config.id} missing URL configuration`);
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP request failed: ${response.status}`);
    }

    const data = await response.json() as any;
    return (data?.result?.tools || []) as MCPTool[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.config.url) {
      throw new Error(`MCP HTTP server ${this.config.id} missing URL configuration`);
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP request failed: ${response.status}`);
    }

    return await response.json() as MCPToolCallResult;
  }
}
