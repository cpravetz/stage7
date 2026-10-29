import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import batchExecutionRoutes from '../src/routes/batch-execution';
import { createCodeSkill } from '../src/adk/code-skill-factory';
import { toolRegistry } from '../src/utils/sharedInstance';

describe('batch tool execution route', () => {
  it('executes nested tools in one sandbox request and validates the final output', async () => {
    const tool = createCodeSkill({
      id: `batch-test-${randomUUID()}`,
      name: 'Batch test incrementer',
      description: 'Returns a numeric value.',
      manifest: {
        language: 'javascript',
        sourceCode: 'const value = __tool_input.previousOutput?.value ?? __tool_input.value; console.log(JSON.stringify({ value: value + 1 }));',
      },
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'number' }, previousOutput: { type: 'object' } },
        required: ['value'],
      },
      outputSchema: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
      isSkill: false,
    });
    toolRegistry.register(tool);
    const app = express();
    app.use(express.json());
    app.use('/api/tool-executor', batchExecutionRoutes);
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error.message });
    });

    try {
      const response = await request(app)
        .post('/api/tool-executor/tools/execute-batch')
        .set('x-assistant-id', 'career')
        .send({
          steps: [
            { id: 'first', toolId: tool.id, input: { value: 2 } },
            { id: 'second', toolId: tool.id, input: { value: 0 }, includePreviousOutput: true },
          ],
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'number' } },
            required: ['value'],
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, stepCount: 2, output: { value: 4 } });
    } finally {
      toolRegistry.unregister(tool.id);
    }
  });
});
