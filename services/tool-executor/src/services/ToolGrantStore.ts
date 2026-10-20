/**
 * Persistence for granted tool permissions (§9).
 *
 * Granted-tool records live in instance persistence (never in an assistant's
 * folder-based blueprint). JSON-file-backed, atomic writes, corrupt-tolerant,
 * mirroring ToolStore.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import type {
  ToolPermissionGrant,
  ToolPermissionDenial,
  PermissionScope,
} from '../types/mcp-discovery';

const DEFAULT_DIR = '/tmp/stage7-tool-grants';
const GRANTS_FILE = 'grants.json';
const DENIALS_FILE = 'denials.json';

function serializeDate(value: Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function reviveDate(value: unknown): Date {
  return new Date(value as string);
}

function isGrant(value: unknown): value is ToolPermissionGrant & { grantedAt: string; expiresAt?: string; revokedAt?: string; lastUsedAt?: string } {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { id?: unknown; toolId?: unknown; grantedAt?: unknown };
  return typeof c.id === 'string' && typeof c.toolId === 'string' && typeof c.grantedAt === 'string';
}

function isDenial(value: unknown): value is ToolPermissionDenial & { deniedAt: string } {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { id?: unknown; toolId?: unknown; deniedAt?: unknown };
  return typeof c.id === 'string' && typeof c.toolId === 'string' && typeof c.deniedAt === 'string';
}

function reviveGrant(raw: ToolPermissionGrant & { grantedAt: string; expiresAt?: string; revokedAt?: string; lastUsedAt?: string }): ToolPermissionGrant {
  return {
    ...raw,
    grantedAt: reviveDate(raw.grantedAt),
    expiresAt: raw.expiresAt ? reviveDate(raw.expiresAt) : undefined,
    revokedAt: raw.revokedAt ? reviveDate(raw.revokedAt) : undefined,
    lastUsedAt: raw.lastUsedAt ? reviveDate(raw.lastUsedAt) : undefined,
  };
}

function reviveDenial(raw: ToolPermissionDenial & { deniedAt: string }): ToolPermissionDenial {
  return { ...raw, deniedAt: reviveDate(raw.deniedAt) };
}

class JSONStore<T extends { id: string }> {
  private readonly dir: string;
  private readonly file: string;
  private readonly isValid: (value: unknown) => boolean;
  private readonly revive: (raw: any) => T;

  constructor(dir: string, file: string, isValid: (value: unknown) => boolean, revive: (raw: any) => T) {
    this.dir = dir;
    this.file = path.join(dir, file);
    this.isValid = isValid;
    this.revive = revive;
  }

  loadAll(): T[] {
    let contents: string;
    try {
      if (!fs.existsSync(this.file)) return [];
      contents = fs.readFileSync(this.file, 'utf-8');
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Store unreadable, treating as empty');
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Store is corrupt, treating as empty');
      return [];
    }
    if (!Array.isArray(parsed)) {
      logger.warn({ file: this.file }, 'Store payload is not an array, treating as empty');
      return [];
    }
    return parsed.filter(this.isValid).map(this.revive);
  }

  save(item: T): void {
    const others = this.loadAll().filter((existing) => existing.id !== item.id);
    this.writeAll([...others, item]);
  }

  remove(id: string): boolean {
    const existing = this.loadAll();
    const remaining = existing.filter((item) => item.id !== id);
    if (remaining.length === existing.length) return false;
    this.writeAll(remaining);
    return true;
  }

  private writeAll(items: T[]): void {
    const payload = JSON.stringify(items.map((item) => ({ ...item })), null, 2);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmpFile = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmpFile, payload, 'utf-8');
      fs.renameSync(tmpFile, this.file);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), file: this.file }, 'Failed to persist store');
    }
  }
}

export class ToolGrantStore {
  private grants = new JSONStore<ToolPermissionGrant>(
    process.env.TOOL_GRANT_STORE_DIR || DEFAULT_DIR,
    GRANTS_FILE,
    isGrant,
    reviveGrant,
  );
  private denials = new JSONStore<ToolPermissionDenial>(
    process.env.TOOL_DENIAL_STORE_DIR || DEFAULT_DIR,
    DENIALS_FILE,
    isDenial,
    reviveDenial,
  );

  /** All grants, including revoked ones. */
  listGrants(): ToolPermissionGrant[] {
    return this.grants.loadAll();
  }

  /** Active (non-revoked, non-expired) grants. */
  activeGrants(): ToolPermissionGrant[] {
    const now = new Date();
    return this.listGrants().filter((g) => !g.revoked && (!g.expiresAt || g.expiresAt > now));
  }

  getGrant(grantId: string): ToolPermissionGrant | undefined {
    return this.listGrants().find((g) => g.id === grantId);
  }

  /** Active grant for a tool id, optionally within a scope. */
  findActiveGrant(toolId: string, scope?: string): ToolPermissionGrant | undefined {
    return this.activeGrants().find((g) => g.toolId === toolId && (scope === undefined || g.scope === scope));
  }

  /** Grants for a tool id (active or revoked). */
  grantsForTool(toolId: string): ToolPermissionGrant[] {
    return this.listGrants().filter((g) => g.toolId === toolId);
  }

  /** Grants within a scope, e.g. all agents and assistants. */
  grantsByScope(scope: PermissionScope): ToolPermissionGrant[] {
    return this.activeGrants().filter((g) => g.scope === scope);
  }

  saveGrant(grant: ToolPermissionGrant): void {
    this.grants.save(grant);
  }

  revokeGrant(grantId: string, revokedBy: string): boolean {
    const grant = this.getGrant(grantId);
    if (!grant || grant.revoked) return false;
    grant.revoked = true;
    grant.revokedAt = new Date();
    grant.revokedBy = revokedBy;
    this.grants.save(grant);
    return true;
  }

  recordUsage(grantId: string): void {
    const grant = this.getGrant(grantId);
    if (!grant) return;
    grant.lastUsedAt = new Date();
    grant.callCount = (grant.callCount || 0) + 1;
    this.grants.save(grant);
  }

  listDenials(): ToolPermissionDenial[] {
    return this.denials.loadAll();
  }

  /** Remembered denial for a tool + capability. */
  findDenial(toolId: string, neededCapability: string): ToolPermissionDenial | undefined {
    return this.listDenials().find(
      (d) => d.toolId === toolId && d.neededCapability === neededCapability,
    );
  }

  saveDenial(denial: ToolPermissionDenial): void {
    this.denials.save(denial);
  }
}

export const toolGrantStore = new ToolGrantStore();
