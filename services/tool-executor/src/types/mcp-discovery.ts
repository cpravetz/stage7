/**
 * MCP Tool Discovery for the Stage7 Tool Executive.
 *
 * Permission-based discovery with automatic integration. When no registered
 * tool can satisfy a capability, the Tool Executive searches approved MCP
 * library sources, vets candidates, asks the user for permission, and — on
 * grant — integrates the tool automatically under a recorded scope.
 *
 * See the design document: MCP Tool Discovery for the Stage7 Tool Executive.
 */

export type MCPTrustTier = 'curated' | 'vetted_third_party' | 'unvetted';

export const MCP_TRUST_TIERS: MCPTrustTier[] = ['curated', 'vetted_third_party', 'unvetted'];

export function isMCPTrustTier(value: unknown): value is MCPTrustTier {
  return typeof value === 'string' && MCP_TRUST_TIERS.includes(value as MCPTrustTier);
}

/**
 * Side-effect class. Comes from verification, never from MCP annotations
 * (§4.3). The default for an unverified tool is the highest-risk class.
 */
export type SideEffectClass = 'read_only' | 'writes_data' | 'external_action';

export const SIDE_EFFECT_CLASSES: SideEffectClass[] = ['read_only', 'writes_data', 'external_action'];

export function isSideEffectClass(value: unknown): value is SideEffectClass {
  return typeof value === 'string' && SIDE_EFFECT_CLASSES.includes(value as SideEffectClass);
}

/**
 * Data class a tool may be sent. The permission request lists the data classes
 * the tool would receive for this task, and integration enforces that scope.
 * Org policy defines the universe of data classes.
 */
export type DataClass = string;

export interface DataClassRequirement {
  /** Data classes the tool would receive for this task. */
  classes: DataClass[];
  /** Whether the tool may request broader classes later (triggers re-consent). */
  mayRequestBroader: boolean;
}

/**
 * Credential requirement disclosed in the permission request (§4.1).
 * Credentials are wired through the Secrets Service, never placed in prompts,
 * logs, or tool arguments visible to the LLM (§6.3).
 */
export interface CredentialRequirement {
  needed: boolean;
  /** Human-readable label for where the credential comes from. */
  source?: string;
  /** Logical keys the Secrets Service will release to the call only. */
  keys: string[];
}

/**
 * Grant scope (§4.2). Default is the narrowest scope that completes the task.
 */
export type PermissionScope = 'task' | 'assistant' | 'all_agents';

export const PERMISSION_SCOPES: PermissionScope[] = ['task', 'assistant', 'all_agents'];

export function isPermissionScope(value: unknown): value is PermissionScope {
  return typeof value === 'string' && PERMISSION_SCOPES.includes(value as PermissionScope);
}

/**
 * Narrowest scope that completes a task, per §4.2.
 */
export function defaultScope(tier: MCPTrustTier, sideEffectClass: SideEffectClass): PermissionScope {
  if (tier === 'unvetted') return 'task';
  if (sideEffectClass === 'external_action') return 'task';
  return 'assistant';
}

/**
 * Org policy for a trust tier (§5). Sets which tiers users may approve
 * themselves, which MCP library sources are searched, and which assistants
 * are restricted to curated tools only.
 */
export interface MCPTrustTierPolicy {
  tier: MCPTrustTier;
  /** Whether a user may grant this tier without admin approval. */
  userApprovable: boolean;
  /** Whether this tier is offered automatically at all. unvetted is never. */
  autoOffer: boolean;
  /** Default grant expiry in days. Broad scopes expire by default (§9). */
  defaultExpiryDays?: number;
  /** MCP library sources searched for this tier. */
  sources: string[];
}

/**
 * Approved MCP library source. Phase 1 uses curated/org-approved sources only.
 */
export interface MCPLibrarySource {
  id: string;
  name: string;
  /** Where the library runs: 'remote' (SSE/HTTP) or 'local' (stdio, sandboxed). */
  transport: 'remote' | 'local';
  /** Connection config for the MCP client. */
  config: { url?: string; command?: string; args?: string[]; env?: Record<string, string> };
  /** Trust tier assigned to tools from this source. */
  tier: MCPTrustTier;
  /** Whether org policy allows searching this source. */
  enabled: boolean;
}

/**
 * A candidate discovered from an MCP library, vetted and classified (§3.3).
 * Candidates that fail policy are dropped silently.
 */
export interface MCPToolCandidate {
  /** Stable id assigned by the discovery service. */
  id: string;
  name: string;
  /** Publisher-claimed description. Never displayed as the explanation of what
   * the tool does; labeled as the publisher's claim when shown (§4.3). */
  description: string;
  sourceId: string;
  sourceName: string;
  transport: 'remote' | 'local';
  tier: MCPTrustTier;
  sideEffectClass: SideEffectClass;
  dataClasses: DataClass[];
  credentials: CredentialRequirement;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Hash of name, description, and schema at time of consent (§6.2). */
  definitionHash: string;
  /** Publisher, if known. Used for re-consent when it changes. */
  publisher?: string;
  /** Whether org policy pre-approves this tier (no user prompt needed). */
  preApproved: boolean;
  /** Capability needed and the task that triggered it (§4.1). */
  neededCapability: string;
  triggeringTask?: string;
}

