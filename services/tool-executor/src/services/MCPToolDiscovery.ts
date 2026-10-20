/**
 * MCP tool discovery for the Tool Executive (§3.2).
 *
 * Queries the approved MCP library sources, collects candidates, and vets and
 * classifies each one: trust tier, side-effect class, data-classification
 * requirement, and credential requirement. Candidates that fail policy are
 * dropped silently.
 *
 * Side-effect class comes from verification, not MCP annotations (§4.3).
 * MCP annotations such as read-only or destructive are unverified hints; the
 * default for an unverified tool is the highest-risk class (external_action).
 */

import { logger } from '@stage7-nextgen/shared';
import { MCPClient, MCPHTTPClient, MCPServerConfig } from './MCPClient';
import { mcpLibrarySourceRegistry } from './MCPLibrarySourceRegistry';
import type {
  MCPLibrarySource,
  MCPToolCandidate,
  SideEffectClass,
  DataClass,
  CredentialRequirement,
  MCPTrustTier,
} from '../types/mcp-discovery';
import { isMCPTrustTier, isSideEffectClass } from '../types/mcp-discovery';
import { toolAuditLog } from './ToolAuditLog';

const DEFAULT_MAX_CANDIDATES_PER_SOURCE = 10;

/**
 * Parameter names that suggest a credential field. The Secrets Service wires
 * these; they are disclosed in the permission request but never placed in
 * prompts, logs, or tool arguments visible to the LLM (§6.3).
 */
const CREDENTIAL_PARAM_NAMES = new Set([
  'apiKey', 'api_key', 'apikey',
  'accessToken', 'access_token',
  'token', 'bearerToken', 'bearer_token',
  'password', 'passwd',
  'secret', 'clientSecret', 'client_secret',
  'apiSecret', 'api_secret',
  'privateKey', 'private_key',
]);

/**
 * Parameter names that suggest data classes being sent to the tool. These are
 * conservative defaults; org policy defines the authoritative data class set
 * (open question #7).
 */
const DATA_CLASS_PARAM_HINTS: Record<string, DataClass> = {
  patient: 'health',
  patientId: 'health',
  health: 'health',
  medical: 'health',
  campaign: 'marketing',
  campaignId: 'marketing',
  lead: 'marketing',
  leadId: 'marketing',
  ticket: 'support',
  ticketId: 'support',
  case: 'support',
  caseId: 'support',
  matter: 'legal',
  matterId: 'legal',
  account: 'finance',
  accountId: 'finance',
  invoice: 'finance',
  payment: 'finance',
  email: 'contact',
  emailAddress: 'contact',
  phone: 'contact',
  address: 'contact',
  name: 'identity',
  fullName: 'identity',
  username: 'identity',
  userId: 'identity',
};

/**
 * Derives a verified side-effect class from an MCP tool. MCP annotations
 * (readOnlyHint, destructiveHint, idempotentHint) are unverified and are NOT
 * used as the source of truth (§4.3). The default for an unverified tool is
 * external_action, the highest-risk class. A tool is only read_only or
 * writes_data when org policy / static review / test harness / publisher
 * attestation has verified it, which Phase 1 represents via curated sources.
 */
function verifySideEffectClass(
  mcpAnnotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean } | undefined,
  tier: MCPTrustTier,
  source: MCPLibrarySource,
): SideEffectClass {
  // Unverified MCP hints are never the basis for the class.
  if (tier === 'curated') {
    // Curated / first-party tools are assumed to have been reviewed.
    if (mcpAnnotations?.destructiveHint === true) return 'external_action';
    if (mcpAnnotations?.readOnlyHint === true) {
      return 'read_only';
    }
    return 'writes_data';
  }
  // Vetted third party: unverified hints default to the highest-risk class.
  if (tier === 'vetted_third_party') return 'external_action';
  // Unvetted: never offered automatically.
  return 'external_action';
}

/**
 * Derives the data classes a tool would receive from its input schema
 * parameter names. Conservative heuristic; org policy is authoritative.
 */
