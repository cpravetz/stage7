import { BrainClient } from '../services/agent-executor/BrainClient'
import type { AgentDefinition } from '../types'
import type { BrainResponse, ChatMessage } from '../services/agent-executor/types'

function definition(metadata: Record<string, unknown>): AgentDefinition {
  return {
    id: 'agent-1',
    tenantId: 'system',
    name: 'Researcher',
    description: 'd',
    type: 'mission-agent',
    systemPrompt: 'sp',
    tools: [],
    metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function captureFetcher(captured: Array<Record<string, unknown>>) {
  return (async (_url: string, init?: RequestInit) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: 'done' }) satisfies BrainResponse,
      text: async () => '',
    } as unknown as Response;
  }) as typeof fetch;
}

const history: ChatMessage[] = [{ role: 'user', content: 'hello' }];

describe('BrainClient entity-memory slot', () => {
  it('sends the explicit entityId when the definition metadata carries one', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const client = new BrainClient('http://brain:3100', captureFetcher(captured), 30_000);

    await client.complete(definition({ entityId: 'cust-7', assistantId: 'ast-1' }), 'mission-9', 'sp', history, 1000);

    expect(captured[0].entityId).toBe('cust-7');
    expect(captured[0].assistantId).toBe('ast-1');
    expect(captured[0].tenantId).toBe('system');
  });

  it('falls back to the metadata assistantId as the read slot when entityId is absent', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const client = new BrainClient('http://brain:3100', captureFetcher(captured), 30_000);

    await client.complete(definition({ assistantId: 'ast-1' }), 'mission-9', 'sp', history, 1000);

    // Mirrors the extraction fallback (MissionStageCompletedListener writes
    // entityId = assistantId) so the read hits the slot extraction wrote.
    expect(captured[0].entityId).toBe('ast-1');
    expect(captured[0].assistantId).toBe('ast-1');
  });

  it('never falls back to the missionId', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const client = new BrainClient('http://brain:3100', captureFetcher(captured), 30_000);

    await client.complete(definition({}), 'mission-9', 'sp', history, 1000);

    expect(captured[0].entityId).toBeUndefined();
    expect(captured[0].missionId).toBe('mission-9');
  });
});
