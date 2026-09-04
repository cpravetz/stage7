import { Tool, ToolExecution, CredentialRequest, CredentialRequiredError } from '../types';
import logger from '../utils/logger';
import { EmailExecutor } from '../executors/EmailExecutor';
import { SearchExecutor } from '../executors/SearchExecutor';
import { CodeExecutor } from '../executors/CodeExecutor';
import { FtpExecutor, FtpExecutionOptions } from '../executors/FtpExecutor';
import { WebhookExecutor, WebhookDispatchOptions } from '../executors/WebhookExecutor';
import { DatabaseExecutor, DatabaseQueryOptions } from '../executors/DatabaseExecutor';
import { FileStorageExecutor, FileStorageOptions } from '../executors/FileStorageExecutor';
import { VendorApiExecutor } from '../executors/VendorApiExecutor';
import { credentialProvider } from '../services/CredentialProvider';
import { PluginGenerator } from '../services/PluginGenerator';
import { ToolDiscovery } from '../services/ToolDiscovery';
import { MCPClient, MCPHTTPClient, MCPServerConfig } from '../services/MCPClient';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';
const HEALING_SYSTEM_PROMPT = `You are a senior engineer debugging a failed code execution. Given the error message, source code, and input that caused the failure, provide a corrected version of the code. Output ONLY a single JSON object with this exact shape: { "sourceCode": "corrected code string", "explanation": "brief explanation of the fix" }`;
const MAX_HEALING_ATTEMPTS = 2;

export type { FtpExecutionOptions, FtpExecutionResult } from '../executors/FtpExecutor';
export type { WebhookDispatchOptions, WebhookDispatchResult } from '../executors/WebhookExecutor';
export type { DatabaseQueryOptions, DatabaseQueryResult } from '../executors/DatabaseExecutor';
export type { FileStorageOptions, FileStorageResult } from '../executors/FileStorageExecutor';

interface PendingCredentialRequest {
  executionId: string;
  toolId: string;
  toolName: string;
  tool: Tool;
  input: Record<string, unknown>;
  request: CredentialRequest;
  credentials: Record<string, string | undefined>;
}

export class ToolExecutor {
  private emailExecutor = new EmailExecutor();
  private searchExecutor = new SearchExecutor();
  private codeExecutor = new CodeExecutor();
  private pluginGenerator = new PluginGenerator();
  private toolDiscovery = new ToolDiscovery();
  private ftpExecutor = new FtpExecutor();
  private webhookExecutor = new WebhookExecutor();
  private databaseExecutor = new DatabaseExecutor();
  private fileStorageExecutor = new FileStorageExecutor();
  private vendorApiExecutor = new VendorApiExecutor();
  private mcpClients = new Map<string, MCPClient | MCPHTTPClient>();
  private mcpServerConfigs = new Map<string, MCPServerConfig>();
  private pendingCredentialRequests = new Map<string, PendingCredentialRequest>();
  private pendingCredentialOverrides = new Map<string, Record<string, string>>();
  private toolRegistry: Map<string, Tool> | null = null;

  constructor(toolRegistry?: Map<string, Tool>) {
    this.toolRegistry = toolRegistry || null;
  }

  async execute(tool: Tool, input: Record<string, unknown>): Promise<ToolExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date();

    logger.info({ executionId, toolId: tool.id, toolName: tool.name, toolType: tool.type }, 'Tool execution started');

    try {
      const credentials = await this.resolveCredentials(tool, input);
      const output = await this.dispatch(tool, input, credentials);
      const completedAt = new Date();

      logger.info({ executionId, toolId: tool.id, status: 'completed' }, 'Tool execution completed');

      return {
        executionId,
        toolId: tool.id,
        input,
        output,
        status: 'completed',
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed');

      return {
        executionId,
        toolId: tool.id,
        input,
        error: errorMessage,
        status: 'failed',
        startedAt,
        completedAt,
      };
    }
  }

  async executeOrRequestCredentials(tool: Tool, input: Record<string, unknown>, providedCredentials?: Record<string, string>): Promise<ToolExecution | CredentialRequiredError> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date();

    logger.info({ executionId, toolId: tool.id, toolName: tool.name, toolType: tool.type }, 'Tool execution started');

