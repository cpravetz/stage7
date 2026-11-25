import { Tool } from '../types';
import logger from '../utils/logger';
import { httpRequest, llmCallTimeoutMs } from '@stage7-nextgen/shared';
import { ErrorHandler } from '../utils/ErrorHandler';
import path from 'path';
import type { CodeExecutorCredentials } from '../executors/CodeExecutor';
import { DockerLocalDriver } from '../runners/DockerLocalDriver';
import type { SandboxExecutionDriver } from '../runners/SandboxExecutionDriver';
import { NamedCredentialSource } from '../services/CredentialProvider';
import { ReasoningExecutor } from '../executors/ReasoningExecutor';
import { PluginGenerator } from '../services/PluginGenerator';
import { ToolDiscovery } from '../services/ToolDiscovery';
import { MCPClient, MCPHTTPClient } from '../services/MCPClient';
import { validateAgainstOutputSchema, parseToolOutputJson } from '../utils/schemaValidator';
import { extractJsonObject } from '../adk/resilience';
import { assertPublicUrl } from '../utils/assertPublicUrl';
import { schemaRecord, type ToolConfigResolver } from './ToolConfig';
import { resolveNativeBinding } from './ExecutorBindings';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';
const HEALING_SYSTEM_PROMPT = `You are a senior engineer debugging a failed code execution. Given the error message, source code, and input that caused the failure, provide a corrected version of the code. Output ONLY a single JSON object with this exact shape: { "sourceCode": "corrected code string", "explanation": "brief explanation of the fix" }`;
const MAX_HEALING_ATTEMPTS = 2;

