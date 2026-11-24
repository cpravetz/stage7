import fs from 'fs';
import path from 'path';
import type { Tool } from '../types';
import logger from '../utils/logger';

export interface LoadedTool {
  tool: Tool;
  codeFile: string;
}

export class ToolManifestLoader {
  private rootToolFolders: string[];
  private loadedTools = new Map<string, LoadedTool>();

  constructor(rootToolFolders?: string[]) {
    const defaultRoot = path.join(process.cwd(), 'tools');
    this.rootToolFolders = rootToolFolders || [defaultRoot];
  }

  /** Register an additional root tools folder (e.g. from an ADK assistant). */
  addRootFolder(folder: string): void {
    if (!this.rootToolFolders.includes(folder)) {
      this.rootToolFolders.push(folder);
    }
  }

  loadAll(): LoadedTool[] {
    const results: LoadedTool[] = [];

    for (const root of this.rootToolFolders) {
      try {
        results.push(...this.loadFromRoot(root));
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err), dir: root }, 'Failed to scan root tools folder');
      }
    }

    return results;
  }

  private loadFromRoot(root: string): LoadedTool[] {
    const results: LoadedTool[] = [];

    if (!fs.existsSync(root)) {
      logger.warn({ dir: root }, 'Root tools folder does not exist, skipping');
      return results;
    }

    const entries = fs.readdirSync(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const toolFolder = path.join(root, entry.name);
      try {
        const loaded = this.loadToolFolder(toolFolder);
        if (loaded) {
          results.push(loaded);
        }
      } catch (err) {
        logger.warn({ toolFolder, err: err instanceof Error ? err.message : String(err) }, 'Failed to load tool folder');
      }
    }

    return results;
  }

  private loadToolFolder(toolFolder: string): LoadedTool | undefined {
    const manifestPath = path.join(toolFolder, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      logger.warn({ toolFolder, missing: 'manifest.json' }, 'Tool folder missing manifest.json, skipping');
      return undefined;
    }

    let parsed: unknown;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn({ toolFolder, file: 'manifest.json', err: err instanceof Error ? err.message : String(err) }, 'Failed to parse manifest.json');
      return undefined;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.warn({ toolFolder }, 'Manifest is not a JSON object, skipping');
      return undefined;
    }

    const raw = parsed as Record<string, unknown>;
    const id = raw.id;
    const name = raw.name;
    const type = raw.type;
    const manifest = raw.manifest;

    if (!id || !name || !type || !manifest) {
      logger.warn({ toolFolder }, 'Manifest missing required fields (id, name, type, manifest), skipping');
      return undefined;
    }

    const manifestRecord = manifest as Record<string, unknown>;
    const codeFileName = (manifestRecord.codeFile as string) || `${id as string}.js`;
    const codePath = path.join(toolFolder, codeFileName);

    if (!fs.existsSync(codePath)) {
      logger.warn({ toolFolder, codePath }, 'Code file not found for manifest, skipping');
      return undefined;
    }

    const now = new Date();
    const tool: Tool = {
      id: id as string,
      name: name as string,
      description: (raw.description as string) || '',
      type: type as Tool['type'],
      manifest: {
        ...manifestRecord,
        codeFile: codePath,
      },
      inputSchema: raw.inputSchema as Record<string, unknown> | undefined,
      outputSchema: raw.outputSchema as Record<string, unknown> | undefined,
      configSchema: raw.configSchema as Record<string, unknown> | undefined,
      createdAt: now,
      updatedAt: now,
      isSkill: raw.isSkill === true,
    };

    this.loadedTools.set(tool.id, { tool, codeFile: codePath });

    return { tool, codeFile: codePath };
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
