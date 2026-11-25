import { NextFunction, Router, Request, Response } from 'express';
import { gatewayProxy } from '../utils/sharedInstances';
import { asyncHandler, NextGenError, logger, requireServiceToken } from '@stage7-nextgen/shared';

const router: Router = Router();

const requireToken = requireServiceToken();

/**
 * Proxy paths that must stay reachable without a token: the auth endpoints
 * that mint tokens (login cannot require one) and service health probes.
 */
const PUBLIC_PROXY_PATHS = new Set([
  'auth/login',
  'auth/service/auth',
  'auth/refresh',
  'auth/verify',
]);

export const isPublicProxyPath = (serviceId: string, resourcePath: string): boolean => {
  const normalized = resourcePath.replace(/\/+$/, '');
  if (normalized === 'health') return true;
  return PUBLIC_PROXY_PATHS.has(`${serviceId}/${normalized}`);
};

const authGate = (req: Request, res: Response, next: NextFunction): void => {
  const resourcePath = (req.params[0] as string | undefined) ?? '';
  if (isPublicProxyPath(req.params.service, resourcePath)) {
    next();
    return;
  }
  requireToken(req, res, next);
};

const rewritePath = (req: any, serviceId: string): string => {
  return `/api${req.url}`;
};

const proxyRequest = async (req: any, res: any, serviceId: string): Promise<void> => {
  const proxyInstance = gatewayProxy.getProxy(serviceId);

  if (!proxyInstance) {
    throw NextGenError.notFound('Service not registered');
  }

  req.url = rewritePath(req, serviceId);

  await new Promise<void>((resolve, reject) => {
    proxyInstance.web(req, res, undefined, (err: any) => {
      if (err) {
        logger.error({ serviceId, err: err.message }, 'Proxy request failed');
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const proxyHandler = asyncHandler(async (req: Request, res: Response) => {
  const serviceId = req.params.service as string;
  try {
    await proxyRequest(req, res, serviceId);
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad gateway',
        service: serviceId,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

router.get('/:service/*', authGate, proxyHandler);
router.post('/:service/*', authGate, proxyHandler);
router.put('/:service/*', authGate, proxyHandler);
router.delete('/:service/*', authGate, proxyHandler);
router.patch('/:service/*', authGate, proxyHandler);

router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'proxy' });
}));

export default router;
