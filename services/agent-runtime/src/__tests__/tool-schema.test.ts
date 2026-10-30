import { AgentDefinition, AgentTask } from '../types';
import { AgentExecutor } from '../services/AgentExecutor';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('Agent tool schema context', () => {
  it('supplies input, configuration, and output schemas including secret markers', async () => {
    const definition: AgentDefinition = {
      id: 'mission-agent',
      tenantId: 'tenant-1',
      name: 'Mission Agent',
      description: 'Mission-scoped agent',
      type: 'worker',
      systemPrompt: 'Complete the task.',
      tools: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const task: AgentTask = {
      taskId: 'mission-1:task-1',
      agentId: definition.id,
      type: 'research',
      input: { prompt: 'Prepare the message', context: {} },
      priority: 1,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    let systemPrompt = '';
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{
            id: 'send-message',
            name: 'Send Message',
            description: 'Sends a message',
            type: 'code',
            inputSchema: {
              type: 'object',
              required: ['recipient'],
              properties: {
                recipient: { type: 'string', description: 'Destination address' },
                token: {
                  type: 'string',
                  format: 'password',
                  writeOnly: true,
                  'x-stage7-secret': true,
                },
              },
            },
            configSchema: { type: 'object', required: ['sender'], properties: { sender: { type: 'string' } } },
            outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
          }],
        });
      }
      if (url.endsWith('/api/brain/complete')) {
        const request = JSON.parse(String(init?.body)) as { systemPrompt: string };
        systemPrompt = request.systemPrompt;
        return jsonResponse({ content: 'The task is complete.' });
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    await new AgentExecutor({ fetcher }).execute(
      definition,
      task,
      { missionId: 'mission-1', delegationDepth: 0 },
    );

    expect(systemPrompt).toContain('"inputSchema":{"type":"object"');
    expect(systemPrompt).toContain('"configSchema":{"type":"object"');
    expect(systemPrompt).toContain('"outputSchema":{"type":"object"');
    expect(systemPrompt).toContain('"x-stage7-secret":true');
    expect(systemPrompt).toContain('Never expose a vault:// reference');
  });
});
