/**
 * Tool permission service (§4).
 *
 * Generates stage7-written permission requests, handles grant/deny decisions
 * with scopes, remembers denials, and applies org policy pre-approval so the
 * user is not prompted for pre-approved curated tools.
 *
 * Granting a tool means the agent may use it; it does not waive approval of
 * high-impact actions (§4.4).
 */

import { logger } from '@stage7-nextgen/shared';
import { randomUUID } from 'crypto';
import { toolGrantStore } from './ToolGrantStore';
import { toolAuditLog } from './ToolAuditLog';
import { mcpLibrarySourceRegistry } from './MCPLibrarySourceRegistry';
import type {
  PermissionRequest,
  PermissionDecision,
  PermissionScope,
  ToolPermissionGrant,
  ToolPermissionDenial,
  MCPToolCandidate,
  SideEffectClass,
  MCPTrustTier,
} from '../types/mcp-discovery';

const DEFAULT_REQUEST_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Pending permission requests awaiting a user decision. Keyed by request id.
 */
const pendingRequests = new Map<string, PermissionRequest>();

/**
 * Plain-language description of a side-effect class for the permission prompt
 * (§4.1 "What it can do").
 */
function sideEffectClassLabel(cls: SideEffectClass): string {
  switch (cls) {
    case 'read_only':
      return 'Read-only: it reads data and returns results without changing anything.';
    case 'writes_data':
      return 'Writes data: it creates or updates records in a system.';
    case 'external_action':
      return 'External action: it sends or dispatches something to an external system.';
  }
}

/**
 * Plain-language description of where the tool runs (§4.1 "The tool").
 */
function whereItRunsLabel(transport: 'remote' | 'local'): string {
  return transport === 'remote'
    ? 'Hosted remotely; stage7 calls it over the network.'
    : 'Run locally by stage7 in a sandbox with restricted filesystem access and an egress allowlist.';
}

/**
 * Trust tier label for the prompt (§4.1 "Trust tier").
 */
function trustTierLabel(tier: MCPTrustTier): string {
  switch (tier) {
    case 'curated':
      return 'Curated — first-party or organization-vetted.';
    case 'vetted_third_party':
      return 'Vetted third party — a known publisher that passed vetting checks.';
    case 'unvetted':
      return 'Unvetted — not automatically offered.';
  }
}

/**
 * Plain-language credential disclosure for the prompt (§4.1 "Credentials or cost").
 */
function credentialsLabel(credentials: { needed: boolean; source?: string; keys: string[] }): string {
  if (!credentials.needed) return 'No credentials or subscription required.';
  const keys = credentials.keys.length > 0 ? credentials.keys.join(', ') : 'credential(s)';
  return `Needs credentials: ${keys}. These are held in the Stage7 Secrets Service and released to the call only for its duration; they are never placed in prompts, logs, or tool arguments visible to the model.${credentials.source ? ` Source: ${credentials.source}.` : ''}`;
}

/**
 * Build the stage7-written permission request for a candidate (§4.1).
 * Tool-supplied descriptions are never displayed as the explanation of what
 * the tool does; they are labeled as the publisher's claim when shown.
 */