function deriveDataClasses(inputSchema: Record<string, unknown>): DataClass[] {
  const classes = new Set<DataClass>();
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== 'object') return [];
  for (const key of Object.keys(properties)) {
    const hint = DATA_CLASS_PARAM_HINTS[key];
    if (hint) classes.add(hint);
  }
  // Credential fields carry no data class of the task's own data.
  return classes.size > 0 ? [...classes] : ['task_input'];
}

/**
 * Derives the credential requirement from the input schema. Credential fields
 * are resolved through the Secrets Service at call time (§6.3).
 */
function deriveCredentialRequirement(
  inputSchema: Record<string, unknown>,
  tier: MCPTrustTier,
): CredentialRequirement {
  const properties = inputSchema?.properties;
  const keys: string[] = [];
  if (properties && typeof properties === 'object') {
    for (const key of Object.keys(properties)) {
      if (CREDENTIAL_PARAM_NAMES.has(key)) keys.push(key);
    }
  }
  const needed = keys.length > 0;
  let source: string | undefined;
  if (needed) {
    source = tier === 'curated' ? 'Stage7 Secrets Service' : 'Stage7 Secrets Service (user-supplied)';
  }
  return { needed, source, keys };
}

/**
 * Computes the definition hash pinned at consent: a hash of name, description,
 * and schema (§6.2). Any later change suspends the tool and re-prompts.
 */
