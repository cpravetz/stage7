import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { GatewayError } from '../utils/errors';
import { gatewayRegistry, getWsGateway } from '../utils/sharedInstances';
import { ServiceHealth } from '../utils/serviceRegistry';

const router: Router = Router();

router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  logger.debug('Health check requested');
  res.json({ status: 'ok', service: 'gateway' });
}));

router.get('/services', asyncHandler(async (req: Request, res: Response) => {
  logger.debug('Services list requested');
  res.json({ services: gatewayRegistry.list() });
}));

router.get('/services/:id/health', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const service = gatewayRegistry.get(req.params.id as string);

  if (!service) {
    throw GatewayError.notFound(`Service ${req.params.id} not found`);
  }

  logger.info({ serviceId: req.params.id }, 'Health check for service');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const healthUrl = `${service.baseUrl}${service.healthPath || '/health'}`;
    const response = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const health = await response.json() as { status?: string };
      const status = health.status === 'ok' ? 'healthy' : health.status === 'degraded' ? 'degraded' : 'unhealthy';
      res.json({ id: service.id, name: service.name, status, lastChecked: Date.now(), details: health });
      return;
    }
  } catch {
    // Service unreachable or returned non-ok
  }

  res.json({ id: service.id, name: service.name, status: 'unhealthy', lastChecked: Date.now() });
}));

router.post('/broadcast', asyncHandler(async (req: Request, res: Response) => {
  const ws = getWsGateway();
  if (ws) {
    ws.broadcast(req.body);
    res.json({ status: 'broadcast', recipients: ws.getConnectedCount() });
  } else {
    throw GatewayError.notFound('WebSocket gateway not initialized');
  }
}));

router.post('/broadcast/mission/:missionId', asyncHandler(async (req: Request, res: Response) => {
  const ws = getWsGateway();
  if (ws) {
    ws.broadcastToMission(req.params.missionId, req.body);
    res.json({ status: 'broadcast', missionId: req.params.missionId, recipients: ws.getSubscribers(req.params.missionId).length });
  } else {
    throw GatewayError.notFound('WebSocket gateway not initialized');
  }
}));

export default router;
