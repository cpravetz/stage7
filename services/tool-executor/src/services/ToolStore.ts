import fs from 'fs';
import path from 'path';
import { Tool } from '../types';
import logger from '../utils/logger';

const DEFAULT_STORE_DIR = '/tmp/stage7-tools';
const STORE_FILE_NAME = 'tools.json';

type PersistedTool = Omit<Tool, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function serializeTool(tool: Tool): PersistedTool {
  return {
    ...tool,
    createdAt: tool.createdAt instanceof Date ? tool.createdAt.toISOString() : new Date(tool.createdAt).toISOString(),
    updatedAt: tool.updatedAt instanceof Date ? tool.updatedAt.toISOString() : new Date(tool.updatedAt).toISOString(),
  };
}

function reviveTool(raw: PersistedTool): Tool {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

function isPersistedTool(value: unknown): value is PersistedTool {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown; createdAt?: unknown; updatedAt?: unknown };
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

/**
 * JSON-file-backed store for tools registered at RUNTIME (POST /tools,
 * POST /plugins/generate, ToolDiscovery). Built-in defaults are not persisted —
 * they are re-created from the hardcoded arrays on every boot.
 *
 * A corrupt or unreadable store file never throws: it is logged and treated as
 * empty so a bad file can never stop the service from booting.
 */
export class ToolStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(dir?: string) {
    this.dir = dir || process.env.TOOL_STORE_DIR || DEFAULT_STORE_DIR;
    this.file = path.join(this.dir, STORE_FILE_NAME);
  }

  getFilePath(): string {
    return this.file;
  }

  loadAll(): Tool[] {
    let contents: string;
    try {
      if (!fs.existsSync(this.file)) return [];
      contents = fs.readFileSync(this.file, 'utf-8');
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Tool store unreadable, treating as empty');
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Tool store is corrupt, treating as empty');
      return [];
    }

    if (!Array.isArray(parsed)) {
      logger.warn({ file: this.file }, 'Tool store payload is not an array, treating as empty');
      return [];
    }

    return parsed.filter(isPersistedTool).map(reviveTool);
  }

  save(tool: Tool): void {
    const others = this.loadAll().filter((existing) => existing.id !== tool.id);
    this.writeAll([...others, tool]);
  }

  remove(id: string): boolean {
    const existing = this.loadAll();
    const remaining = existing.filter((tool) => tool.id !== id);
    if (remaining.length === existing.length) return false;
    this.writeAll(remaining);
    return true;
  }

  private writeAll(tools: Tool[]): void {
    const payload = JSON.stringify(tools.map(serializeTool), null, 2);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      // Atomic write: a crash mid-write leaves the previous store intact
      // instead of a truncated/corrupt file.
      const tmpFile = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmpFile, payload, 'utf-8');
      fs.renameSync(tmpFile, this.file);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Failed to persist tool store');
    }
  }
}
