import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';

describe('debug', () => {
  it('debug config', async () => {
    const executor = new ToolExecutor();
    const externalTool: Tool = {
      id: 'tool-external-2',
      name: 'External API Tool 2',
      description: 'Calls external API',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("test");',
        system: 'test-system',
        action: 'test-action',
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
          },
          required: ['apiKey'],
        },
      },
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
        },
        required: ['apiKey'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(externalTool, { apiKey: 'my-key', action: 'test' });
    console.log(JSON.stringify(execution, null, 2));
    expect(true).toBe(true);
  });
});
