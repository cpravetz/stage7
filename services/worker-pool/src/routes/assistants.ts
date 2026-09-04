import { Router } from 'express';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { AssistantDefinition, asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { assistantLoader as loader, assistantExecutor as executor } from '../utils/sharedInstance';
import { registerAssistantTools } from '../shared/mcp';

const router: Router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'worker-pool', assistants: loader.list().length });
});

router.post('/assistants', asyncHandler(async (req, res) => {
  const definition = req.body as AssistantDefinition;
  if (!definition || !definition.id) {
    throw NextGenError.badRequest('Missing assistant definition');
  }
  if (!definition.tenantId) {
    definition.tenantId = 'tenant-1';
  }
  if (!definition.createdAt) {
    definition.createdAt = new Date();
  }
  if (!definition.updatedAt) {
    definition.updatedAt = new Date();
  }
  if (!definition.tools) {
    definition.tools = [];
  }
  if (!definition.metadata) {
    definition.metadata = {};
  }
  if (!definition.knowledge) {
    definition.knowledge = [];
  }
  if (!definition.transactionGuidance) {
    definition.transactionGuidance = [];
  }
  const saved = await loader.register(definition);
  if (saved.tools && saved.tools.length > 0) {
    registerAssistantTools(saved.tools);
  }
  res.status(201).json(saved);
}));

router.get('/assistants', asyncHandler(async (req, res) => {
  res.json({ assistants: loader.list() });
}));

router.get('/assistants/:id', asyncHandler(async (req, res) => {
  const assistant = loader.get(req.params.id as string);
  if (!assistant) {
    throw NextGenError.notFound('Assistant not found');
  }
  const runtime = loader.getRuntime(req.params.id as string);
  res.json({ assistant, runtime });
}));

router.put('/assistants/:id', asyncHandler(async (req, res) => {
  const updates = req.body as Partial<AssistantDefinition>;
  const updated = await loader.update(req.params.id as string, updates);
  if (!updated) {
    throw NextGenError.notFound('Assistant not found');
  }
  if (updated.tools && updated.tools.length > 0) {
    registerAssistantTools(updated.tools);
  }
  res.json(updated);
}));

router.delete('/assistants/:id', asyncHandler(async (req, res) => {
  const existed = await loader.unregister(req.params.id as string);
  if (!existed) {
    throw NextGenError.notFound('Assistant not found');
  }
  res.status(204).send();
}));

router.post('/assistants/:id/runtime', asyncHandler(async (req, res) => {
  const assistant = loader.get(req.params.id as string);
  if (!assistant) {
    throw NextGenError.notFound('Assistant not found');
  }
  const runtime = await loader.configureRuntime(req.params.id as string, req.body);
  res.json(runtime);
}));

router.post('/assistants/:id/execute', asyncHandler(async (req, res) => {
  const definition = loader.get(req.params.id as string);
  if (!definition) {
    throw NextGenError.notFound('Assistant not found');
  }
  const { prompt, context } = req.body as { prompt?: string; context?: Record<string, unknown> };
  if (!prompt) {
    throw NextGenError.badRequest('Missing prompt');
  }
  const result = context
    ? await executor.execute(definition, prompt, context)
    : await executor.execute(definition, prompt);
  res.json(result);
}));

router.post('/assistants/:id/tools/execute', asyncHandler(async (req, res) => {
  const { name, arguments: args } = req.body as { name?: string; arguments: Record<string, unknown> };
  if (!name) {
    throw NextGenError.badRequest('Missing tool name');
  }
  const result = await executor.executeToolCall({ name, arguments: args });
  res.json(result);
}));

export default router;
