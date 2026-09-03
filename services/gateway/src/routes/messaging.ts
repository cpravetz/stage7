import { Router, Request, Response } from 'express';
import { MessageRouter, Message } from '../services/MessageRouter';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';

const router: Router = Router();
const messageRouter = new MessageRouter();

router.post('/message', asyncHandler(async (req: Request, res: Response) => {
  const { recipient, type, payload } = req.body;

  if (!recipient || !type || payload === undefined) {
    throw NextGenError.badRequest('Missing required fields: recipient, type, payload');
  }

  const message: Message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    recipient,
    type,
    payload,
    timestamp: Date.now(),
  };

  const serviceId = messageRouter.route(message);

  if (serviceId) {
    res.status(200).json({ serviceId, message });
  } else {
    throw NextGenError.notFound('No route found for recipient');
  }
}));

router.post('/routes', asyncHandler(async (req: Request, res: Response) => {
  const { recipient, serviceId } = req.body;

  if (!recipient || !serviceId) {
    throw NextGenError.badRequest('Missing required fields: recipient, serviceId');
  }

  messageRouter.registerRoute(recipient, serviceId);
  res.status(201).json({ recipient, serviceId });
}));

router.get('/routes', asyncHandler(async (_req: Request, res: Response) => {
  res.json(Array.from(messageRouter['routes'].entries()));
}));

export default router;
