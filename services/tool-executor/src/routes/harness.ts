/**
 * Harness² routes — the runtime entry points for the inner loop.
 *
 * Two endpoints, and neither of them runs caller-supplied code:
 *
 *   - `POST /harness/probe` runs a *registered* probe, so the code that runs
 *     is the code this service ships.
 *   - `POST /harness/evolve` runs the propose–probe–compose loop over a set of
 *     candidates and returns the composed harness with the evidence that
 *     justified it.
 *
 * An inline probe is available in-process (an assistant with
 * `metadata.learning.allowInlineProbes` may carry one) but is deliberately
 * not reachable from here: a probe is arbitrary code, and an HTTP route that
 * runs arbitrary code is a shell with extra steps.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler';
import { harnessEditService } from '../utils/sharedInstance';
import type { AssistantHarness } from '@stage7-nextgen/shared';
import type { HarnessEditCandidate, HarnessSkillFacts } from '../adk/harness-loop';

const router: Router = Router();

const probeSchema = z.object({
  probeId: z.string().min(1),
  files: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().max(60000).optional(),
  productionRoots: z.array(z.string()).optional(),
  network: z.enum(['off', 'on']).optional(),
});

const candidateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'heuristic',
    'prompt',
    'skill',
    'tool',
    'guardrail',
    'memory',
    'routing',
    'sub-agent',
  ]),
  rationale: z.string().min(1),
  patch: z.record(z.any()).optional(),
  harness: z.record(z.any()).optional(),
  affectedSkillIds: z.array(z.string()).optional(),
  probeId: z.string().optional(),
  confidence: z.number().optional(),
});

const evolveSchema = z.object({
  assistantId: z.string().min(1),
  tenantId: z.string().optional(),
  harness: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
  candidates: z.array(candidateSchema).default([]),
  skills: z
    .array(
      z.object({
        id: z.string().min(1),
        tier: z.enum(['advise', 'aid', 'represent']).optional(),
        manifest: z.record(z.any()).optional(),
      }),
    )
    .optional(),
  confirmation: z.boolean().optional(),
  productionRoots: z.array(z.string()).optional(),
  fixtures: z.record(z.string()).optional(),
});

router.post(
  '/harness/probe',
  asyncHandler(async (req: Request, res: Response) => {
    const body = probeSchema.parse(req.body);
    const probe = harnessEditService.getProbe(body.probeId);
    if (!probe) {
      res.status(404).json({
        success: false,
        error: `no probe named "${body.probeId}" is registered`,
        available: harnessEditService.listProbes().map((entry) => entry.id),
      });
      return;
    }

    const result = await harnessEditService.runProbe(body.probeId, {
      files: body.files,
      timeoutMs: body.timeoutMs,
      productionRoots: body.productionRoots,
      network: body.network,
    });

    res.status(result.ok ? 200 : 422).json({ success: result.ok, result });
  }),
);

router.post(
  '/harness/evolve',
  asyncHandler(async (req: Request, res: Response) => {
    const body = evolveSchema.parse(req.body);

    const result = await harnessEditService.evolve({
      assistantId: body.assistantId,
      tenantId: body.tenantId,
      harness: body.harness as AssistantHarness,
      metadata: body.metadata,
      candidates: body.candidates as HarnessEditCandidate[],
      skills: body.skills as HarnessSkillFacts[],
      confirmation: body.confirmation,
      productionRoots: body.productionRoots,
      fixtures: body.fixtures,
    });

    res.status(200).json(result);
  }),
);

router.get(
  '/harness/probes',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ probes: harnessEditService.listProbes() });
  }),
);

export default router;