/**
 * Outcome of a permission request (§4.4). Granting a tool means the agent may
 * use it; it does not waive approval of high-impact actions.
 */
export type PermissionDecision = 'granted' | 'denied';

/**
 * The permission request shown to the user (§4.1). Written by stage7, not by
 * the tool. Tool-supplied descriptions are untrusted text.
 */
export interface PermissionRequest {
  id: string;
  /** The capability needed and the task that triggered it. */
  neededCapability: string;
  triggeringTask?: string;
  /** The tool. */
  candidate: MCPToolCandidate;
  /** What the tool can do, in plain language (verified side-effect class). */
  sideEffectClass: SideEffectClass;
  /** What data it will receive for this task. */
  dataClasses: DataClass[];
  /** Credentials or cost. */
  credentials: CredentialRequirement;
  /** Scope options. Default is the narrowest scope that completes the task. */
  defaultScope: PermissionScope;
  availableScopes: PermissionScope[];
  /** Whether org policy pre-approved this (no user prompt needed). */
  preApproved: boolean;
  createdAt: Date;
  /** Deadline after which the request expires and must be re-issued. */
  expiresAt?: Date;
}

/**
 * A recorded grant (§6, §9). Granted-tool records live in instance persistence
 * (never in an assistant's folder-based blueprint).
 */
export interface ToolPermissionGrant {
  id: string;
  toolId: string;
  toolName: string;
  sourceId: string;
  tier: MCPTrustTier;
  sideEffectClass: SideEffectClass;
  dataClasses: DataClass[];
  credentials: CredentialRequirement;
  scope: PermissionScope;
  grantedBy: string; // user / admin id
  grantedAt: Date;
  expiresAt?: Date;
  /** Hash pinned at consent; any later change suspends the tool (§6.2, §9). */
  definitionHash: string;
  publisher?: string;
  revoked: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  lastUsedAt?: Date;
  callCount: number;
}

/**
 * A remembered denial (§5 denial path). A denial is remembered so the same
 * tool is not asked again for the same need.
 */
export interface ToolPermissionDenial {
  id: string;
  toolId: string;
  toolName: string;
  sourceId: string;
  neededCapability: string;
  deniedBy: string;
  deniedAt: Date;
  scopeRequested?: PermissionScope;
}

/**
 * Audit log entry (§9). Every discovery, permission request, decision,
 * integration, call, and failure is audited, including which data classes
 * were sent.
 */
export type AuditEventType =
  | 'mcp.discovery'
  | 'mcp.candidate_vetted'
  | 'mcp.candidate_dropped'
  | 'permission.requested'
  | 'permission.granted'
  | 'permission.denied'
  | 'permission.pre_approved'
  | 'tool.integrated'
  | 'tool.call'
  | 'tool.call_failed'
  | 'tool.re_consent_required'
  | 'tool.revoked'
  | 'tool.definition_changed';

export interface ToolAuditEntry {
  id: string;
  type: AuditEventType;
  toolId?: string;
  toolName?: string;
  sourceId?: string;
  actor?: string; // user / admin / system
  scope?: PermissionScope;
  dataClasses?: DataClass[];
  sideEffectClass?: SideEffectClass;
  tier?: MCPTrustTier;
  definitionHash?: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Re-consent trigger (§9).
 */
export type ReConsentTrigger =
  | 'definition_changed'
  | 'publisher_changed'
  | 'broader_data_or_credentials'
  | 'grant_expired';

export interface ReConsentRequirement {
  grantId: string;
  toolId: string;
  toolName: string;
  trigger: ReConsentTrigger;
  reason: string;
  createdAt: Date;
}

/**
 * Result of automatic integration (§6).
 */
export interface IntegrationResult {
  ok: boolean;
  toolId?: string;
  tool?: import('../types').Tool;
  reason?: string;
  definitionHash?: string;
}

/**
 * The Tool Executive's view of whether a capability can be satisfied.
 */
export interface CapabilityResolution {
  satisfied: boolean;
  /** Registered tool that can satisfy it, if any. */
  tool?: import('../types').Tool;
  /** Best MCP candidate needing permission, if any. */
  candidate?: MCPToolCandidate;
  /** Pending permission request, if one was issued. */
  permissionRequest?: PermissionRequest;
  /** Remembered denial, if the same need was denied before. */
  denial?: ToolPermissionDenial;
  /** Pre-approved grant that was applied without prompting. */
  grant?: ToolPermissionGrant;
  error?: string;
}
