import { logger } from '@stage7-nextgen/shared';
import { PluginGenerationRequest, PluginGenerationResult, Tool } from '../types';
import { CredentialProvider } from '../services/CredentialProvider';
import { ToolRegistry } from '../services/ToolRegistry';
import { ToolDiscovery, DiscoveredTool } from '../services/ToolDiscovery';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const PLUGIN_SYSTEM_PROMPT = `You are a senior engineer generating production-ready plugins for an AI agent platform.
Output ONLY a single JSON object with this exact shape:
{
  "id": "string",
  "name": "string",
  "description": "string",
  "type": "code",
  "language": "javascript" | "python",
  "entrypoint": "index.js" | "main.py",
  "sourceCode": "string",
  "requirements": ["string"],
  "configSchema": { "type": "object", "properties": {} },
  "inputs": { "type": "object", "properties": {} },
  "outputs": { "type": "object", "properties": {} }
}

Rules:
- sourceCode must be complete, runnable code for the specified language.
- CodeExecutor runs sourceCode directly as a script; do not rely on module.exports or an external caller invoking a function.
- For JavaScript, read inputs from the global __tool_input object and print exactly one JSON result object with console.log(JSON.stringify(result)).
- For Python, read inputs from __tool_input and print exactly one JSON result object with print(json.dumps(result)).
- Do not print logs, explanations, or other text alongside the JSON result.
- requirements must be empty; dependencies are not installed for generated plugins.
- Preserve any exact plugin ID, name, input schema, output schema, and behavior requested by the user prompt.
- Include configSchema in every response; use {"type":"object","properties":{}} when no configuration is needed.
- Do NOT include markdown fences or explanation text outside the JSON.`;

const PLUGIN_DEPLOY_DIR = process.env.PLUGIN_DEPLOY_DIR || '/tmp/stage7-plugins';
const MAX_PLUGIN_SOURCE_BYTES = 128 * 1024;
const generatedPluginSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, 'id must be a safe plugin identifier'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000),
  type: z.literal('code'),
  language: z.enum(['javascript', 'python']),
  entrypoint: z.enum(['index.js', 'main.py']),
  sourceCode: z.string().min(1),
  requirements: z.array(z.string().trim().min(1)).max(0, 'Generated plugins cannot declare uninstalled dependencies'),
  configSchema: z.record(z.unknown()),
  inputs: z.record(z.unknown()),
  outputs: z.record(z.unknown()),
}).strict().superRefine((plugin, context) => {
  if (Buffer.byteLength(plugin.sourceCode, 'utf8') > MAX_PLUGIN_SOURCE_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceCode'],
      message: `sourceCode must not exceed ${MAX_PLUGIN_SOURCE_BYTES} bytes`,
    });
  }
  const expectedEntrypoint = plugin.language === 'javascript' ? 'index.js' : 'main.py';
  if (plugin.entrypoint !== expectedEntrypoint) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['entrypoint'],
      message: `entrypoint must be ${expectedEntrypoint} for ${plugin.language}`,
    });
  }
});

function safePluginId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
}

function expectedEntrypoint(language: unknown): 'index.js' | 'main.py' | undefined {
  if (language === 'javascript') return 'index.js';
  if (language === 'python') return 'main.py';
  return undefined;
}

export class PluginGenerator {
  private credentialProvider = CredentialProvider;
  private registry: ToolRegistry | null = null;
  private discovery: ToolDiscovery;

  constructor() {
    this.discovery = new ToolDiscovery();
  }

  setRegistry(registry: ToolRegistry): void {
    this.registry = registry;
  }

