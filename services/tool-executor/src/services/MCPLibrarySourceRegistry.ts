/**
 * Registry of approved MCP library sources (§3.2, §5).
 *
 * Organization policy sets which MCP library sources are searched. Phase 1
 * uses curated and org-approved sources only. Sources are loaded from the
 * MCP_DISCOVERY_SOURCES env var (JSON array) and merged with defaults.
 */

import { MCPLibrarySource, MCPTrustTier, isMCPTrustTier } from '../types/mcp-discovery';
import logger from '../utils/logger';

const DEFAULT_SOURCES: MCPLibrarySource[] = [
  {
    id: 'stage7-curated',
    name: 'Stage7 Curated MCP Library',
    transport: 'local',
    config: { command: 'stage7-mcp-curated', args: [] },
    tier: 'curated',
    enabled: true,
  },
];

function parseSourcesEnv(): MCPLibrarySource[] {
  const raw = process.env.MCP_DISCOVERY_SOURCES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        id: String(entry.id ?? ''),
        name: String(entry.name ?? entry.id ?? ''),
        transport: (entry.transport === 'remote' ? 'remote' : 'local') as 'remote' | 'local',
        config: {
          url: entry.url ? String(entry.url) : undefined,
          command: entry.command ? String(entry.command) : undefined,
          args: Array.isArray(entry.args) ? entry.args.map(String) : undefined,
          env: entry.env && typeof entry.env === 'object' ? (entry.env as Record<string, string>) : undefined,
        },
        tier: isMCPTrustTier(entry.tier) ? (entry.tier as MCPTrustTier) : 'vetted_third_party',
        enabled: entry.enabled !== false,
      }))
      .filter((source) => Boolean(source.id) && Boolean(source.name));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to parse MCP_DISCOVERY_SOURCES, using defaults');
    return [];
  }
}

export class MCPLibrarySourceRegistry {
  private sources: Map<string, MCPLibrarySource> = new Map();

  constructor() {
    const envSources = parseSourcesEnv();
    for (const source of [...DEFAULT_SOURCES, ...envSources]) {
      this.sources.set(source.id, source);
    }
    logger.info({ sourceCount: this.sources.size }, 'MCP library source registry initialized');
  }

  /** All enabled sources, in registration order. */
  enabledSources(): MCPLibrarySource[] {
    return [...this.sources.values()].filter((source) => source.enabled);
  }

  /** All sources (enabled or not). */
  allSources(): MCPLibrarySource[] {
    return [...this.sources.values()];
  }

  get(sourceId: string): MCPLibrarySource | undefined {
    return this.sources.get(sourceId);
  }

  /** Sources for a given trust tier. */
  sourcesForTier(tier: MCPTrustTier): MCPLibrarySource[] {
    return this.enabledSources().filter((source) => source.tier === tier);
  }

  register(source: MCPLibrarySource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`MCP library source '${source.id}' is already registered`);
    }
    this.sources.set(source.id, source);
  }

  unregister(sourceId: string): boolean {
    return this.sources.delete(sourceId);
  }

  isEnabled(sourceId: string): boolean {
    const source = this.sources.get(sourceId);
    return Boolean(source?.enabled);
  }
}

export const mcpLibrarySourceRegistry = new MCPLibrarySourceRegistry();
