import { Router } from 'express';
import { getBrainInstance } from '../utils/sharedInstance';
import { asyncHandler } from '../utils/asyncHandler';
import { createDistillationService } from '../services/DistillationService';

const router: Router = Router();

async function getBrain() {
  return getBrainInstance();
}

router.post('/trigger', asyncHandler(async (req, res) => {
  const brain = await getBrain();
  const { assistantId, tenantId, missionId, taskId, errors } = req.body || {};
  if (!assistantId) {
    res.status(400).json({ error: 'assistantId required' });
    return;
  }
  const service = createDistillationService(brain);
  const result = await service.distill({ assistantId, tenantId, missionId, taskId, errors });
  res.json({ heuristics: result.heuristics });
}));

export default router;
