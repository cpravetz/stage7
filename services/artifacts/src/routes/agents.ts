import { Router } from 'express';
import { ArtifactsService } from '../services/ArtifactsService';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { z } from 'zod';
import { AgentState } from '../types';

const router: Router = Router();
const service = new ArtifactsService();

const AgentStateSchema = z.object({
  agentId: z.string(),
  tenantId: z.string(),
  missionId: z.string(),
  status: z.string(),
  context: z.record(z.unknown()),
  artifacts: z.array(z.string()),
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = AgentStateSchema.parse(req.body);
  await service.saveAgentState(parsed);
  res.status(201).json(parsed);
}));

router.get('/:agentId', asyncHandler(async (req, res) => {
  const state = await service.getAgentState(req.params.agentId as string);
  if (!state) {
    throw NextGenError.notFound('Agent not found');
  }
  res.json(state);
}));

router.put('/:agentId', asyncHandler(async (req, res) => {
  const existing = await service.getAgentState(req.params.agentId as string);
  if (!existing) {
    throw NextGenError.notFound('Agent not found');
  }
  const parsed = AgentStateSchema.partial().parse(req.body);
  const merged = { ...existing, ...parsed, updatedAt: new Date() } as AgentState;
  await service.saveAgentState(merged);
  res.json(merged);
}));

export default router;
