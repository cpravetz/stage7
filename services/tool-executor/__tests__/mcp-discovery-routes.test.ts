import request from 'supertest'
import express, { Application } from 'express'
import mcpDiscoveryRouter from '../src/routes/mcpDiscovery'

jest.mock('../src/services/MCPToolDiscovery', () => ({
  mcpToolDiscovery: {
    discover: jest.fn().mockResolvedValue({ candidates: [], errors: [] }),
  },
}))

const app: Application = express()
app.use(express.json())
app.use('/', mcpDiscoveryRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err?.message || 'Internal server error' })
})

describe('mcpDiscovery routes', () => {
  it('GET /mcp/sources returns approved sources', async () => {
    const res = await request(app).get('/mcp/sources')
    expect(res.status).toBe(200)
    expect(res.body.sources).toBeInstanceOf(Array)
    expect(res.body.sources.find((s: any) => s.id === 'stage7-curated')).toBeDefined()
  })

  it('GET /mcp/grants returns active grants', async () => {
    const res = await request(app).get('/mcp/grants')
    expect(res.status).toBe(200)
    expect(res.body.grants).toBeInstanceOf(Array)
  })

  it('GET /mcp/audit returns entries', async () => {
    const res = await request(app).get('/mcp/audit')
    expect(res.status).toBe(200)
    expect(res.body.entries).toBeInstanceOf(Array)
    expect(res.body.count).toBe(res.body.entries.length)
  })

  it('POST /mcp/discover returns 404 when no candidate', async () => {
    const res = await request(app)
      .post('/mcp/discover')
      .send({ capability: 'nothing_here', actor: 'u' })
    expect(res.status).toBe(404)
    expect(res.body.satisfied).toBe(false)
  })

  it('DELETE /mcp/grants/:id requires revokedBy and returns 404 for missing', async () => {
    const res = await request(app).delete('/mcp/grants/nope').query({ revokedBy: 'admin' })
    expect(res.status).toBe(404)
  })

  it('DELETE /mcp/grants/:id returns error when revokedBy missing', async () => {
    const res = await request(app).delete('/mcp/grants/nope')
    expect(res.status).toBe(500)
  })

  it('POST /mcp/permission/:id/decide returns 403 for unknown request', async () => {
    const res = await request(app)
      .post('/mcp/permission/nope/decide')
      .send({ decision: 'granted', decidedBy: 'u' })
    expect(res.status).toBe(403)
    expect(res.body.satisfied).toBe(false)
  })
})
