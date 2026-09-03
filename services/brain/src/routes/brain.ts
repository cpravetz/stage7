import { Router } from 'express';
import { CompletionOptions } from '../services/BrainService';
import { brainInstance as brain } from '../utils/sharedInstance';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { BrainError } from '../utils/errors';
import { StructuredOutputSampler } from '../services/StructuredOutputSampler';

const router: Router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'brain',
    providers: brain.listProviders(),
    models: brain.listAvailableModels().length,
  });
});

router.post('/complete', asyncHandler(async (req: any, res: any) => {
  const { prompt, options, systemPrompt, provider, model, maxTokens, budget, temperature } = req.body as {
    prompt: string;
    options?: CompletionOptions;
    systemPrompt?: string;
    provider?: string;
    model?: string;
    maxTokens?: number;
    budget?: number;
    temperature?: number;
  };
  if (!prompt) {
    throw BrainError.badRequest('Missing prompt');
  }
  const mergedOptions: CompletionOptions = {
    ...(options || {}),
    systemPrompt: systemPrompt ?? options?.systemPrompt,
    provider: provider ?? options?.provider,
    model: model ?? options?.model,
    maxTokens: maxTokens ?? options?.maxTokens ?? 1024,
    budget: budget ?? options?.budget,
    temperature: temperature ?? options?.temperature,
  };
  const result = await brain.complete(prompt, mergedOptions);
  res.json(result);
}));

router.get('/providers', asyncHandler(async (_req: any, res: any) => {
  res.json({ providers: brain.listProviders() });
}));

router.post('/validate', asyncHandler(async (req: any, res: any) => {
  const { schema, data } = req.body as { schema: unknown; data: unknown };
  if (!schema || !data) {
    throw BrainError.badRequest('Missing schema or data');
  }
  const parsed = z.object({ schema: z.unknown(), data: z.unknown() }).parse({ schema, data });
  const sampler = new StructuredOutputSampler(parsed.schema as z.ZodSchema);
  const validated = sampler.validate(parsed.data);
  res.json({ success: true, data: validated });
}));

router.get('/models', asyncHandler(async (_req: any, res: any) => {
  res.json({ models: brain.listAvailableModels() });
}));

router.post('/models', asyncHandler(async (req: any, res: any) => {
  const model = req.body;
  brain.registerModel(model);
  res.status(201).json({ registered: true, model });
}));

router.post('/route', asyncHandler(async (req: any, res: any) => {
  const { task, modelId, provider, maxTokens, budget } = req.body as { task: string; modelId?: string; provider?: string; maxTokens?: number; budget?: number };
  if (!task) {
    throw BrainError.badRequest('Missing task description');
  }
  const all = brain.listAvailableModels();
  res.json({ candidates: all, count: all.length });
}));

router.get('/cache/stats', asyncHandler(async (_req: any, res: any) => {
  res.json(brain.getCacheStats());
}));

export default router;
