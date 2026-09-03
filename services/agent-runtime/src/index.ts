import express from 'express'
import agentsRouter from './routes/agents'
import { runtime } from './utils/sharedInstance'

const app: express.Express = express()

app.use(express.json())

app.get('/api/agent-runtime/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agent-runtime', agents: runtime.listAgents().length });
});

app.use('/api/agent-runtime', agentsRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.statusCode || 500
  const message = err?.message || 'Internal server error'
  res.status(status).json({ success: false, error: message, statusCode: status })
})

const PORT = process.env.PORT || 3400

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Agent Runtime service listening on port ${PORT} with ${runtime.listAgents().length} agents`)
  })
}

export { app }