  private async reportBrainComplaint(requestId: unknown, reason: string, missionId?: string): Promise<void> {
    if (typeof requestId !== 'string' || !requestId.trim()) {
      logger.warn(
        { missionId, reason },
        'Cannot report rejected plugin-generation output to Brain without a request ID',
      );
      return;
    }

    const brainUrl = (process.env.BRAIN_URL || 'http://brain:3100').replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${brainUrl}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: requestId.trim(), reason: reason.slice(0, 2_000), missionId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.text();
        logger.error(
          { missionId, requestId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected a plugin-generation quality complaint',
        );
        return;
      }
      logger.info(
        { missionId, requestId, reason },
        'Plugin-generation validation complaint recorded',
      );
    } catch (error) {
      logger.error(
        { missionId, requestId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report a plugin-generation quality complaint',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(request: PluginGenerationRequest): Promise<PluginGenerationResult> {
    logger.info({ description: request.description }, 'Plugin generation started');

    try {
      const discovered = await this.discovery.discoverAndRegister(request.description, {
        register: (tool: Tool) => {
          if (this.registry) {
            // registerOrReplace: a re-discovered tool may already be present
            // (e.g. restored from the ToolStore on boot), which must not throw.
            this.registry.registerOrReplace(tool);
          }
        },
      });

      if (discovered) {
        logger.info({ toolId: discovered.id, source: (discovered.manifest as Record<string, unknown>)?.source }, 'External tool discovered, skipping generation');
        return { success: true, tool: discovered };
      }

      const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
      const missionId = typeof request.context?.missionId === 'string'
        ? request.context.missionId
        : undefined;
      const userPrompt = `Generate a plugin for: ${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\nContext: ${JSON.stringify(request.context || {})}`;

      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt: PLUGIN_SYSTEM_PROMPT,
          options: { temperature: 0.2, maxTokens: 4096 },
          missionId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text.slice(0, 200) }, 'Plugin generation LLM call failed');
        return { success: false, error: `LLM returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json() as { content?: unknown; requestId?: unknown };
      if (typeof data.content !== 'string' || Buffer.byteLength(data.content, 'utf8') > MAX_PLUGIN_SOURCE_BYTES * 2) {
        const error = 'LLM plugin response content is missing or exceeds the response size limit';
        await this.reportBrainComplaint(data.requestId, error, missionId);
        return { success: false, error };
      }
      let rawPlugin: unknown;
      try {
        rawPlugin = JSON.parse(data.content);
      } catch (error) {
        const reason = `LLM plugin response must be a single JSON object: ${error instanceof Error ? error.message : String(error)}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return {
          success: false,
          error: reason,
        };
      }
      const validation = generatedPluginSchema.safeParse(rawPlugin);
      if (!validation.success) {
        const reason = `Generated plugin failed validation: ${validation.error.issues.map((issue) => `${issue.path.join('.') || 'plugin'} ${issue.message}`).join('; ')}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return {
          success: false,
          error: reason,
        };
      }
      const parsed = validation.data;
      if (this.registry?.get(parsed.id)) {
        const reason = `Generated plugin id '${parsed.id}' is already registered`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return { success: false, error: reason };
      }
      const tool: Tool = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description,
        type: 'code',
        manifest: {
          language: parsed.language || 'javascript',
          entrypoint: parsed.entrypoint || 'index.js',
          sourceCode: parsed.sourceCode,
          requirements: parsed.requirements || [],
          configSchema: parsed.configSchema || {},
          inputs: parsed.inputs || {},
          outputs: parsed.outputs || {},
        },
        inputSchema: parsed.inputs || { type: 'object', properties: {} },
        outputSchema: parsed.outputs || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      logger.info({ toolId: tool.id, toolName: tool.name }, 'Plugin generation completed');
      return { success: true, tool };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Plugin generation failed');
      return { success: false, error: errorMessage };
    }
  }

  async deploy(tool: Tool): Promise<{ success: boolean; deployPath?: string; error?: string }> {
    let stagingDir: string | undefined;
    try {
      const manifest = tool.manifest as Record<string, unknown>;
      const validation = generatedPluginSchema.safeParse({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        type: tool.type,
        language: manifest?.language,
        entrypoint: manifest?.entrypoint,
        sourceCode: manifest?.sourceCode,
        requirements: manifest?.requirements,
        configSchema: manifest?.configSchema,
        inputs: manifest?.inputs,
        outputs: manifest?.outputs,
      });
      if (!validation.success) {
        return {
          success: false,
          error: `Generated plugin failed validation: ${validation.error.issues.map((issue) => `${issue.path.join('.') || 'plugin'} ${issue.message}`).join('; ')}`,
        };
      }

      const { language, entrypoint, sourceCode } = validation.data;
      const deployRoot = path.resolve(PLUGIN_DEPLOY_DIR);
      const pluginDir = path.resolve(deployRoot, tool.id);
      const relativePluginPath = path.relative(deployRoot, pluginDir);
      if (!relativePluginPath || relativePluginPath.startsWith('..') || path.isAbsolute(relativePluginPath)) {
        return { success: false, error: 'Plugin id resolves outside the deployment directory' };
      }
      if (this.registry?.get(tool.id) || fs.existsSync(pluginDir)) {
        return { success: false, error: `Plugin id '${tool.id}' is already registered or deployed` };
      }

      fs.mkdirSync(deployRoot, { recursive: true });
      stagingDir = fs.mkdtempSync(path.join(deployRoot, '.stage7-plugin-'));
      fs.writeFileSync(path.join(stagingDir, entrypoint), sourceCode, 'utf-8');

      fs.writeFileSync(path.join(stagingDir, 'plugin.json'), JSON.stringify({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        type: tool.type,
        language,
        entrypoint,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        createdAt: tool.createdAt,
        updatedAt: tool.updatedAt,
      }, null, 2), 'utf-8');

      fs.renameSync(stagingDir, pluginDir);
      stagingDir = undefined;
      if (this.registry) {
        try {
          this.registry.register(tool);
        } catch (error) {
          try {
            fs.rmSync(pluginDir, { recursive: true, force: true });
          } catch (cleanupError) {
            logger.error(
              { toolId: tool.id, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) },
              'Failed to remove an unregistered generated plugin',
            );
          }
          throw error;
        }
        logger.info({ toolId: tool.id }, 'Plugin deployed and registered with ToolRegistry');
      } else {
        logger.info({ toolId: tool.id, deployPath: pluginDir }, 'Plugin deployed locally');
      }
      return { success: true, deployPath: pluginDir };
    } catch (err) {
      if (stagingDir && fs.existsSync(stagingDir)) {
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch (cleanupError) {
          logger.error(
            { stagingDir, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) },
            'Failed to remove generated plugin staging directory',
          );
        }
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Plugin deployment failed');
      return { success: false, error: errorMessage };
    }
  }

  static listDeployed(): Array<{ id: string; name: string; deployPath: string; language: string }> {
    if (!fs.existsSync(PLUGIN_DEPLOY_DIR)) {
      return [];
    }

    const plugins: Array<{ id: string; name: string; deployPath: string; language: string }> = [];
    const entries = fs.readdirSync(PLUGIN_DEPLOY_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(PLUGIN_DEPLOY_DIR, entry.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!safePluginId(manifest.id) || manifest.id !== entry.name) continue;
        plugins.push({
          id: manifest.id,
          name: manifest.name,
          deployPath: path.join(PLUGIN_DEPLOY_DIR, entry.name),
          language: manifest.language || 'javascript',
        });
      } catch {
        // skip invalid manifests
      }
    }

    return plugins;
  }

  static loadDeployed(id: string): Tool | undefined {
    if (!safePluginId(id)) return undefined;
    const manifestPath = path.join(PLUGIN_DEPLOY_DIR, id, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return undefined;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.id !== id) return undefined;
      const entrypoint = expectedEntrypoint(manifest.language);
      if (!entrypoint || manifest.entrypoint !== entrypoint) return undefined;
      const sourceCode = fs.readFileSync(path.join(PLUGIN_DEPLOY_DIR, id, entrypoint), 'utf-8');

      return {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        type: manifest.type || 'code',
        manifest: {
          language: manifest.language,
          entrypoint,
          sourceCode,
          ...manifest,
        },
        inputSchema: manifest.inputSchema || { type: 'object', properties: {} },
        outputSchema: manifest.outputSchema || {},
        createdAt: new Date(manifest.createdAt),
        updatedAt: new Date(manifest.updatedAt),
      };
    } catch {
      return undefined;
    }
  }
}