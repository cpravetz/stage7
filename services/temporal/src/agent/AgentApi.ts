import { logger } from '@stage7-nextgen/shared';
import { AgentDefinition, AgentTask, AgentState } from '@stage7-nextgen/shared';
import { MissionAgentRuntimeApiError, encodePathSegment, getAgentRuntimeUrl, agentRuntimeTimeoutMs } from './AgentRuntimeConfig';
import { describeRequestError, httpRequest } from '@stage7-nextgen/shared';

export interface AgentApiConfig {
  missionId: string;
  agentRuntimeUrl?: string;
}

export class AgentApi {
  private readonly missionId: string;
  private readonly agentRuntimeUrl: string;

  constructor(config: AgentApiConfig) {
    this.missionId = config.missionId;
    this.agentRuntimeUrl = config.agentRuntimeUrl || getAgentRuntimeUrl();
  }

  async api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.agentRuntimeUrl}/api/agent-runtime${path}`;
    let res: Response;
    try {
      res = await httpRequest(url, {
        method: options.method,
        headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> | undefined) },
        body: options.body as string | undefined,
        timeoutMs: agentRuntimeTimeoutMs(),
      });
    } catch (err) {
      const message = describeRequestError(err);
      logger.error({ path, url, err: message }, 'Agent runtime fetch failed');
      throw new MissionAgentRuntimeApiError(path, 500, message);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new MissionAgentRuntimeApiError(path, res.status, text);
    }
    return res.json() as Promise<T>;
  }

  missionAgentsPath(): string {
    return `/missions/${encodePathSegment(this.missionId)}/agents`;
  }

  missionAgentPath(agentId: string, ...segments: string[]): string {
    return `${this.missionAgentsPath()}/${encodePathSegment(agentId)}${
      segments.map((segment) => `/${encodePathSegment(segment)}`).join('')
    }`;
  }

  async listAgents(): Promise<AgentDefinition[]> {
    return this.api<{ agents: AgentDefinition[] }>(`/missions/${this.missionId}/agents`).then((r) => r.agents);
  }

  async getAgentState(agentId: string): Promise<AgentState | undefined> {
    try {
      return await this.api<AgentState>(this.missionAgentPath(agentId, 'state'));
    } catch (error) {
      if (error instanceof MissionAgentRuntimeApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    try {
      await this.api(this.missionAgentPath(agentId, 'stop'), { method: 'POST' });
    } catch (error) {
      if (error instanceof MissionAgentRuntimeApiError && error.status === 404) return;
      throw error;
    }
  }

  async stopAllAgents(): Promise<void> {
    try {
      await this.api(`/missions/${this.missionId}/agents/stop-all`, { method: 'POST' });
      return;
    } catch (error) {
      // Fallback to stopping individually
    }
    try {
      const agents = await this.listAgents();
      await Promise.allSettled(agents.map((a) => this.stopAgent(a.id)));
    } catch (error) {
      // Best effort - don't fail mission completion if stopping agents fails
      logger.warn({ missionId: this.missionId, error: error instanceof Error ? error.message : String(error) }, 'Failed to stop agents');
    }
  }
}
