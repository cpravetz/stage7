/**
 * Audit log for MCP tool discovery and permissions (§9).
 *
 * Every discovery, permission request, decision, integration, call, and
 * failure is audited, including which data classes were sent. Best-effort:
 * a log outage never fails the operation being audited.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import type {
  ToolAuditEntry,
  AuditEventType,
  PermissionScope,
  DataClass,
  SideEffectClass,
  MCPTrustTier,
} from '../types/mcp-discovery';

const DEFAULT_DIR = '/tmp/stage7-tool-audit';
const LOG_FILE = 'audit.jsonl';
const MAX_LOCAL_ENTRIES_SCANNED = 1000;

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 128) || 'audit';
}

function isAuditEntry(value: unknown): value is ToolAuditEntry & { createdAt: string } {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { id?: unknown; type?: unknown; createdAt?: unknown };
  return typeof c.id === 'string' && typeof c.type === 'string' && typeof c.createdAt === 'string';
}

function reviveEntry(raw: ToolAuditEntry & { createdAt: string }): ToolAuditEntry {
  return { ...raw, createdAt: new Date(raw.createdAt) };
}

export class ToolAuditLog {
  private readonly dir: string;
  private readonly file: string;
  private readonly memory: ToolAuditEntry[] = [];
  private readonly useMemory: boolean;

  constructor(dir?: string) {
    this.dir = dir || process.env.TOOL_AUDIT_LOG_DIR || DEFAULT_DIR;
    this.file = path.join(this.dir, LOG_FILE);
    // When no directory is writable (e.g. tests), degrade to in-memory only.
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.useMemory = false;
    } catch {
      this.useMemory = true;
      logger.warn({ dir: this.dir }, 'Audit log directory not writable, using in-memory log');
    }
  }

  private appendLocal(entry: ToolAuditEntry): void {
    if (this.useMemory) {
      this.memory.push(entry);
      return;
    }
    try {
      const line = `${JSON.stringify(entry)}\n`;
      fs.appendFileSync(this.file, line, 'utf-8');
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Audit log write failed');
    }
  }

  private readAll(): ToolAuditEntry[] {
    if (this.useMemory) return [...this.memory];
    let contents: string;
    try {
      if (!fs.existsSync(this.file)) return [];
      contents = fs.readFileSync(this.file, 'utf-8');
    } catch {
      return [];
    }
    const entries: ToolAuditEntry[] = [];
    for (const line of contents.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (isAuditEntry(parsed)) entries.push(reviveEntry(parsed));
      } catch {
        // Truncated line from an interrupted write; skip.
      }
    }
    return entries;
  }

  /** Record an audit event. Never throws. */
  record(params: {
    type: AuditEventType;
    message: string;
    toolId?: string;
    toolName?: string;
    sourceId?: string;
    actor?: string;
    scope?: PermissionScope;
    dataClasses?: DataClass[];
    sideEffectClass?: SideEffectClass;
    tier?: MCPTrustTier;
    definitionHash?: string;
    metadata?: Record<string, unknown>;
  }): ToolAuditEntry {
    const entry: ToolAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: params.type,
      toolId: params.toolId,
      toolName: params.toolName,
      sourceId: params.sourceId,
      actor: params.actor,
      scope: params.scope,
      dataClasses: params.dataClasses,
      sideEffectClass: params.sideEffectClass,
      tier: params.tier,
      definitionHash: params.definitionHash,
      message: params.message,
      metadata: params.metadata,
      createdAt: new Date(),
    };
    this.appendLocal(entry);
    return entry;
  }

  /** Recent audit entries, newest first. */
  recent(limit = 50): ToolAuditEntry[] {
    return this.readAll()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, Math.max(limit, 1));
  }

  /** Audit entries for a given tool. */
  byTool(toolId: string, limit = 50): ToolAuditEntry[] {
    return this.readAll()
      .filter((entry) => entry.toolId === toolId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  /** Audit entries of a given type. */
  byType(type: AuditEventType, limit = 50): ToolAuditEntry[] {
    return this.readAll()
      .filter((entry) => entry.type === type)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  /** All entries (bounded scan). */
  all(limit = MAX_LOCAL_ENTRIES_SCANNED): ToolAuditEntry[] {
    return this.readAll().slice(0, limit);
  }

  /** In-memory entries (tests). */
  get entries(): ToolAuditEntry[] {
    return [...this.memory];
  }
}

export const toolAuditLog = new ToolAuditLog();