function generatedToolUsesProcessEnvironment(language: unknown, sourceCode: string): boolean {
  return language === 'javascript'
    ? /\bprocess\s*(?:\.\s*env\b|\[\s*['"`]env['"`]\s*\])/.test(sourceCode)
    : /\bos\s*\.\s*(?:environ\b|getenv\s*\()|\bgetenv\s*\(|\bfrom\s+os\s+import\s+[^;\n]*\b(?:environ|getenv)\b/.test(sourceCode);
}

function toolFailureMessage(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined;
  const parsed = typeof value === 'string' ? parseToolOutputJson(value) : value;
  const payload = schemaRecord(parsed);
  if (!payload) return undefined;
  // An explicit `error` string indicates failure unless the payload also
  // declares `success: false` — in that case the tool is reporting a nested
  // callee's failure, not its own (the code process itself exited 0).
  if (typeof payload.error === 'string' && payload.error.trim() && payload.success !== false) {
    return payload.error.trim();
  }
  if (payload.isError === true || payload.status === 'failed') {
    return 'Tool returned an explicit failure result';
  }
  // Don't recurse when top-level already has explicit success/failure
  if ('success' in payload || 'isError' in payload || 'status' in payload) return undefined;
  for (const key of ['output', 'data', 'result']) {
    const message = toolFailureMessage(payload[key], depth + 1);
    if (message) return message;
  }
  return undefined;
}

/** Runs another tool by id/name on behalf of a running skill (`__execute_tool`) or an event trigger. */
export type NestedExecutor = (toolId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Turns a (tool, input, resolved credentials) triple into an actual execution:
 * native executor binding, sandboxed code (with LLM self-healing), OpenAPI / MCP /
 * reasoning tools, manifest-keyed native bindings, discovery, and plugin auto-generation.
 *
 * Holds no per-execution state. The registry and MCP client map are the executor's
 * own, shared by reference.
 */
export class ToolDispatcher {
  private reasoningExecutor = new ReasoningExecutor();
  private sandboxDriver: SandboxExecutionDriver = new DockerLocalDriver();
  private pluginGenerator = new PluginGenerator();
  private toolDiscovery = new ToolDiscovery();

  private codeModuleCache = new Map<string, any>();

  constructor(
    private readonly toolRegistry: Map<string, Tool> | null,
    private readonly mcpClients: Map<string, MCPClient | MCPHTTPClient>,
    private readonly config: ToolConfigResolver,
    private readonly nestedExecutor: NestedExecutor,
  ) {}

  async generatePlugin(request: {
    description: string;
    requirements?: string[];
    context?: Record<string, unknown>;
  }): Promise<{ success: boolean; tool?: Tool; error?: string }> {
    return this.pluginGenerator.generate(request);
  }

  async healCodeTool(
    tool: Tool,
    input: Record<string, unknown>,
    errorMessage: string,
  ): Promise<{ success: boolean; fixedSourceCode?: string; error?: string }> {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const sourceCode = (manifest?.sourceCode as string) || '';
    if (!sourceCode) {
      return { success: false, error: 'No sourceCode to heal' };
    }

    const userPrompt = `ERROR: ${errorMessage}\n\nINPUT: ${JSON.stringify(input, null, 2)}\n\nCODE:\n${sourceCode}\n\nProvide the corrected code.`;

    try {
      const response = await httpRequest(`${BRAIN_URL}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt: HEALING_SYSTEM_PROMPT,
          options: { temperature: 0.2, maxTokens: 4096 },
        }),
        // Code healing is an LLM completion; it needs the long ceiling.
        timeoutMs: llmCallTimeoutMs(),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `Brain returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = (await response.json()) as { content: string };
      const parsed = extractJsonObject(data.content);
      if (!parsed) {
        return { success: false, error: 'LLM response did not contain valid JSON' };
      }

      const fixedSourceCode = parsed.sourceCode as string;
      if (!fixedSourceCode || typeof fixedSourceCode !== 'string') {
        return { success: false, error: 'LLM response missing sourceCode' };
      }

      logger.info({ toolId: tool.id, healing: true }, 'Code tool healed by Brain');
      return { success: true, fixedSourceCode };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ toolId: tool.id, error: errorMessage }, 'Code healing failed');
      return { success: false, error: errorMessage };
    }
  }

  private loadCodeModule(codeFile: string): any {
    if (this.codeModuleCache.has(codeFile)) {
      return this.codeModuleCache.get(codeFile);
    }
    let mod: any;
    try {
      mod = require(codeFile);
    } catch (err) {
      throw new Error(`Failed to load code module '${codeFile}': ${err instanceof Error ? err.message : String(err)}`);
    }
    this.codeModuleCache.set(codeFile, mod);
    return mod;
  }

  private resolveCodeFile(tool: Tool): string | undefined {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const declared = manifest?.codeFile as string | undefined;
    if (!declared) return undefined;
    return path.resolve(declared);
  }

  private async executeNativeModule(
    codeFile: string,
    normalizedInput: Record<string, unknown>,
    resolved: Record<string, string | undefined>,
  ): Promise<{ success: boolean; error?: string; data: Record<string, unknown> }> {
    const mod = this.loadCodeModule(codeFile);
    const result = await mod.execute(normalizedInput, resolved);
    if (!result.success) {
      return { success: false, error: result.error, data: {} };
    }
    const { success, error, durationMs, ...data } = result;
    return {
      success: true,
      data: { ...data, ...(durationMs !== undefined ? { durationMs } : {}) },
    };
  }

  /**
   * MCP Tool Discovery hook (§3). When a tool is not registered, ask the MCP
   * Tool Executive to search approved MCP library sources. If a candidate
   * needs user permission, throw MCPToolDiscoveryRequiredError so the caller
   * can present the permission request. If pre-approved or already granted,
   * integrate and retry with the new tool. Otherwise fall through so the
   * existing dispatch fallback (plugin generation, discovery) still applies.
   */
  async dispatch(
    tool: Tool,
    input: Record<string, unknown>,
    credentials: { resolved: Record<string, string | undefined>; sources: NamedCredentialSource[] },
  ): Promise<Record<string, unknown>> {
    const { resolved, sources } = credentials;
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const capabilities = Array.isArray(manifest?.capabilities) ? (manifest.capabilities as string[]) : [];

    // === Explicit native executor binding (checked first) ===
    const executorKey = manifest?.executor as string | undefined;
    if (executorKey) {
      // Input normalization: shallow-copy input and add camelCase aliases for snake_case keys
      const normalizedInput: Record<string, unknown> = { ...input };
      for (const key of Object.keys(input)) {
        if (key.includes('_')) {
          const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          if (camelKey !== key) {
            normalizedInput[camelKey] = input[key];
          }
        }
      }

      // Vendor identity is manifest data (the schema requires `vendor` for
      // executor: 'vendor'); no name inference.
      if (executorKey === 'vendor' && normalizedInput.vendor === undefined && typeof manifest?.vendor === 'string') {
        normalizedInput.vendor = manifest.vendor;
      }

      try {
        const codeFile = this.resolveCodeFile(tool);
        if (!codeFile) {
          return { output: { error: `Native tool '${tool.name}' (executor '${executorKey}') resolved to no code file` } };
        }

        const mod = this.loadCodeModule(codeFile);
        const result = await mod.execute(normalizedInput, resolved);

        if (result && typeof result === 'object' && 'success' in result) {
          if (!result.success) {
            return { output: { error: result.error } };
          }
          // Return success result with data fields and durationMs where available
          const { success, error, durationMs, ...data } = result;
          return { ...data, ...(durationMs !== undefined ? { durationMs } : {}) };
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ toolId: tool.id, executorKey, error }, 'Native executor failed');
        return { output: { error } };
      }
    }
    // If no executorKey, fall through to code / MCP / manifest-keyed dispatch below
    if (tool.type === 'code' || manifest?.language) {
      const language = (manifest?.language as string) || 'javascript';
      const sourceCode = (manifest?.sourceCode as string) || '';
      const validation = manifest?.validation as Record<string, unknown> | undefined;
      if (validation?.method === 'isolated-contract-tests' && generatedToolUsesProcessEnvironment(language, sourceCode)) {
        return {
          error:
            'Generated tool depends on process environment variables, which cannot be configured at runtime. Recreate it using declared runtime configuration instead.',
        };
      }
      //const entrypoint = (manifest?.entrypoint as string) || 'index.js';

      if (!sourceCode) {
        return { output: { error: 'Code tool is missing sourceCode in manifest' } };
      }

      let codeToRun = sourceCode;
      let healingAttempts = 0;
      let lastError: string | undefined;

      while (healingAttempts <= MAX_HEALING_ATTEMPTS) {
        const result = await this.sandboxDriver.execute(
          {
            language: language as 'javascript' | 'typescript' | 'python',
            code: codeToRun,
            input,
            config: this.config.resolveSkillConfig(tool, input),
            credentials: credentials.resolved,
            executorCallback: this.nestedExecutor,
            timeoutMs: (manifest && typeof manifest === 'object' && (manifest as Record<string, unknown>).timeoutMs) as number | undefined,
            persistenceEnvVar: (manifest && typeof manifest === 'object'
              ? (manifest as Record<string, unknown>).persistenceEnvVar
              : undefined) as string | undefined,
          },
          { resolved, sources } as CodeExecutorCredentials,
        );

        if (result.success) {
          if (healingAttempts > 0 && manifest && typeof manifest === 'object') {
            (manifest as Record<string, unknown>).sourceCode = codeToRun;
            logger.info({ toolId: tool.id, healingAttempts }, 'Healed code persisted to tool manifest');
          }
          // Hold code tools to their declared outputSchema. A skill that promises a contract and emits
          // something else was previously indistinguishable from one that kept it.
          const schemaIssues = validateAgainstOutputSchema(parseToolOutputJson(result.output), tool.outputSchema);
          if (schemaIssues.length > 0) {
            logger.error({ toolId: tool.id, issues: schemaIssues }, 'Tool result does not match its declared outputSchema');
          }
          const failureMessage = toolFailureMessage(result.output);
          if (failureMessage) {
            return { error: failureMessage, output: result.output };
          }
          return {
            output: result.output,
            exitCode: result.exitCode ?? 0,
            durationMs: result.durationMs,
            ...(result.storeWrites ? { storeWrites: result.storeWrites } : {}),
            ...(schemaIssues.length > 0 ? { outputSchemaIssues: schemaIssues } : {}),
          };
        }

        lastError = result.error;
        if (healingAttempts >= MAX_HEALING_ATTEMPTS) break;

        // Classify the error — if it's a code execution error, try healing.
        // If it's a timeout or transient error, also try healing.
        const classified = ErrorHandler.classify(lastError || 'Tool execution failed without a recorded error message.', tool.id);

        if (ErrorHandler.isCodeExecutionError(classified)) {
          const healing = await this.healCodeTool(tool, input, lastError || 'Unknown execution error');
          if (!healing.success || !healing.fixedSourceCode) {
            logger.warn(
              { toolId: tool.id, healingError: healing.error, classified: classified.category },
              'Healing failed, aborting retries',
            );
            break;
          }

          codeToRun = healing.fixedSourceCode;
          healingAttempts++;
          logger.info({ toolId: tool.id, attempt: healingAttempts, category: classified.category }, 'Retrying with healed code');
          continue;
        }

        // Non-code-execution error — don't heal, return classified error
        logger.warn(
          { toolId: tool.id, classified: classified.category, severity: classified.severity },
          'Non-healable error, returning classified result',
        );
        return ErrorHandler.formatResult(classified);
      }

      // All healing attempts exhausted — return classified error
      const finalClassified = ErrorHandler.classify(lastError || 'Tool execution failed after exhausting healing attempts.', tool.id);
      logger.warn(
        { toolId: tool.id, attempts: healingAttempts, classified: finalClassified.category },
        'Healing exhausted, returning classified error',
      );
      return ErrorHandler.formatResult(finalClassified);
    }

    switch (tool.type) {
      case 'openapi': {
        if (!manifest?.urlTemplate) break;
        const urlTemplate = manifest.urlTemplate as string;
        const method = ((manifest?.method as string) || 'GET').toUpperCase();
        const url = urlTemplate.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent((input[key] as string) || key));

        // SSRF guard: validate the resolved URL (lexical checks only; DNS
        // resolution is out of scope — see assertPublicUrl).
        let targetUrl: URL;
        try {
          targetUrl = new URL(url);
        } catch {
          return { error: `Invalid URL template: ${urlTemplate}` };
        }
        try {
          assertPublicUrl(targetUrl);
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'URL failed the SSRF safety check' };
        }

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(resolved.Authorization ? { Authorization: resolved.Authorization } : {}),
            ...(resolved['api-key'] ? { 'api-key': resolved['api-key'] } : {}),
            ...((manifest.headers as Record<string, string>) || {}),
          },
        };

        if (method !== 'GET' && method !== 'HEAD' && input.body !== undefined) {
          fetchOptions.body = JSON.stringify(input.body);
        }

        let response: Response | null = null;
        let data: any;
        try {
          // Manual redirect handling to prevent SSRF via redirect
          let currentUrl = url;
          const maxRedirects = 5;
          for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
            response = await fetch(currentUrl, {
              ...fetchOptions,
              redirect: 'manual',
            });

            if (response.status >= 300 && response.status < 400) {
              const location = response.headers.get('location');
              if (!location || redirectCount >= maxRedirects) {
                break;
              }
              let nextUrl: URL;
              try {
                nextUrl = new URL(location, currentUrl);
              } catch {
                break;
              }
              try {
                assertPublicUrl(nextUrl);
              } catch (err) {
                const reason = err instanceof Error ? err.message : 'unsafe redirect target';
                logger.warn({ from: currentUrl, to: nextUrl.toString() }, 'OpenAPI redirect rejected by SSRF guard');
                return { error: `Redirect not allowed: ${reason}` };
              }
              currentUrl = nextUrl.toString();
              continue;
            }
            break;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error({ url, err: errMsg }, 'OpenAPI fetch failed');
          return { error: `Request failed: ${errMsg}` };
        }

        try {
          if (!response) {
            data = { text: '' };
          } else if ((response as any).bodyUsed) {
            try {
              const txt = await (response as any).text();
              try {
                data = JSON.parse(txt);
              } catch {
                data = { text: txt };
              }
            } catch {
              data = { text: '' };
            }
          } else {
            try {
              data = await response.json();
            } catch (jsonErr) {
              try {
                const txt = await response.text();
                try {
                  data = JSON.parse(txt);
                } catch {
                  data = { text: txt };
                }
              } catch {
                data = { text: '' };
              }
            }
          }
          return { status: response ? response.status : 0, data };
        } catch {
          data = { text: await (response ? response.text() : Promise.resolve('')) };
          return { status: response ? response.status : 0, data };
        }
      }

      case 'mcp': {
        if (!manifest?.server) break;
        const serverId = manifest.server as string;
        const client = this.mcpClients.get(serverId);
        if (!client) {
          return { output: { error: `MCP server '${serverId}' not configured. Register it via registerMCPServer().` } };
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
      case 'reasoning': {
        const result = await this.reasoningExecutor.execute(tool, input);
        return result;
      }
      default:
        break;
    }

    if (tool.type === 'mcp' && !manifest?.server && manifest?.configSchema) {
      return { output: { error: `MCP tool '${tool.name}' is missing MCP server configuration.` } };
    }

    // === Manifest-keyed native dispatch ===
    // The binding (payload shape and result mapping) is read from the tool's
    // manifest data — `executor` first, then declared capabilities — never
    // from tool-name substrings.
    const binding = resolveNativeBinding(manifest, capabilities);
    if (binding) {
      const codeFile = this.resolveCodeFile(tool);
      if (!codeFile) {
        return { output: { error: `No code file resolved for ${binding.label} tool '${tool.name}'` } };
      }
      const exec = await this.executeNativeModule(codeFile, binding.buildInput(input, manifest), resolved);
      if (!exec.success) {
        return { output: { error: exec.error } };
      }
      return binding.mapOutput(exec.data);
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
          const retryResult = await this.sandboxDriver.execute(
            {
              language: 'javascript',
              code: ((generated.tool.manifest as Record<string, unknown>)?.sourceCode as string) || '',
              input,
              executorCallback: this.nestedExecutor,
              timeoutMs:
                (generated.tool.manifest as Record<string, unknown>) &&
                ((generated.tool.manifest as Record<string, unknown>).timeoutMs as number | undefined),
              persistenceEnvVar: (generated.tool.manifest as Record<string, unknown>)?.persistenceEnvVar as string | undefined,
            },
            { resolved, sources } as CodeExecutorCredentials,
          );
          if (retryResult.success) {
            return {
              output: retryResult.output,
              exitCode: retryResult.exitCode ?? 0,
              durationMs: retryResult.durationMs,
              autoGenerated: true,
              ...(retryResult.storeWrites ? { storeWrites: retryResult.storeWrites } : {}),
            };
          }
          return { error: retryResult.error, exitCode: -1, autoGenerated: true };
        }
      } catch (deployErr) {
        logger.warn(
          { toolId: generated.tool.id, err: deployErr instanceof Error ? deployErr.message : String(deployErr) },
          'Auto-deployment failed',
        );
      }
    }

    return {
      output: { error: `Unsupported tool type: ${tool.type}. Register a real executor or MCP server for this tool.` },
      toolName: tool.name,
    };
  }
}