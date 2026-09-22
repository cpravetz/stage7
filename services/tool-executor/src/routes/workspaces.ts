import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';
import { toolRegistry, executor, workspaceManager } from '../utils/sharedInstance';
import { AssistantWorkflow } from '../data/skills/workflow-common';
import { allWorkflows as workflows } from '../data/skills';
import type { RuntimeWorkflow } from '../types';

const router: Router = Router();

function findWorkflow(assistant: string): AssistantWorkflow | undefined {
  return workflows.find((w) => w.assistant.toLowerCase() === assistant.toLowerCase());
}

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const workspaces = workspaceManager.filterWorkspaces({
      assistant: req.query.assistant as string | undefined,
      productObject: req.query.productObject as string | undefined,
      workflowState: req.query.workflowState as any,
      currentStage: req.query.currentStage as string | undefined,
    });
    res.json({ workspaces, count: workspaces.length });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const ws = workspaceManager.getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json(ws);
  })
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { assistant, productObject, workspaceId, context, initialStage } = req.body || {};
    if (!assistant || !productObject) {
      throw new ValidationError('assistant and productObject are required');
    }

    const { workspace, resumed } = workspaceManager.createOrResumeWorkspace(assistant, productObject, {
      workspaceId,
      context,
      initialStage,
    });

    res.status(resumed ? 200 : 201).json({ workspace, resumed });
  })
);

router.post(
  '/:id/stage',
  asyncHandler(async (req: Request, res: Response) => {
    const { stage } = req.body || {};
    if (!stage) {
      throw new ValidationError('stage is required');
    }
    const updated = workspaceManager.updateStage(req.params.id, stage);
    if (!updated) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id) });
  })
);

router.patch(
  '/:id/stage',
  asyncHandler(async (req: Request, res: Response) => {
    const { stage } = req.body || {};
    if (!stage) {
      throw new ValidationError('stage is required');
    }
    const updated = workspaceManager.updateStage(req.params.id, stage);
    if (!updated) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id) });
  })
);

router.post(
  '/:id/state',
  asyncHandler(async (req: Request, res: Response) => {
    const { state } = req.body || {};
    if (!state) {
      throw new ValidationError('state is required');
    }
    const updated = workspaceManager.updateWorkflowState(req.params.id, state);
    if (!updated) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id) });
  })
);

router.get(
  '/:id/runtime',
  asyncHandler(async (req: Request, res: Response) => {
    const ws = workspaceManager.getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const workflow = findWorkflow(ws.assistant);
    if (!workflow) {
      res.status(404).json({ error: `Workflow not found for assistant: ${ws.assistant}` });
      return;
    }

    const runtime = workspaceManager.buildRuntimeWorkflow(req.params.id, workflow, req.query.executionId as string | undefined);
    if (!runtime) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json({ success: true, runtime });
  })
);

router.get(
  '/:id/history',
  asyncHandler(async (req: Request, res: Response) => {
    const approvals = workspaceManager.getApprovalSummary(req.params.id);
    const executions = workspaceManager.getExecutionSummary(req.params.id);
    const revisions = workspaceManager.getRevisions(req.params.id);

    if (!approvals && !executions) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json({
      approvals: approvals || undefined,
      executions: executions || undefined,
      revisions,
    });
  })
);

router.post(
  '/:id/transition',
  asyncHandler(async (req: Request, res: Response) => {
    const { state } = req.body || {};
    if (!state) {
      throw new ValidationError('state is required');
    }
    const updated = workspaceManager.transitionTo(req.params.id, state);
    if (!updated) {
      res.status(400).json({ error: `Invalid workflow state transition to ${state}` });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id), allowedTransitions: workspaceManager.getAllowedTransitions(req.params.id) });
  })
);

router.get(
  '/:id/allowed-transitions',
  asyncHandler(async (req: Request, res: Response) => {
    if (!workspaceManager.getWorkspace(req.params.id)) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ allowedTransitions: workspaceManager.getAllowedTransitions(req.params.id) });
  })
);

router.get(
  '/:id/state-history',
  asyncHandler(async (req: Request, res: Response) => {
    if (!workspaceManager.getWorkspace(req.params.id)) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ stateHistory: workspaceManager.getStateHistory(req.params.id) });
  })
);

router.get(
  '/:id/next-actions',
  asyncHandler(async (req: Request, res: Response) => {
    const ws = workspaceManager.getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ nextActions: ws.nextActions });
  })
);

router.get(
  '/:id/approval-summary',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = workspaceManager.getApprovalSummary(req.params.id);
    if (!summary) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json(summary);
  })
);

router.get(
  '/:id/execution-summary',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = workspaceManager.getExecutionSummary(req.params.id);
    if (!summary) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json(summary);
  })
);

router.post(
  '/:id/last-result',
  asyncHandler(async (req: Request, res: Response) => {
    const { resultId } = req.body || {};
    if (!resultId) {
      throw new ValidationError('resultId is required');
    }
    if (!workspaceManager.setLastResult(req.params.id, resultId)) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id) });
  })
);

router.post(
  '/:id/reset',
  asyncHandler(async (req: Request, res: Response) => {
    if (!workspaceManager.resetWorkspace(req.params.id)) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = workspaceManager.deleteWorkspace(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.status(204).send();
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { runtimeInputs, ...rest } = req.body || {};
    const updated = workspaceManager.updateWorkspace(req.params.id, { runtimeInputs, ...rest });
    if (!updated) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true, workspace: workspaceManager.getWorkspace(req.params.id) });
  })
);

export default router;