    if (providedCredentials && Object.keys(providedCredentials).length > 0) {
      this.pendingCredentialOverrides.set(tool.id, providedCredentials);
    }

    try {
      const credentials = await this.resolveCredentials(tool, input);
      const output = await this.dispatch(tool, input, credentials);
      const completedAt = new Date();

      logger.info({ executionId, toolId: tool.id, status: 'completed' }, 'Tool execution completed');

      return {
        executionId,
        toolId: tool.id,
        input,
        output,
        status: 'completed',
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = new Date();

      if (error instanceof CredentialRequiredError) {
        this.pendingCredentialRequests.set(error.request.executionId, {
          executionId: error.request.executionId,
          toolId: error.request.toolId,
          toolName: error.request.toolName,
          tool,
          input,
          request: error.request,
          credentials: error.request.missingCredentials.reduce((acc, mc) => ({ ...acc, [mc.key]: undefined }), {}),
        });
        return error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed');

      return {
        executionId,
        toolId: tool.id,
        input,
        error: errorMessage,
        status: 'failed',
        startedAt,
        completedAt,
      };
    }
  }

  async generatePlugin(request: { description: string; requirements?: string[]; context?: Record<string, unknown> }): Promise<{ success: boolean; tool?: Tool; error?: string }> {
    return this.pluginGenerator.generate(request);
  }

  async healCodeTool(tool: Tool, input: Record<string, unknown>, errorMessage: string): Promise<{ success: boolean; fixedSourceCode?: string; error?: string }> {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const sourceCode = (manifest?.sourceCode as string) || '';
    if (!sourceCode) {
      return { success: false, error: 'No sourceCode to heal' };
    }

    const userPrompt = `ERROR: ${errorMessage}\n\nINPUT: ${JSON.stringify(input, null, 2)}\n\nCODE:\n${sourceCode}\n\nProvide the corrected code.`;

    try {
      const response = await fetch(`${BRAIN_URL}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt: HEALING_SYSTEM_PROMPT,
          options: { temperature: 0.2, maxTokens: 4096 },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `Brain returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json() as { content: string };
      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false, error: 'LLM response did not contain valid JSON' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const fixedSourceCode = parsed.sourceCode as string;
      if (!fixedSourceCode || typeof fixedSourceCode !== 'string') {
        return { success: false, error: 'LLM response missing sourceCode' };
      }

      logger.info({ toolId: tool.id, healing: true }, 'Code tool healed by Brain');
      return { success: true, fixedSourceCode };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ toolId: tool.id, error: errorMessage }, 'Code healing failed');
      return { success: false, error: errorMessage };
    }
  }

  registerMCPServer(config: MCPServerConfig): void {
    this.mcpServerConfigs.set(config.id, config);
    if (config.url) {
      this.mcpClients.set(config.id, new MCPHTTPClient(config));
    } else {
      this.mcpClients.set(config.id, new MCPClient(config));
    }
    logger.info({ serverId: config.id, name: config.name }, 'MCP server registered');
  }

  unregisterMCPServer(id: string): void {
    const client = this.mcpClients.get(id);
    if (client instanceof MCPClient) {
      client.disconnect().catch(() => {});
    }
    this.mcpClients.delete(id);
    this.mcpServerConfigs.delete(id);
  }

  getCredentialRequest(executionId: string): CredentialRequest | undefined {
    const pending = this.pendingCredentialRequests.get(executionId);
    return pending?.request;
  }

