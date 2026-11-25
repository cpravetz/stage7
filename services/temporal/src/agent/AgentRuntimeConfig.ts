import { logger } from '@stage7-nextgen/shared';
import {
  AgentDefinition,
  AgentToolPolicy,
  brainSettings,
  resolveBrainSettings,
} from '@stage7-nextgen/shared';

export interface MissionAgentConfig {
  missionId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
  broadcast?: (event: { type: string; missionId: string; timestamp: number; data?: any }) => Promise<void>;
  agentRuntimeUrl?: string;
}

export interface MissionAgentToolGrant extends AgentToolPolicy {
  tools?: string[];
}

export function getAgentRuntimeUrl(): string {
  return process.env.AGENT_RUNTIME_URL || 'http://agent-runtime:3400';
}

/**
 * An agent task runs a full model completion, which can take many minutes.
 * The default must outlast the Brain completion deadline, otherwise the
 * request is aborted while the agent is still working and the mission fails
 * even though the agent eventually succeeds.
 *
 * The Brain completion deadline is resolved settings-doc first, then the
 * BRAIN_COMPLETION_DEADLINE_MS environment variable, then the shared default.
 * Reads the last polled snapshot synchronously — the doc is kept fresh by
 * brainSettings.startPolling() at service boot, never per request.
 */
export function agentRuntimeTimeoutMs(): number {
  const configured = Number(process.env.AGENT_RUNTIME_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const { completionDeadlineMs } = resolveBrainSettings(brainSettings.current().overrides, process.env);
  return completionDeadlineMs + 60_000;
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ':');
}

export function parseMissionAgentToolPolicies(value: unknown): Map<string, MissionAgentToolGrant> {
  if (value === undefined) return new Map();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('metadata.agentToolPolicies must be an object keyed by Agent role or "*"');
  }

  const policies = new Map<string, MissionAgentToolGrant>();
  for (const [rawRole, rawPolicy] of Object.entries(value)) {
    const role = rawRole.trim().toLowerCase();
    if (role !== '*' && !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(role)) {
      throw new Error(`metadata.agentToolPolicies contains invalid Agent role '${rawRole}'`);
    }
    if (policies.has(role)) {
      throw new Error(`metadata.agentToolPolicies contains duplicate normalized Agent role '${role}'`);
    }
    if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
      throw new Error(`metadata.agentToolPolicies.${rawRole} must be an object`);
    }

    const policy = rawPolicy as Record<string, unknown>;
    const unknownFields = Object.keys(policy).filter((key) => key !== 'mode' && key !== 'tools');
    if (unknownFields.length > 0) {
      throw new Error(`metadata.agentToolPolicies.${rawRole} contains unsupported field '${unknownFields[0]}'`);
    }
    if (policy.mode === 'all') {
      if (policy.tools !== undefined && (!Array.isArray(policy.tools) || policy.tools.length > 0)) {
        throw new Error(`metadata.agentToolPolicies.${rawRole}.tools must be omitted or empty when mode is 'all'`);
      }
      policies.set(role, { mode: 'all' });
      continue;
    }
    if (policy.mode !== 'allowlist' || !Array.isArray(policy.tools) || policy.tools.length > 100) {
      throw new Error(`metadata.agentToolPolicies.${rawRole} must define mode 'all' or an allowlist of at most 100 tool IDs`);
    }
    const tools = policy.tools.map((tool) => typeof tool === 'string' ? tool.trim() : '');
    if (tools.some((tool) => !tool) || new Set(tools).size !== tools.length) {
      throw new Error(`metadata.agentToolPolicies.${rawRole}.tools must contain unique, non-empty tool IDs`);
    }
    policies.set(role, { mode: 'allowlist', tools });
  }
  return policies;
}

/**
 * "assistant" is reserved for Assistants built on the ADK. A mission Agent
 * must never be created or displayed under that name, so any role that
 * normalizes to it is canonicalized to the mission executor role.
 */
const RESERVED_AGENT_ROLE_ALIASES: Record<string, string> = {
  assistant: 'mission-executor',
};

function rawMissionAgentRoleKey(role: string): string {
  return role
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/(?:\s+Agent)+$/i, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCaseRoleKey(key: string): string {
  return key
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ');
}

export function missionAgentRoleLabel(role: string): string {
  const key = rawMissionAgentRoleKey(role);
  const alias = RESERVED_AGENT_ROLE_ALIASES[key];
  if (alias) return titleCaseRoleKey(alias);
  return role.trim().replace(/[_-]+/g, ' ').replace(/(?:\s+Agent)+$/i, '').trim() || 'Agent';
}

export function missionAgentRoleKey(role: string): string {
  const key = rawMissionAgentRoleKey(role) || 'agent';
  return RESERVED_AGENT_ROLE_ALIASES[key] || key;
}

/**
 * Return the role unchanged unless it is a reserved alias, in which case the
 * canonical replacement role is returned. Used when persisting plan tasks so
 * the reserved name never reaches the UI or the Agent runtime.
 */
export function canonicalMissionAgentRole(role: string): string {
  const key = rawMissionAgentRoleKey(role);
  return RESERVED_AGENT_ROLE_ALIASES[key] || role;
}

export function extractMissionAgents(value: unknown): AgentDefinition[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      && Array.isArray((value as Record<string, unknown>).agents)
      ? (value as { agents: unknown[] }).agents
      : [];
  return entries.filter((entry): entry is AgentDefinition => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const agent = entry as Record<string, unknown>;
    return typeof agent.id === 'string'
      && typeof agent.tenantId === 'string'
      && typeof agent.name === 'string'
      && typeof agent.description === 'string'
      && typeof agent.type === 'string'
      && typeof agent.systemPrompt === 'string'
      && Array.isArray(agent.tools)
      && agent.tools.every((tool) => typeof tool === 'string')
      && !!agent.metadata
      && typeof agent.metadata === 'object'
      && !Array.isArray(agent.metadata)
      && typeof agent.createdAt === 'string'
      && typeof agent.updatedAt === 'string';
  });
}

export class MissionAgentRuntimeApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    details: string,
  ) {
    super(`Agent Runtime API ${path} failed (${status}): ${details.slice(0, 200)}`);
    this.name = 'MissionAgentRuntimeApiError';
  }
}
