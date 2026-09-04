import request from 'supertest'
import express, { Application } from 'express'
import { ToolRegistry } from '../services/ToolRegistry'
import { ToolExecutor } from '../services/ToolExecutor'
import { PluginGenerator } from '../services/PluginGenerator'
import { Tool, PluginGenerationRequest } from '../types'
import toolsRouter from '../routes/tools'

const app: Application = express()
app.use(express.json())
app.use('/api', toolsRouter)

const registry = new ToolRegistry()
const executor = new ToolExecutor()
const generator = new PluginGenerator()

const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/brain/complete')) {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            id: `plugin_${Date.now()}`,
            name: 'calculator',
            description: body.prompt,
            type: 'code',
            language: 'javascript',
            entrypoint: 'index.js',
            sourceCode: 'module.exports = { add: (a, b) => a + b };',
            requirements: [],
            configSchema: {},
            inputs: {},
            outputs: {},
          }),
          model: body.options?.model || 'gpt-4o-mini',
          provider: 'openrouter',
          tokensUsed: 100,
        }),
        text: async () => '',
      } as any;
    }
    return originalFetch(url, init);
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('ToolRegistry', () => {
  const mockTool: Tool = {
    id: 'tool-1',
    name: 'Test Tool',
    description: 'A test tool',
    type: 'mcp',
    manifest: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    registry.register(mockTool)
  })

  afterEach(() => {
    registry.unregister(mockTool.id)
  })

  it('should register a tool', () => {
    const tool = registry.get('tool-1')
    expect(tool).toBeDefined()
    expect(tool?.name).toBe('Test Tool')
  })

  it('should list all tools', () => {
    const tools = registry.list()
    expect(tools.length).toBeGreaterThanOrEqual(1)
  })

  it('should find tools by type', () => {
    const mcpTools = registry.findByType('mcp')
    expect(mcpTools.length).toBeGreaterThanOrEqual(1)
  })

  it('should unregister a tool', () => {
    const result = registry.unregister('tool-1')
    expect(result).toBe(true)
    expect(registry.get('tool-1')).toBeUndefined()
  })
})

describe('ToolExecutor', () => {
  const codeTool: Tool = {
    id: 'tool-code-1',
    name: 'Code Runner',
    description: 'Run code',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: 'console.log("hello");',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('should execute a code tool successfully', async () => {
    const execution = await executor.execute(codeTool, {})
    expect(execution.status).toBe('completed')
    expect(execution.output).toBeDefined()
    expect(execution.toolId).toBe(codeTool.id)
  })

  it('should attempt discovery and generation for unsupported tool type', async () => {
    const unsupportedTool: Tool = {
      id: 'tool-unknown',
      name: 'Unknown Tool',
      description: 'Unknown',
      type: 'mcp',
      manifest: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const execution = await executor.execute(unsupportedTool, {})
    expect(execution.status).toBe('completed')
    expect(execution.output).toBeDefined()
    expect(execution.toolId).toBe('tool-unknown')
  })
})

describe('PluginGenerator', () => {
  const request: PluginGenerationRequest = {
    description: 'Generate a calculator plugin',
    requirements: ['addition', 'subtraction'],
    context: { environment: 'test' },
  }

  it('should generate a plugin successfully', async () => {
    const result = await generator.generate(request)
    expect(result.success).toBe(true)
    expect(result.tool).toBeDefined()
    expect(result.tool?.type).toBe('code')
    expect(result.tool?.description).toContain('Generate a calculator plugin')
  })
})

describe('REST endpoints', () => {
  const validTool = {
    id: 'rest-tool-1',
    name: 'REST Tool',
    description: 'Tool via REST',
    type: 'openapi',
    manifest: { endpoint: '/test' },
  }

  it('should register a tool via POST /api/tools', async () => {
    const res = await request(app)
      .post('/api/tools')
      .send(validTool)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('REST Tool')
  })

  it('should list tools via GET /api/tools', async () => {
    const res = await request(app).get('/api/tools')
    expect(res.status).toBe(200)
    expect(res.body.tools).toBeDefined()
    expect(Array.isArray(res.body.tools)).toBe(true)
  })

  it('should get a tool by id via GET /api/tools/:id', async () => {
    await request(app).post('/api/tools').send(validTool)
    const res = await request(app).get(`/api/tools/${validTool.id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(validTool.id)
  })

  it('should execute a tool via POST /api/tools/:id/execute', async () => {
    await request(app).post('/api/tools').send(validTool)
    const res = await request(app)
      .post(`/api/tools/${validTool.id}/execute`)
      .send({ input: { test: true } })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
  })

  it('should generate a plugin via POST /api/plugins/generate', async () => {
    const res = await request(app)
      .post('/api/plugins/generate')
      .send({ description: 'New plugin' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('should return 428 when tool requires missing credentials', async () => {
    const credentialTool = {
      id: 'cred-tool-1',
      name: 'Jira Tool',
      description: 'Jira integration',
      type: 'mcp',
      manifest: {
        credentialSource: {
          jiraToken: { vaultSecretId: 'jira-token', envVar: 'JIRA_TOKEN' },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await request(app).post('/api/tools').send(credentialTool)
    const res = await request(app)
      .post('/api/tools/cred-tool-1/execute')
      .send({ input: { projectKey: 'TEST' } })

    expect(res.status).toBe(428)
    expect(res.body.error).toContain('requires credentials')
    expect(res.body.request.missingCredentials).toBeDefined()
    expect(res.body.request.missingCredentials.length).toBeGreaterThanOrEqual(1)
  })

  it('should execute tool successfully after providing credentials', async () => {
    const credentialTool = {
      id: 'cred-tool-2',
      name: 'Slack Tool',
      description: 'Slack integration',
      type: 'mcp',
      manifest: {
        credentialSource: {
          slackToken: { vaultSecretId: 'slack-token', envVar: 'SLACK_TOKEN' },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await request(app).post('/api/tools').send(credentialTool)

    const execRes = await request(app)
      .post('/api/tools/cred-tool-2/execute')
      .send({ input: { channel: '#general', text: 'hello' } })

    expect(execRes.status).toBe(428)
    const executionId = execRes.body.request.executionId
    expect(executionId).toBeDefined()

    const credRes = await request(app)
      .post(`/api/executions/${executionId}/credentials`)
      .send({
        credentials: { slackToken: 'xoxb-test' },
        storeInVault: false,
      })

    expect(credRes.status).toBe(200)
    expect(credRes.body.status).toBe('completed')
  })
})
