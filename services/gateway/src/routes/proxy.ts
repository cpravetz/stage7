import { Router, Request, Response } from 'express';
import { gatewayProxy } from '../utils/sharedInstances';
import { asyncHandler, NextGenError, logger } from '@stage7-nextgen/shared';

const router: Router = Router();

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

router.get('/:service/*', proxyHandler);
router.post('/:service/*', proxyHandler);
router.put('/:service/*', proxyHandler);
router.delete('/:service/*', proxyHandler);
router.patch('/:service/*', proxyHandler);

router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'proxy' });
}));

export default router;