export function buildPermissionRequest(
  candidate: MCPToolCandidate,
  opts: { defaultScope?: PermissionScope; availableScopes?: PermissionScope[]; ttlMs?: number; actor?: string },
): PermissionRequest {
  const defaultScope = opts.defaultScope ?? defaultScopeFor(candidate);
  const availableScopes = opts.availableScopes ?? [defaultScope, 'assistant', 'all_agents'];
  const id = `perm_${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_REQUEST_TTL_MS));

  const request: PermissionRequest = {
    id,
    neededCapability: candidate.neededCapability,
    triggeringTask: candidate.triggeringTask,
    candidate,
    sideEffectClass: candidate.sideEffectClass,
    dataClasses: candidate.dataClasses,
    credentials: candidate.credentials,
    defaultScope,
    availableScopes: availableScopes.filter((s) => ['task', 'assistant', 'all_agents'].includes(s)),
    preApproved: candidate.preApproved,
    createdAt: now,
    expiresAt,
  };

  pendingRequests.set(id, request);

  toolAuditLog.record({
    type: 'permission.requested',
    message: `Permission requested for tool "${candidate.name}" (${candidate.sourceName}) — capability: ${candidate.neededCapability}`,
    toolId: candidate.id,
    toolName: candidate.name,
    sourceId: candidate.sourceId,
    actor: opts.actor,
    scope: defaultScope,
    dataClasses: candidate.dataClasses,
    sideEffectClass: candidate.sideEffectClass,
    tier: candidate.tier,
    definitionHash: candidate.definitionHash,
    metadata: { requestId: id, preApproved: candidate.preApproved, defaultScope },
  });

  logger.info({ requestId: id, toolId: candidate.id, tier: candidate.tier }, 'Permission request issued');

  return request;
}

/**
 * Narrowest scope that completes the task (§4.2 default).
 */
export function defaultScopeFor(candidate: MCPToolCandidate): PermissionScope {
  switch (candidate.tier) {
    case 'curated':
      return candidate.sideEffectClass === 'external_action' ? 'task' : 'assistant';
    case 'vetted_third_party':
      return candidate.sideEffectClass === 'read_only' ? 'assistant' : 'task';
    case 'unvetted':
      return 'task';
  }
}

/**
 * Get a pending permission request by id, or undefined if it has expired or
 * been decided.
 */
export function getPermissionRequest(requestId: string): PermissionRequest | undefined {
  const request = pendingRequests.get(requestId);
  if (!request) return undefined;
  const now = new Date();
  if (request.expiresAt && now > request.expiresAt) {
    pendingRequests.delete(requestId);
    return undefined;
  }
  return request;
}

/**
 * Decide a permission request: grant or deny (§5).
 *
 * Grant scope is validated against the available scopes offered. The default
 * is the narrowest scope that completes the task; broader scopes are an
 * explicit choice.
 */
export function decidePermission(
  requestId: string,
  decision: PermissionDecision,
  opts: {
    scope?: PermissionScope;
    decidedBy: string;
    expiryDays?: number;
  },
): { decision: PermissionDecision; grant?: ToolPermissionGrant; denial?: ToolPermissionDenial; reason?: string } {
  const request = getPermissionRequest(requestId);
  if (!request) {
    return { decision: 'denied', reason: 'Permission request not found or expired' };
  }

  const { candidate } = request;
  const scope = opts.scope ?? request.defaultScope;
  if (!request.availableScopes.includes(scope)) {
    return {
      decision: 'denied',
      reason: `Requested scope '${scope}' is not available for this tool. Available: ${request.availableScopes.join(', ')}`,
    };
  }

  if (decision === 'denied') {
    const denial: ToolPermissionDenial = {
      id: `denial_${randomUUID()}`,
      toolId: candidate.id,
      toolName: candidate.name,
      sourceId: candidate.sourceId,
      neededCapability: candidate.neededCapability,
      deniedBy: opts.decidedBy,
      deniedAt: new Date(),
      scopeRequested: scope,
    };
    toolGrantStore.saveDenial(denial);

    toolAuditLog.record({
      type: 'permission.denied',
      message: `Permission denied for tool "${candidate.name}" — capability: ${candidate.neededCapability}`,
      toolId: candidate.id,
      toolName: candidate.name,
      sourceId: candidate.sourceId,
      actor: opts.decidedBy,
      scope,
      dataClasses: candidate.dataClasses,
      sideEffectClass: candidate.sideEffectClass,
      tier: candidate.tier,
      definitionHash: candidate.definitionHash,
      metadata: { denialId: denial.id, scopeRequested: scope },
    });

    pendingRequests.delete(requestId);
    logger.info({ requestId, toolId: candidate.id, decidedBy: opts.decidedBy }, 'Permission denied');

    return { decision: 'denied', denial };
  }

  // Granted.
  const tierPolicy = mcpLibrarySourceRegistry.allSources().find((s) => s.id === candidate.sourceId);
  const defaultExpiryDays = tierPolicy?.tier === 'curated' ? undefined : 90; // broad scopes expire by default (§9)
  const expiresAt = opts.expiryDays !== undefined ? new Date(Date.now() + opts.expiryDays * 24 * 60 * 60 * 1000)
    : defaultExpiryDays !== undefined ? new Date(Date.now() + defaultExpiryDays * 24 * 60 * 60 * 1000)
    : undefined;

  const grant: ToolPermissionGrant = {
    id: `grant_${randomUUID()}`,
    toolId: candidate.id,
    toolName: candidate.name,
    sourceId: candidate.sourceId,
    tier: candidate.tier,
    sideEffectClass: candidate.sideEffectClass,
    dataClasses: candidate.dataClasses,
    credentials: candidate.credentials,
    scope,
    grantedBy: opts.decidedBy,
    grantedAt: new Date(),
    expiresAt,
    definitionHash: candidate.definitionHash,
    publisher: candidate.publisher,
    revoked: false,
    callCount: 0,
  };
  toolGrantStore.saveGrant(grant);

  toolAuditLog.record({
    type: 'permission.granted',
    message: `Permission granted for tool "${candidate.name}" (scope: ${scope}) — capability: ${candidate.neededCapability}`,
    toolId: candidate.id,
    toolName: candidate.name,
    sourceId: candidate.sourceId,
    actor: opts.decidedBy,
    scope,
    dataClasses: candidate.dataClasses,
    sideEffectClass: candidate.sideEffectClass,
    tier: candidate.tier,
    definitionHash: candidate.definitionHash,
    metadata: { grantId: grant.id, expiresAt: grant.expiresAt?.toISOString(), preApproved: candidate.preApproved },
  });

  pendingRequests.delete(requestId);
  logger.info({ requestId, grantId: grant.id, toolId: candidate.id, scope }, 'Permission granted');

  return { decision: 'granted', grant };
}

/**
 * Pre-approve a curated tool without a user prompt (§4.3 "No consent fatigue").
 * Returns the grant that was applied, or undefined if the tier is not
 * user-approvable / pre-approved.
 */
export function preApprove(
  candidate: MCPToolCandidate,
  opts: { decidedBy: string; scope?: PermissionScope; expiryDays?: number },
): ToolPermissionGrant | undefined {
  if (!candidate.preApproved) return undefined;

  const source = mcpLibrarySourceRegistry.get(candidate.sourceId);
  // Only curated tiers are pre-approved by default (§4.3, §5).
  if (!source || source.tier !== 'curated') return undefined;

  const scope = opts.scope ?? defaultScopeFor(candidate);
  const defaultExpiryDays = 90; // curated broad grants expire by default (§9)
  const expiresAt = opts.expiryDays !== undefined
    ? new Date(Date.now() + opts.expiryDays * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + defaultExpiryDays * 24 * 60 * 60 * 1000);

  const grant: ToolPermissionGrant = {
    id: `grant_${randomUUID()}`,
    toolId: candidate.id,
    toolName: candidate.name,
    sourceId: candidate.sourceId,
    tier: candidate.tier,
    sideEffectClass: candidate.sideEffectClass,
    dataClasses: candidate.dataClasses,
    credentials: candidate.credentials,
    scope,
    grantedBy: opts.decidedBy,
    grantedAt: new Date(),
    expiresAt,
    definitionHash: candidate.definitionHash,
    publisher: candidate.publisher,
    revoked: false,
    callCount: 0,
  };
  toolGrantStore.saveGrant(grant);

  toolAuditLog.record({
    type: 'permission.pre_approved',
    message: `Curated tool "${candidate.name}" pre-approved (scope: ${scope}) — capability: ${candidate.neededCapability}`,
    toolId: candidate.id,
    toolName: candidate.name,
    sourceId: candidate.sourceId,
    actor: opts.decidedBy,
    scope,
    dataClasses: candidate.dataClasses,
    sideEffectClass: candidate.sideEffectClass,
    tier: candidate.tier,
    definitionHash: candidate.definitionHash,
    metadata: { grantId: grant.id, expiresAt: grant.expiresAt?.toISOString() },
  });

  logger.info({ grantId: grant.id, toolId: candidate.id, scope }, 'Curated tool pre-approved');

  return grant;
}

/**
 * Check whether a remembered denial exists for a tool + capability (§5 denial
 * path). A denial is remembered so the same tool is not asked again for the
 * same need.
 */
export function findDenial(toolId: string, neededCapability: string): ToolPermissionDenial | undefined {
  return toolGrantStore.findDenial(toolId, neededCapability);
}

/**
 * List all active grants (visibility: a single list of granted tools per user
 * and per assistant, showing scope, tier, and recent use §9).
 */
export function listActiveGrants(): ToolPermissionGrant[] {
  return toolGrantStore.activeGrants();
}

/**
 * All grants including revoked, for revocation UI.
 */
export function listAllGrants(): ToolPermissionGrant[] {
  return toolGrantStore.listGrants();
}

/**
 * Revoke a grant (§9). Revocation removes the tool from the registry
 * immediately (handled by the integrator/executive) and releases its
 * credentials.
 */
export function revokeGrant(grantId: string, revokedBy: string): boolean {
  const grant = toolGrantStore.getGrant(grantId);
  if (!grant) return false;
  const revoked = toolGrantStore.revokeGrant(grantId, revokedBy);
  if (revoked) {
    toolAuditLog.record({
      type: 'tool.revoked',
      message: `Grant revoked for tool "${grant.toolName}" (${grant.scope})`,
      toolId: grant.toolId,
      toolName: grant.toolName,
      sourceId: grant.sourceId,
      actor: revokedBy,
      scope: grant.scope,
      sideEffectClass: grant.sideEffectClass,
      tier: grant.tier,
      definitionHash: grant.definitionHash,
      metadata: { revokedBy },
    });
    logger.info({ grantId, toolId: grant.toolId, revokedBy }, 'Grant revoked');
  }
  return revoked;
}

/**
 * Render the human-readable permission prompt text from a request (§4.1).
 * This is the control that carries the most weight; it is written by stage7.
 */
export function renderPermissionPrompt(request: PermissionRequest): string {
  const { candidate } = request;
  const lines: string[] = [];
  lines.push(`Stage7 Tool Permission Request`);
  lines.push(`==============================`);
  lines.push(``);
  lines.push(`Capability needed: ${request.neededCapability}`);
  if (request.triggeringTask) lines.push(`Triggering task: ${request.triggeringTask}`);
  lines.push(``);
  lines.push(`Tool: ${candidate.name}`);
  lines.push(`Publisher / operator: ${candidate.publisher ?? 'MCP library publisher (claim)'}`);
  lines.push(`Where it runs: ${whereItRunsLabel(candidate.transport)}`);
  lines.push(`Trust tier: ${trustTierLabel(candidate.tier)}`);
  lines.push(``);
  lines.push(`What it can do: ${sideEffectClassLabel(request.sideEffectClass)}`);
  lines.push(``);
  lines.push(`What data it will receive: ${request.dataClasses.length > 0 ? request.dataClasses.join(', ') : 'no task-specific data'}`);
  lines.push(``);
  lines.push(`Credentials or cost: ${credentialsLabel(request.credentials)}`);
  lines.push(``);
  lines.push(`Publisher's claim (unverified tool text, not the stage7 explanation): "${candidate.description}"`);
  lines.push(``);
  lines.push(`Scope options:`);
  for (const scope of request.availableScopes) {
    const marker = scope === request.defaultScope ? ' (default)' : '';
    lines.push(`  - ${scope}${marker}`);
  }
  lines.push(``);
  lines.push(`Granting this tool means the agent may use it. It does not waive separate`);
  lines.push(`approval for high-impact actions, which still go through the action gate.`);
  lines.push(``);
  lines.push(`Request expires: ${request.expiresAt?.toISOString() ?? 'never'}`);
  return lines.join('\n');
}
