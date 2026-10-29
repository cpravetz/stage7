import { Router } from 'express';
import { CompletionOptions } from '../services/BrainService';
import { getBrainInstance } from '../utils/sharedInstance';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { BrainError } from '../utils/errors';
import { StructuredOutputSampler } from '../services/StructuredOutputSampler';
import { logger } from '../utils/logger';
import { EntityMemoryStore } from '../services/EntityMemoryStore';

const router: Router = Router();
const entityMemoryExtractionSchema = z.object({
  summary: z.string().min(1).max(4000),
  preferences: z.array(z.string().min(1).max(500)).max(20),
  constraints: z.array(z.string().min(1).max(500)).max(20),
  decisions: z.array(z.string().min(1).max(500)).max(20),
});

async function getBrain() {
  return getBrainInstance();
}

router.get('/health', asyncHandler(async (_req, res) => {
  const brain = await getBrain();
  res.json({
    status: 'ok',
    service: 'brain',
    providers: brain.listProviders(),
    models: brain.listAvailableModels().length,
  });
}));

router.post('/memory/entity', asyncHandler(async (req: any, res: any) => {
  const parsed = z.object({
    tenantId: z.string().min(1).max(200),
    entityId: z.string().min(1).max(200),
    assistantId: z.string().min(1).max(200),
    missionId: z.string().min(1).max(200),
    stageName: z.string().min(1).max(500),
    stageOutput: z.string().min(1).max(20_000),
  }).parse(req.body);
  const brain = await getBrain();
  const extraction = await brain.complete(
    `Extract durable user preferences, domain constraints, and architectural decisions from this completed mission stage. Do not infer facts that are not stated. Keep the summary concise.\n\nStage: ${parsed.stageName}\nOutput:\n${parsed.stageOutput}`,
    {
      missionId: parsed.missionId,
      maxTokens: 1200,
      temperature: 0.1,
      inputFormat: 'json',
      outputFormat: 'json',
      systemPrompt: 'Return only a JSON object with summary, preferences, constraints, and decisions. Use empty arrays when no durable fact is supported.',
    },
  );
  let decoded: unknown;
  try {
    decoded = JSON.parse(extraction.content);
  } catch (error) {
    throw new Error(`Brain memory extraction returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const memory = entityMemoryExtractionSchema.parse(decoded);
  const saved = await EntityMemoryStore.getInstance().upsert({
    ...memory,
    tenantId: parsed.tenantId,
    entityId: parsed.entityId,
    assistantId: parsed.assistantId,
    missionId: parsed.missionId,
  });
  res.status(201).json({ memory: saved });
}));

router.post('/complete', asyncHandler(async (req: any, res: any) => {
  const brain = await getBrain();
  const requestId = `brain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const { prompt, options, systemPrompt, maxTokens, budget, temperature, missionId, routingSessionId, entityId, assistantId, tenantId, inputFormat, outputFormat } = req.body as {
    prompt: string;
    options?: CompletionOptions;
    systemPrompt?: string;
    maxTokens?: number;
    budget?: number;
    temperature?: number;
    missionId?: string;
    routingSessionId?: string;
    entityId?: string;
    assistantId?: string;
    tenantId?: string;
    inputFormat?: string;
    outputFormat?: string;
  };
  if (!prompt) {
    throw BrainError.badRequest('Missing prompt');
  }
  logger.info({ requestId, promptLength: prompt.length }, 'Brain completion request started');
  const mergedOptions: CompletionOptions = {
    schema: options?.schema,
    systemPrompt: systemPrompt ?? options?.systemPrompt,
    maxTokens: maxTokens ?? options?.maxTokens ?? 1024,
    budget: budget ?? options?.budget,
    temperature: temperature ?? options?.temperature,
    missionId,
    optimizeFor: options?.optimizeFor,
    routingSessionId: routingSessionId ?? options?.routingSessionId,
    entityId: entityId ?? options?.entityId,
    assistantId: assistantId ?? options?.assistantId,
    tenantId: tenantId ?? options?.tenantId,
    inputFormat: inputFormat ?? options?.inputFormat,
    outputFormat: outputFormat ?? options?.outputFormat,
  };
  try {
    const result = await brain.complete(prompt, mergedOptions);
    logger.info({ requestId, model: result.model, provider: result.provider, durationMs: Date.now() - startedAt }, 'Brain completion request completed');
    res.json(result);
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }, 'Brain completion request failed');
    throw error;
  }
}));

router.get('/providers', asyncHandler(async (_req: any, res: any) => {
  const brain = await getBrain();
  res.json({ providers: brain.listProviders() });
}));

router.post('/validate', asyncHandler(async (req: any, res: any) => {
  const brain = await getBrain();
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
  const brain = await getBrain();
  res.json({ models: brain.listAvailableModels() });
}));

router.post('/models', asyncHandler(async (req: any, res: any) => {
  const brain = await getBrain();
  const model = req.body;
  brain.registerModel(model);
  res.status(201).json({ registered: true, model });
}));

router.post('/route', asyncHandler(async (req: any, res: any) => {
  const brain = await getBrain();
  const { task, maxTokens, budget } = req.body as { task: string; maxTokens?: number; budget?: number };
  if (!task) {
    throw BrainError.badRequest('Missing task description');
  }
  const all = brain.listAvailableModels();
  res.json({ candidates: all, count: all.length });
}));

router.get('/cache/stats', asyncHandler(async (_req: any, res: any) => {
  const brain = await getBrain();
  res.json(brain.getCacheStats());
}));

router.post('/circuit-breakers/reset', asyncHandler(async (_req: any, res: any) => {
  const brain = await getBrain();
  brain.resetCircuitBreakers();
  res.json({ reset: true });
}));

router.get('/circuit-breakers', asyncHandler(async (_req: any, res: any) => {
  const brain = await getBrain();
  res.json(brain.getCircuitBreakerStats());
}));

router.get('/logs', asyncHandler(async (_req: any, res: any) => {
  const brain = await getBrain();
  res.json(brain.getLogs());
}));

router.get('/performance', asyncHandler(async (_req: any, res: any) => {
  const brain = await getBrain();
  res.json(await brain.getPerformanceMetrics());
}));

router.post('/complaint', asyncHandler(async (req: any, res: any) => {
  const brain = await getBrain();
  const { requestId, reason, missionId } = req.body as {
    requestId: string;
    reason?: string;
    missionId?: string;
  };
  if (!requestId) {
    throw BrainError.badRequest('Missing requestId');
  }
  const recorded = await brain.recordComplaint(requestId);
  if (!recorded) {
    logger.warn({ requestId, reason, missionId }, 'Quality complaint referenced an unknown Brain request');
    res.status(404).json({ recorded: false, requestId, error: 'Unknown Brain requestId' });
    return;
  }
  logger.info({ requestId, reason, missionId }, 'Quality complaint recorded');
  res.json({ recorded: true, requestId });
}));

export default router;