  async submitCredentials(executionId: string, submission: { credentials: Record<string, string>; storeInVault?: boolean; vaultSecretId?: string }): Promise<ToolExecution | CredentialRequiredError> {
    const pending = this.pendingCredentialRequests.get(executionId);
    if (!pending) {
      throw new Error(`No pending credential request for execution ${executionId}`);
    }

    this.pendingCredentialOverrides.set(pending.tool.id, submission.credentials);

    if (submission.storeInVault && submission.vaultSecretId) {
      try {
        const vaultUrl = process.env.VAULT_URL || 'http://vault:4000';
        await fetch(`${vaultUrl}/secrets/${submission.vaultSecretId}/encrypt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plaintext: JSON.stringify(submission.credentials) }),
        });
        logger.info({ executionId, vaultSecretId: submission.vaultSecretId }, 'Credentials stored in Vault');
      } catch (err) {
        logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to store credentials in Vault');
      }
    }

    this.pendingCredentialRequests.delete(executionId);

    return this.executeOrRequestCredentials(pending.tool, pending.input);
  }

  async retryExecution(executionId: string): Promise<ToolExecution | CredentialRequiredError> {
    const pending = this.pendingCredentialRequests.get(executionId);
    if (!pending) {
      throw new Error(`No pending execution to retry for ${executionId}`);
    }

    this.pendingCredentialRequests.delete(executionId);
    return this.executeOrRequestCredentials(pending.tool, pending.input);
  }

  async discoverMCPTools(serverId?: string): Promise<Map<string, { tool: Tool; serverId: string }>> {
    const discovered = new Map<string, { tool: Tool; serverId: string }>();
    const servers = serverId ? [serverId] : Array.from(this.mcpServerConfigs.keys());

    for (const sid of servers) {
      const client = this.mcpClients.get(sid);
      if (!client) continue;

      try {
        const mcpTools = await client.listTools();
        for (const mcpTool of mcpTools) {
          const tool: Tool = {
            id: `${sid}:${mcpTool.name}`,
            name: mcpTool.name,
            description: mcpTool.description,
            type: 'mcp',
            manifest: {
              server: sid,
              capabilities: mcpTool.inputSchema ? Object.keys(mcpTool.inputSchema.properties || {}) : [],
            },
            inputSchema: mcpTool.inputSchema || { type: 'object', properties: {} },
            outputSchema: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          discovered.set(tool.id, { tool, serverId: sid });
        }
        logger.info({ serverId: sid, toolCount: mcpTools.length }, 'MCP tools discovered');
      } catch (err) {
        logger.error({ serverId: sid, err: (err as Error).message }, 'MCP tool discovery failed');
      }
    }

    return discovered;
  }

  private async resolveCredentials(tool: Tool, _input: Record<string, unknown>): Promise<Record<string, string | undefined>> {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const credentialSources: Array<{ key: string; label?: string; source: { vaultSecretId?: string; envVar?: string; configKey?: string } }> = [];

    if (manifest?.credentialSource && typeof manifest.credentialSource === 'object') {
      const cs = manifest.credentialSource as Record<string, { vaultSecretId?: string; envVar?: string; configKey?: string }>;
      for (const [key, source] of Object.entries(cs)) {
        if (source && typeof source === 'object') {
          const s = source as { vaultSecretId?: string; envVar?: string; configKey?: string };
          credentialSources.push({ key, label: key, source: s });
        }
      }
    }

    const sources = credentialSources.map((c) => c.source);
    const resolved = await credentialProvider.resolveAll(sources);

    const overrides = this.pendingCredentialOverrides.get(tool.id) || {};
    const merged = { ...resolved, ...overrides };

    const missing = credentialSources
      .filter((c) => !merged[c.key])
      .map((c) => ({
        key: c.key,
        label: c.label || c.key,
        source: c.source,
      }));

    if (missing.length > 0) {
      const request: CredentialRequest = {
        executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        toolId: tool.id,
        toolName: tool.name,
        missingCredentials: missing,
        message: `Tool "${tool.name}" requires credentials: ${missing.map((m) => m.label).join(', ')}`,
      };
      throw new CredentialRequiredError(request);
    }

    return merged;
  }

  private async dispatch(tool: Tool, input: Record<string, unknown>, credentials: Record<string, string | undefined>): Promise<Record<string, unknown>> {
    const name = tool.name.toLowerCase();
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities as string[] : [];

    if (tool.type === 'code' || manifest?.language) {
      const language = (manifest?.language as string) || 'javascript';
      const sourceCode = (manifest?.sourceCode as string) || '';
      const entrypoint = (manifest?.entrypoint as string) || 'index.js';

      if (!sourceCode) {
        return { error: 'Code tool is missing sourceCode in manifest' };
      }

      let codeToRun = sourceCode;
      let healingAttempts = 0;
      let lastError: string | undefined;

      while (healingAttempts <= MAX_HEALING_ATTEMPTS) {
        const result = await this.codeExecutor.execute(
          { language: language as 'javascript' | 'typescript' | 'python', code: codeToRun },
          credentials,
        );

        if (result.success) {
          if (healingAttempts > 0 && manifest && typeof manifest === 'object') {
            (manifest as Record<string, unknown>).sourceCode = codeToRun;
            logger.info({ toolId: tool.id, healingAttempts }, 'Healed code persisted to tool manifest');
          }
          return {
            output: result.output,
            exitCode: result.exitCode ?? 0,
            durationMs: result.durationMs,
          };
        }

        lastError = result.error;
        if (healingAttempts >= MAX_HEALING_ATTEMPTS) break;

        const healing = await this.healCodeTool(tool, input, lastError || 'Unknown execution error');
        if (!healing.success || !healing.fixedSourceCode) {
          logger.warn({ toolId: tool.id, healingError: healing.error }, 'Healing failed, aborting retries');
          break;
        }

        codeToRun = healing.fixedSourceCode;
        healingAttempts++;
        logger.info({ toolId: tool.id, attempt: healingAttempts }, 'Retrying with healed code');
      }

      return { error: lastError, exitCode: -1 };
    }

    if (tool.type === 'openapi' && manifest?.urlTemplate) {
      const urlTemplate = manifest.urlTemplate as string;
      const method = ((manifest?.method as string) || 'GET').toUpperCase();
      const url = urlTemplate.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent((input[key] as string) || key));

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(credentials.Authorization ? { Authorization: credentials.Authorization } : {}),
          ...(credentials['api-key'] ? { 'api-key': credentials['api-key'] } : {}),
          ...(manifest.headers as Record<string, string> || {}),
        },
      };

      if (method !== 'GET' && method !== 'HEAD' && input.body !== undefined) {
        fetchOptions.body = JSON.stringify(input.body);
      }

      const response = await fetch(url, fetchOptions);
      let data: any;
      try {
        data = await response.json();
      } catch {
        data = { text: await response.text() };
      }
      return { status: response.status, data };
    }

    if (tool.type === 'mcp' && manifest?.server) {
      const serverId = manifest.server as string;
      const client = this.mcpClients.get(serverId);
      if (!client) {
        return { error: `MCP server '${serverId}' not configured. Register it via registerMCPServer().` };
      }

      try {
        const result = await client.callTool(tool.name, input);
        return {
          content: result.content,
          isError: result.isError,
        };
      } catch (err) {
        return { error: `MCP tool execution failed: ${(err as Error).message}` };
      }
    }

    if (name.includes('ftp')) {
      const result = await this.ftpExecutor.execute(
        {
          host: (input.host as string) || '',
          port: (input.port as number) || 21,
          username: (input.username as string) || '',
          password: (input.password as string) || '',
          operation: (input.operation as FtpExecutionOptions['operation']) || 'list',
          remotePath: input.remotePath as string,
          localPath: input.localPath as string,
          content: input.content as string,
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { output: result.output, durationMs: result.durationMs };
    }

    if (name.includes('webhook')) {
      const result = await this.webhookExecutor.execute(
        {
          url: (input.url as string) || '',
          method: (input.method as WebhookDispatchOptions['method']) || 'POST',
          headers: input.headers as Record<string, string>,
          body: input.body as Record<string, unknown>,
          secret: input.secret as string,
          event: input.event as string,
          retries: (input.retries as number) || 3,
          timeoutMs: (input.timeoutMs as number) || 10000,
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { statusCode: result.statusCode, response: result.response, durationMs: result.durationMs };
    }

    if (name.includes('database') || name.includes('db') || capabilities.includes('query')) {
      const result = await this.databaseExecutor.execute(
        {
          engine: (input.engine as DatabaseQueryOptions['engine']) || 'sqlite',
          connectionString: input.connectionString as string,
          host: input.host as string,
          port: input.port as number,
          database: input.database as string,
          username: input.username as string,
          password: input.password as string,
          query: (input.query as string) || '',
          params: input.params as unknown[],
          timeoutMs: (input.timeoutMs as number) || 30000,
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { rows: result.rows, columns: result.columns, rowCount: result.rowCount, durationMs: result.durationMs };
    }

    if (name.includes('file') || name.includes('storage') || capabilities.includes('read') || capabilities.includes('write')) {
      const result = await this.fileStorageExecutor.execute(
        {
          operation: (input.operation as FileStorageOptions['operation']) || 'read',
          path: (input.path as string) || '',
          content: input.content as string,
          bucket: input.bucket as string,
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { data: result.data, durationMs: result.durationMs };
    }

    if (name.includes('jira') || name.includes('confluence') || name.includes('slack') || name.includes('github')) {
      const vendor = name.includes('jira') ? 'jira' :
                     name.includes('confluence') ? 'confluence' :
                     name.includes('slack') ? 'slack' : 'github';

      const result = await this.vendorApiExecutor.execute(
        {
          vendor,
          operation: (input.operation as string) || 'query',
          input,
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { data: result.data, durationMs: result.durationMs };
    }

    if (name.includes('email') || manifest?.server === 'email-mcp' || capabilities.includes('send')) {
      const result = await this.emailExecutor.execute(
        {
          to: (input.to as string | string[]) || '',
          subject: (input.subject as string) || '',
          text: (input.body as string) || (input.text as string),
          html: (input.html as string),
          from: (input.from as string),
          attachments: (input.attachments as Array<{ filename?: string; content?: string | Buffer; path?: string }>) || [],
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { messageId: result.messageId, status: 'sent' };
    }

    if (name.includes('search') || name.includes('query') || capabilities.includes('search')) {
      const result = await this.searchExecutor.execute(
        {
          query: (input.query as string) || (input.q as string) || '',
          maxResults: (input.maxResults as number) || (input.max_results as number) || 10,
          searchType: (input.searchType as 'web' | 'images' | 'news') || 'web',
        },
        credentials,
      );

      if (!result.success) {
        return { error: result.error };
      }

      return { results: result.results, count: result.results?.length ?? 0 };
    }

    const discovered = await this.toolDiscovery.discoverAndRegister(tool.name + ' ' + tool.description, {
      register: (t: Tool) => {
        if (this.toolRegistry) {
          this.toolRegistry.set(t.id, t);
        }
      },
    });

    if (discovered) {
      logger.info({ toolId: discovered.id, source: (discovered.manifest as Record<string, unknown>)?.source }, 'External tool discovered');
      return {
        status: 'discovered',
        toolId: discovered.id,
        source: (discovered.manifest as Record<string, unknown>)?.source as string,
        packageName: (discovered.manifest as Record<string, unknown>)?.packageName as string,
        installCommand: (discovered.manifest as Record<string, unknown>)?.installCommand as string,
        message: `Discovered external tool: ${discovered.name}. Install it to use this capability.`,
        requiresInstallation: true,
      };
    }

    const generated = await this.pluginGenerator.generate({
      description: tool.description || `Tool: ${tool.name}`,
      requirements: [],
      context: { toolName: tool.name, input },
    });

    if (generated.success && generated.tool) {
      try {
        const deployed = await this.pluginGenerator.deploy(generated.tool);
        if (deployed.success) {
          logger.info({ toolId: generated.tool.id, deployPath: deployed.deployPath }, 'Auto-generated plugin deployed');
          const retryResult = await this.codeExecutor.execute(
            { language: 'javascript', code: (generated.tool.manifest as Record<string, unknown>)?.sourceCode as string || '' },
            credentials,
          );
          if (retryResult.success) {
            return {
              output: retryResult.output,
              exitCode: retryResult.exitCode ?? 0,
              durationMs: retryResult.durationMs,
              autoGenerated: true,
            };
          }
          return { error: retryResult.error, exitCode: -1, autoGenerated: true };
        }
      } catch (deployErr) {
        logger.warn({ toolId: generated.tool.id, err: deployErr instanceof Error ? deployErr.message : String(deployErr) }, 'Auto-deployment failed');
      }
    }

    return {
      error: `Unsupported tool type: ${tool.type}. Register a real executor or MCP server for this tool.`,
      toolName: tool.name,
    };
  }
}
