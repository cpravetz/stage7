import fs from 'fs';
import path from 'path';
import type { Tool } from '../types';
import logger from '../utils/logger';

const DEFAULT_MANIFESTS_DIR = path.join(process.cwd(), 'manifests');
const DEFAULT_CODES_DIR = path.join(process.cwd(), 'codes');

export interface LoadedTool {
  tool: Tool;
  codeFile: string;
}

export class ToolManifestLoader {
  private manifestsDir: string;
  private codesDir: string;
  private loadedTools = new Map<string, LoadedTool>();

  constructor(manifestsDir?: string, codesDir?: string) {
    this.manifestsDir = manifestsDir || process.env.TOOL_MANIFESTS_DIR || DEFAULT_MANIFESTS_DIR;
    this.codesDir = codesDir || process.env.TOOL_CODES_DIR || DEFAULT_CODES_DIR;
  }

  loadAll(): LoadedTool[] {
    const results: LoadedTool[] = [];

    try {
      if (!fs.existsSync(this.manifestsDir)) {
        logger.warn({ dir: this.manifestsDir }, 'Manifests directory does not exist, skipping tool manifest load');
        return results;
      }

      const files = fs.readdirSync(this.manifestsDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(this.manifestsDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);

          if (!parsed.id || !parsed.name || !parsed.type || !parsed.manifest) {
            logger.warn({ file }, 'Manifest missing required fields, skipping');
            continue;
          }

          const manifest = parsed.manifest as Record<string, unknown>;
          const codeFile = (manifest.codeFile as string) || `${parsed.id}.js`;
          const codePath = path.join(this.codesDir, codeFile);

          if (!fs.existsSync(codePath)) {
            logger.warn({ file, codePath }, 'Code file not found for manifest, skipping');
            continue;
          }

          const now = new Date();
          const tool: Tool = {
            id: parsed.id,
            name: parsed.name,
            description: parsed.description || '',
            type: parsed.type,
            manifest: {
              ...manifest,
              codeFile: codePath,
            },
            inputSchema: parsed.inputSchema,
            outputSchema: parsed.outputSchema,
            configSchema: parsed.configSchema,
            createdAt: now,
            updatedAt: now,
            isSkill: parsed.isSkill === true,
          };

          this.loadedTools.set(parsed.id, { tool, codeFile: codePath });
          results.push({ tool, codeFile: codePath });

          logger.info({ toolId: parsed.id, codeFile: codePath }, 'Tool manifest loaded');
        } catch (err) {
          logger.warn({ file, err: err instanceof Error ? err.message : String(err) }, 'Failed to load manifest file');
        }
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), dir: this.manifestsDir }, 'Failed to read manifests directory');
    }

    return results;
  }

  getLoadedTools(): LoadedTool[] {
    return Array.from(this.loadedTools.values());
  }

  getTool(id: string): LoadedTool | undefined {
    return this.loadedTools.get(id);
  }

  hasTool(id: string): boolean {
    return this.loadedTools.has(id);
  }
}
