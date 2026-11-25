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

  /**
   * Subscribe to an Agent task's event stream until it completes or fails.
   * Uses a raw `fetch` (not `httpRequest`) on purpose: an SSE response has no
   * "headers received" deadline — the connection must stay open for as long
   * as the task runs, bounded instead by `maxWaitMs`.
   */
  async awaitTaskUpdate(agentId: string, taskId: string, maxWaitMs: number): Promise<AgentTask> {
    const path = this.missionAgentPath(agentId, 'tasks', taskId);
    const deadline = Date.now() + maxWaitMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), maxWaitMs);
    try {
      while (Date.now() < deadline) {
        let taskUpdate: AgentTask | undefined;
        try {
          const response = await fetch(`${this.agentRuntimeUrl}/api/agent-runtime${path}/events`, {
            headers: { Accept: 'text/event-stream' },
            signal: controller.signal,
          });
          if (!response.ok) {
            const details = await response.text();
            if (response.status < 500) throw new MissionAgentRuntimeApiError(path, response.status, details);
            logger.warn(
              { missionId: this.missionId, agentId, taskId, status: response.status },
              'Agent task event stream returned a transient error; reconnecting',
            );
          } else {
            taskUpdate = await readTaskEventStream(response);
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          if (error instanceof MissionAgentRuntimeApiError) throw error;
          logger.warn(
            { missionId: this.missionId, agentId, taskId, error: error instanceof Error ? error.message : String(error) },
            'Agent task event stream disconnected; reconnecting',
          );
        }
        if (taskUpdate?.status === 'completed') return taskUpdate;
        if (taskUpdate?.status === 'failed') throw new Error(taskUpdate.error || `Agent task ${taskId} failed`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, Math.max(0, deadline - Date.now()))));
      }
      throw new Error(`Task ${taskId} timed out after ${maxWaitMs}ms while waiting for an Agent Runtime notification`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Read an agent-runtime SSE task stream until a terminal task update arrives. */
async function readTaskEventStream(response: Response): Promise<AgentTask | undefined> {
  if (!response.body) throw new Error('Agent task event stream returned no response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return undefined;
      buffer += decoder.decode(value, { stream: true });

      let lineEnd = buffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
        buffer = buffer.slice(lineEnd + 1);
        if (line === '') {
          if (dataLines.length > 0) {
            const parsed: unknown = JSON.parse(dataLines.join('\n'));
            if (
              !parsed
              || typeof parsed !== 'object'
              || typeof (parsed as Record<string, unknown>).taskId !== 'string'
              || typeof (parsed as Record<string, unknown>).status !== 'string'
            ) {
              throw new Error('Agent task event stream returned an invalid task update');
            }
            const task = parsed as AgentTask;
            if (task.status === 'completed' || task.status === 'failed') {
              await reader.cancel();
              return task;
            }
            dataLines = [];
          }
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
        }
        lineEnd = buffer.indexOf('\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
