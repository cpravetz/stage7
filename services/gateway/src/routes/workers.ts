import { Router, Request, Response } from 'express';
import httpProxy from 'http-proxy';
import { asyncHandler, NextGenError, logger } from '@stage7-nextgen/shared';

const WORKER_POOL_URL = process.env.WORKER_POOL_URL || 'http://worker-pool:3200';
const proxy = httpProxy.createProxyServer({
  target: WORKER_POOL_URL,
  changeOrigin: true,
});

const router: Router = Router();

router.use((req: Request, res: Response, next: Function) => {
  if (req.path === '/assistants' && req.method === 'POST') {
    next();
    return;
  }
  proxy.web(req, res, undefined, (err: any) => {
    logger.error({ err: err.message, url: req.url }, 'Worker pool proxy failed');
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad gateway', details: err.message });
    }
  });
});

router.post('/assistants', asyncHandler(async (req: Request, res: Response) => {
  const response = await fetch(`${WORKER_POOL_URL}/assistants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.status(response.status).json(data);
}));

export default router;
