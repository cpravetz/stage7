import { logger } from '@stage7-nextgen/shared';
import { PluginGenerationRequest, PluginGenerationResult, Tool } from '../types';
import { CredentialProvider } from '../services/CredentialProvider';
import { ToolRegistry } from '../services/ToolRegistry';
import { ToolDiscovery, DiscoveredTool } from '../services/ToolDiscovery';
import fs from 'fs';
import path from 'path';

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
- For Node.js, use CommonJS require() syntax.
- For Python, use standard library only unless requirements list includes the package.
- Do NOT include markdown fences or explanation text outside the JSON.`;

const PLUGIN_DEPLOY_DIR = process.env.PLUGIN_DEPLOY_DIR || '/tmp/stage7-plugins';

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

  async generate(request: PluginGenerationRequest): Promise<PluginGenerationResult> {
    logger.info({ description: request.description }, 'Plugin generation started');

    try {
      const discovered = await this.discovery.discoverAndRegister(request.description, {
        register: (tool: Tool) => {
          if (this.registry) {
            this.registry.register(tool);
          }
        },
      });

      if (discovered) {
        logger.info({ toolId: discovered.id, source: (discovered.manifest as Record<string, unknown>)?.source }, 'External tool discovered, skipping generation');
        return { success: true, tool: discovered };
      }

      const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
      const userPrompt = `Generate a plugin for: ${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\nContext: ${JSON.stringify(request.context || {})}`;

      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt: PLUGIN_SYSTEM_PROMPT,
          options: { temperature: 0.2, maxTokens: 4096 },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text.slice(0, 200) }, 'Plugin generation LLM call failed');
        return { success: false, error: `LLM returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json() as { content: string };
      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error({ content: data.content.slice(0, 200) }, 'Plugin generation response had no JSON');
        return { success: false, error: 'LLM response did not contain valid JSON' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const tool: Tool = {
        id: parsed.id || `plugin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: parsed.name || 'generated-plugin',
        description: parsed.description || request.description,
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
    try {
      const manifest = tool.manifest as Record<string, unknown>;
      const language = (manifest?.language as string) || 'javascript';
      const entrypoint = (manifest?.entrypoint as string) || 'index.js';
      const sourceCode = (manifest?.sourceCode as string) || '';

      if (!sourceCode) {
        return { success: false, error: 'Plugin has no sourceCode to deploy' };
      }

      const pluginDir = path.join(PLUGIN_DEPLOY_DIR, tool.id);
      if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir, { recursive: true });
      }

      const entryPath = path.join(pluginDir, entrypoint);
      fs.writeFileSync(entryPath, sourceCode, 'utf-8');

      const manifestPath = path.join(pluginDir, 'plugin.json');
      fs.writeFileSync(manifestPath, JSON.stringify({
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

      if (this.registry) {
        this.registry.register(tool);
        logger.info({ toolId: tool.id }, 'Plugin deployed and registered with ToolRegistry');
      } else {
        logger.info({ toolId: tool.id, deployPath: pluginDir }, 'Plugin deployed locally');
      }
      return { success: true, deployPath: pluginDir };
    } catch (err) {
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
    const manifestPath = path.join(PLUGIN_DEPLOY_DIR, id, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return undefined;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const entrypoint = manifest.entrypoint || 'index.js';
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