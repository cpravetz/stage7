import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { ToolNotFoundError } from '../utils/errors';
import {
  ctoWorkflow,
  healthcareWorkflow,
  hrWorkflow,
  educationWorkflow,
  marketingWorkflow,
  productWorkflow,
  contentWorkflow,
  careerWorkflow,
  restaurantWorkflow,
  salesWorkflow,
  supportWorkflow,
  creativeWorkflow,
  sportsWorkflow,
  eventWorkflow,
  executiveWorkflow,
  financeWorkflow,
  hotelWorkflow,
  investmentWorkflow,
  legalWorkflow,
  songwritingWorkflow,
  scriptwritingWorkflow,
  analyticsWorkflow,
} from '../data/skills';
import { AssistantWorkflow } from '../data/skills/workflow-common';
import { toolRegistry, executor, workspaceManager } from '../utils/sharedInstance';
import type { RuntimeWorkflow } from '../types';

const router: Router = Router();

const workflows: AssistantWorkflow[] = [
  ctoWorkflow,
  healthcareWorkflow,
  hrWorkflow,
  educationWorkflow,
  marketingWorkflow,
  productWorkflow,
  contentWorkflow,
  careerWorkflow,
  restaurantWorkflow,
  salesWorkflow,
  supportWorkflow,
  creativeWorkflow,
  sportsWorkflow,
  eventWorkflow,
  executiveWorkflow,
  financeWorkflow,
  hotelWorkflow,
  investmentWorkflow,
  legalWorkflow,
  songwritingWorkflow,
  scriptwritingWorkflow,
  analyticsWorkflow,
];

function findWorkflow(assistant: string): AssistantWorkflow | undefined {
  return workflows.find((w) => w.assistant.toLowerCase() === assistant.toLowerCase());
}

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      workflows: workflows.map((w) => ({
        assistant: w.assistant,
        productObject: w.productObject,
        flow: w.flow,
        stages: w.stages.map((s) => ({ name: s.name, description: s.description, skillCount: s.skills.length })),
      })),
      count: workflows.length,
    });
  })
);

router.get(
  '/:assistant',
  asyncHandler(async (req: Request, res: Response) => {
    const workflow = findWorkflow(req.params.assistant);
    if (!workflow) {
      throw new ToolNotFoundError(`workflow for assistant: ${req.params.assistant}`);
    }
    res.json(workflow);
  })
);

router.get(
  '/:assistant/runtime',
  asyncHandler(async (req: Request, res: Response) => {
    const workflow = findWorkflow(req.params.assistant);
    if (!workflow) {
      throw new ToolNotFoundError(`workflow for assistant: ${req.params.assistant}`);
    }

    const workspaceId = (req.query.workspaceId as string) || undefined;
    const executionId = (req.query.executionId as string) || undefined;
    const lastResultId = (req.query.lastResultId as string) || undefined;

    let runtime: RuntimeWorkflow | null = null;
    if (workspaceId) {
      runtime = workspaceManager.buildRuntimeWorkflow(workspaceId, workflow, executionId);
    } else {
      runtime = executor.buildRuntimeWorkflow({
        executionId: executionId || `runtime_${workflow.assistant}`,
        workflow,
        workspaceId,
        lastResultId,
      });
    }

    if (!runtime) {
      throw new ToolNotFoundError(`workspace: ${workspaceId}`);
    }

    res.json({ success: true, runtime });
  })
);

router.post(
  '/:assistant/runtime',
  asyncHandler(async (req: Request, res: Response) => {
    const workflow = findWorkflow(req.params.assistant);
    if (!workflow) {
      throw new ToolNotFoundError(`workflow for assistant: ${req.params.assistant}`);
    }

    const workspaceId = req.body?.workspaceId as string | undefined;
    const executionId = req.body?.executionId as string | undefined;
    const lastResultId = req.body?.lastResultId as string | undefined;

    let runtime: RuntimeWorkflow | null = null;
    if (workspaceId) {
      runtime = workspaceManager.buildRuntimeWorkflow(workspaceId, workflow, executionId);
    } else {
      runtime = executor.buildRuntimeWorkflow({
        executionId: executionId || `runtime_${workflow.assistant}`,
        workflow,
        workspaceId,
        lastResultId,
      });
    }

    if (!runtime) {
      throw new ToolNotFoundError(`workspace: ${workspaceId}`);
    }

    res.json({ success: true, runtime });
  })
);

export default router;