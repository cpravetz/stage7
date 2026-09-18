import request from 'supertest'
import express, { Application } from 'express'
import { ToolRegistry } from '../services/ToolRegistry'
import { ToolExecutor } from '../services/ToolExecutor'
import { PluginGenerator } from '../services/PluginGenerator'
import { Tool } from '../types'
import toolsRouter from '../routes/tools'

const app: Application = express()
app.use(express.json())
app.use('/api', toolsRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ success: false, error: err?.message || 'Internal server error', statusCode: 500 });
});

describe('debug2', () => {
  it('debug flat payload', async () => {
    const skillTool = {
      id: 'skill-1',
      name: 'Registered Skill',
      description: 'A registered skill',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("skill registered");',
      },
      isSkill: true,
    };

    await request(app).post('/api/tools').send(skillTool);

    const res = await request(app)
      .post('/api/tools/execute')
      .send({
        name: 'Registered Skill',
        type: 'code',
        manifest: {},
        input: { test: 'skill' },
      });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));
    expect(true).toBe(true);
  });
});