function definitionHash(name: string, description: string, inputSchema: Record<string, unknown>): string {
  const payload = `${name}\n${description ?? ''}\n${JSON.stringify(inputSchema ?? {})}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `def_${Math.abs(hash).toString(16)}`;
}

export interface DiscoveryOptions {
  /** Limit candidates per source. */
  maxCandidatesPerSource?: number;
  /** The capability needed and the task that triggered discovery. */
  neededCapability: string;
  triggeringTask?: string;
  /** Actor issuing the discovery (user / assistant / system). */
  actor?: string;
}

export class MCPToolDiscovery {
  private clients = new Map<string, MCPClient | MCPHTTPClient>();
  private maxCandidatesPerSource: number;

  constructor(maxCandidatesPerSource = DEFAULT_MAX_CANDIDATES_PER_SOURCE) {
    this.maxCandidatesPerSource = maxCandidatesPerSource;
  }

  private getClient(source: MCPLibrarySource): MCPClient | MCPHTTPClient | undefined {
    let client = this.clients.get(source.id);
    if (client) return client;
    const config: MCPServerConfig = {
      id: source.id,
      name: source.name,
      ...source.config,
    };
    if (source.transport === 'remote' && source.config.url) {
      client = new MCPHTTPClient(config);
    } else if (source.config.command) {
      client = new MCPClient(config);
    } else {
      return undefined;
    }
    this.clients.set(source.id, client);
    return client;
  }

  /**
   * Discover candidates across all enabled MCP library sources, vet and
   * classify them, and return the ranked list within trust tiers.
   */
  async discover(options: DiscoveryOptions): Promise<{ candidates: MCPToolCandidate[]; errors: string[] }> {
    const candidates: MCPToolCandidate[] = [];
    const errors: string[] = [];
    const sources = mcpLibrarySourceRegistry.enabledSources();

    toolAuditLog.record({
      type: 'mcp.discovery',
      message: `MCP discovery started across ${sources.length} approved source(s) for capability "${options.neededCapability}"`,
      actor: options.actor,
      metadata: { neededCapability: options.neededCapability, sourceCount: sources.length },
    });

    for (const source of sources) {
      try {
        const client = this.getClient(source);
        if (!client) {
          errors.push(`${source.id}: no usable transport configured`);
          continue;
        }
        const mcpTools = await client.listTools();
        toolAuditLog.record({
          type: 'mcp.discovery',
          message: `Discovered ${mcpTools.length} tool(s) from MCP source "${source.name}"`,
          sourceId: source.id,
          actor: options.actor,
          metadata: { sourceId: source.id, sourceName: source.name, toolCount: mcpTools.length },
        });

        let accepted = 0;
        for (const mcpTool of mcpTools) {
          const candidate = this.vetAndClassify(mcpTool, source, options);
          if (!candidate) {
            toolAuditLog.record({
              type: 'mcp.candidate_dropped',
              message: `Dropped MCP candidate "${mcpTool.name}" from "${source.name}": failed policy`,
              sourceId: source.id,
              toolName: mcpTool.name,
              actor: options.actor,
              metadata: { sourceId: source.id, toolName: mcpTool.name },
            });
            continue;
          }
          candidates.push(candidate);
          accepted++;

          toolAuditLog.record({
            type: 'mcp.candidate_vetted',
            message: `Vetted MCP candidate "${mcpTool.name}" as tier ${candidate.tier}, side-effect ${candidate.sideEffectClass}`,
            sourceId: source.id,
            toolName: mcpTool.name,
            actor: options.actor,
            metadata: {
              sourceId: source.id,
              toolName: mcpTool.name,
              tier: candidate.tier,
              sideEffectClass: candidate.sideEffectClass,
              dataClasses: candidate.dataClasses,
              credentials: candidate.credentials,
              definitionHash: candidate.definitionHash,
            },
          });

          if (accepted >= this.maxCandidatesPerSource) break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${source.id}: ${message}`);
        toolAuditLog.record({
          type: 'mcp.discovery',
          message: `MCP discovery failed for source "${source.name}": ${message}`,
          sourceId: source.id,
          actor: options.actor,
          metadata: { sourceId: source.id, error: message },
        });
      }
    }

    // Rank within trust tiers: curated first, then vetted third party. Unvetted
    // candidates are never auto-offered (§5).
    candidates.sort((a, b) => {
      const tierOrder = { curated: 0, vetted_third_party: 1, unvetted: 2 };
      return tierOrder[a.tier] - tierOrder[b.tier];
    });

    toolAuditLog.record({
      type: 'mcp.discovery',
      message: `MCP discovery complete: ${candidates.length} candidate(s) accepted, ${errors.length} error(s)`,
      actor: options.actor,
      metadata: { accepted: candidates.length, errors: errors.length },
    });

    return { candidates, errors };
  }

  private vetAndClassify(
    mcpTool: { name: string; description: string; inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown>; annotations?: Record<string, unknown> },
    source: MCPLibrarySource,
    options: DiscoveryOptions,
  ): MCPToolCandidate | undefined {
    const name = mcpTool.name;
    const description = mcpTool.description ?? `MCP tool: ${name}`;
    const inputSchema = mcpTool.inputSchema ?? { type: 'object', properties: {} };
    const annotations = mcpTool.annotations as
      | { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
      | undefined;

    const tier = source.tier;
    if (!isMCPTrustTier(tier)) return undefined;

    // Unvetted tools are never offered automatically (§5).
    if (tier === 'unvetted') return undefined;

    // Candidates that fail policy are dropped silently.
    if (!name || typeof name !== 'string') return undefined;

    const sideEffectClass = verifySideEffectClass(annotations, tier, source);
    if (!isSideEffectClass(sideEffectClass)) return undefined;

    const dataClasses = deriveDataClasses(inputSchema);
    const credentials = deriveCredentialRequirement(inputSchema, tier);
    const hash = definitionHash(name, description, inputSchema);
    const preApproved = tier === 'curated';

    return {
      id: `mcp_${source.id}_${name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`,
      name,
      description,
      sourceId: source.id,
      sourceName: source.name,
      transport: source.transport,
      tier,
      sideEffectClass,
      dataClasses,
      credentials,
      inputSchema,
      outputSchema: mcpTool.outputSchema as Record<string, unknown> | undefined,
      definitionHash: hash,
      publisher: source.tier === 'curated' ? 'Stage7' : undefined,
      preApproved,
      neededCapability: options.neededCapability,
      triggeringTask: options.triggeringTask,
    };
  }

  /** Close all open MCP client connections. */
  async disconnect(): Promise<void> {
    for (const [sourceId, client] of this.clients.entries()) {
      if (client instanceof MCPClient) {
        await client.disconnect().catch(() => {});
      }
      this.clients.delete(sourceId);
    }
  }
}

export const mcpToolDiscovery = new MCPToolDiscovery();
