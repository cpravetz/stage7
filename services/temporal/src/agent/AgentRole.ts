import { AgentDefinition, AgentToolPolicy } from '@stage7-nextgen/shared';
import {
  MissionAgentToolGrant,
  missionAgentRoleKey,
  missionAgentRoleLabel,
  extractMissionAgents,
} from './AgentRuntimeConfig';
import { AgentApi } from './AgentApi';

export interface AgentRoleConfig {
  missionId: string;
  tenantId: string;
  entityId?: string;
  assistantId?: string;
  missionRetryCount: number;
  agentToolPolicies: Map<string, MissionAgentToolGrant>;
  agentCache: Map<string, string>;
  api: AgentApi;
}

export class AgentRoleManager {
  private readonly missionId: string;
  private readonly tenantId: string;
  private readonly entityId?: string;
  private readonly assistantId?: string;
  private readonly missionRetryCount: number;
  private readonly agentToolPolicies: Map<string, MissionAgentToolGrant>;
  private readonly agentCache: Map<string, string>;
  private readonly api: AgentApi;

  constructor(config: AgentRoleConfig) {
    this.missionId = config.missionId;
    this.tenantId = config.tenantId;
    this.entityId = config.entityId;
    this.assistantId = config.assistantId;
    this.missionRetryCount = config.missionRetryCount;
    this.agentToolPolicies = config.agentToolPolicies;
    this.agentCache = config.agentCache;
    this.api = config.api;
  }

  private resolveToolAccess(agentRole: string): { tools: string[]; policy?: AgentToolPolicy } {
    const key = agentRole.trim().toLowerCase();
    const canonicalKey = missionAgentRoleKey(agentRole);
    const grant = this.agentToolPolicies.get(key)
      || this.agentToolPolicies.get(canonicalKey)
      || this.agentToolPolicies.get('*');
    if (!grant) return { tools: [] };
    return {
      tools: grant.mode === 'allowlist' ? [...(grant.tools || [])] : [],
      policy: { mode: grant.mode },
    };
  }

  private assertToolAccess(agent: AgentDefinition, role: string): void {
    const expected = this.resolveToolAccess(role);
    const existingMode = agent.toolPolicy?.mode || 'all';
    const expectedMode = expected.policy?.mode || 'all';
    const existingTools = [...agent.tools].sort();
    const expectedTools = [...expected.tools].sort();
    if (
      existingMode !== expectedMode
      || existingTools.length !== expectedTools.length
      || existingTools.some((tool, index) => tool !== expectedTools[index])
    ) {
      throw new Error(
        `Persisted mission Agent ${agent.id} has a tool policy that differs from metadata.agentToolPolicies`,
      );
    }
  }

  async getOrCreateAgent(agentRole: string, systemPrompt: string): Promise<string> {
    const roleLabel = missionAgentRoleLabel(agentRole);
    const cacheKey = missionAgentRoleKey(agentRole);
    if (this.agentCache.has(cacheKey)) {
      return this.agentCache.get(cacheKey)!;
    }

    const retryScope = cacheKey === 'mission-evaluator' && this.missionRetryCount > 0
      ? `-retry-${this.missionRetryCount}`
      : '';
    const agentId = `agent-${this.missionId}-${cacheKey}${retryScope}`;
    try {
      const existing = await this.api.api<AgentDefinition>(
        this.api.missionAgentPath(agentId)
      );
      if (existing.id) {
        this.assertToolAccess(existing, agentRole);
        await this.api.api(this.api.missionAgentPath(agentId, 'start'), { method: 'POST' });
        this.agentCache.set(cacheKey, agentId);
        return agentId;
      }
    } catch (error) {
      if (!(error instanceof Error) || (error as Error & { status?: number }).status !== 404) {
        throw error;
      }
    }

    try {
      const agents = extractMissionAgents(await this.api.api<unknown>(this.api.missionAgentsPath()));
      const existingAlias = agents.find((agent) => {
        const roleValues = [
          agent.metadata.agentRole,
          agent.type,
          agent.name,
        ].filter((value): value is string => typeof value === 'string');
        return roleValues.some((role) => missionAgentRoleKey(role) === cacheKey);
      });
      if (existingAlias) {
        this.assertToolAccess(existingAlias, agentRole);
        await this.api.api(this.api.missionAgentPath(existingAlias.id, 'start'), { method: 'POST' });
        this.agentCache.set(cacheKey, existingAlias.id);
        return existingAlias.id;
      }
    } catch (error) {
      if (!(error instanceof Error) || (error as Error & { status?: number }).status !== 404) {
        throw error;
      }
    }

    const toolAccess = this.resolveToolAccess(agentRole);
    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: `${roleLabel} Agent`,
      description: `Dynamic agent for role: ${roleLabel} in mission ${this.missionId}`,
      type: roleLabel,
      systemPrompt,
      tools: toolAccess.tools,
      ...(toolAccess.policy ? { toolPolicy: toolAccess.policy } : {}),
      metadata: {
        missionId: this.missionId,
        agentRole: roleLabel,
        ...(this.entityId ? { entityId: this.entityId } : {}),
        ...(this.assistantId ? { assistantId: this.assistantId } : {}),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.api.api(this.api.missionAgentsPath(), { method: 'POST', body: JSON.stringify(definition) });
    await this.api.api(this.api.missionAgentPath(agentId, 'start'), { method: 'POST' });
    this.agentCache.set(cacheKey, agentId);
    return agentId;
  }

  getAgentIdForRole(agentRole: string): string {
    const cacheKey = missionAgentRoleKey(agentRole);
    return this.agentCache.get(cacheKey) || `agent-${this.missionId}-${cacheKey}`;
  }
}
