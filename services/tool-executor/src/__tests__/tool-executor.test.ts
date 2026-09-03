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
  const mockTool: Tool = {
    id: 'tool-exec-1',
    name: 'Query Tool',
    description: 'Query data',
    type: 'mcp',
    manifest: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('should execute a tool successfully', async () => {
    const execution = await executor.execute(mockTool, { query: 'test' })
    expect(execution.status).toBe('completed')
    expect(execution.output).toBeDefined()
    expect(execution.toolId).toBe(mockTool.id)
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
    expect(result.tool?.type).toBe('mcp')
    expect(result.tool?.description).toBe(request.description)
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
})
