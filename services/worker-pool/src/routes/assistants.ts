import { Router } from 'express';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { AssistantDefinition, asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { assistantLoader as loader, assistantExecutor as executor } from '../utils/sharedInstance';
import { registerAssistantTools } from '../shared/mcp';

const toolExecutorUrl = process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500';

async function validateAssistantTools(tools: any[] | undefined) {
  if (!tools || !Array.isArray(tools)) return;
  for (const t of tools) {
    const name = typeof t === 'string' ? t : t.name;
    if (!name) continue;
    try {
      const res = await fetch(`${toolExecutorUrl}/api/tool-executor/tools/${encodeURIComponent(name)}`);
      if (res.status === 404) {
        // not a registered global tool/skill — check for orphaned stub entries
        if (typeof t === 'object' && t !== null) {
          const desc = t.description as string || '';
          const schema = t.inputSchema as Record<string, unknown> | undefined;
          const props = schema?.properties as Record<string, unknown> | undefined;
          if (desc.startsWith('Run ') && props && Object.keys(props).length === 0) {
            throw NextGenError.badRequest(`Orphaned tool binding '${name}' resolves to no registered tool and has no real definition`);
          }
        }
        // inline/custom tool with real definition — allow
        continue;
      }
      if (!res.ok) {
        throw new Error(`Tool registry returned ${res.status}`);
      }
      const tool = await res.json();
      // If tool is registered but not a skill, disallow binding it as a skill/assistant-bound item
      if (!(tool as any).isSkill) {
        throw NextGenError.badRequest(`Cannot bind general tool '${name}' as a skill to an assistant`);
      }
    } catch (err) {
      if (err instanceof NextGenError) throw err;
      throw NextGenError.badRequest(`Tool validation failed for '${name}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function validateCatalogIntegrity(catalog: any[]): { valid: boolean; orphaned: string[] } {
  const orphaned: string[] = [];
  for (const assistant of catalog) {
    if (!assistant || !Array.isArray(assistant.tools)) continue;
    for (const t of assistant.tools) {
      const name = typeof t === 'string' ? t : t.name;
      if (!name) continue;
      const desc = t.description as string || '';
      const schema = t.inputSchema as Record<string, unknown> | undefined;
      const props = schema?.properties as Record<string, unknown> | undefined;
      if (desc.startsWith('Run ') && props && Object.keys(props).length === 0) {
        orphaned.push(`${assistant.id || 'unknown'}:${name}`);
      }
    }
  }
  return { valid: orphaned.length === 0, orphaned };
}

const router: Router = Router();

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
  // Ensure assistants never carry a persisted `model` property
  if ((definition as any).model) delete (definition as any).model;
  // Validate provided tools/skills before saving
  await validateAssistantTools(definition.tools);

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
  // Strip any user-supplied model override — assistants must not carry `model`
  if ((updates as any).model) delete (updates as any).model;
  // validate any updated tools
  await validateAssistantTools(updates.tools);

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
  const { name, arguments: args, workspaceId } = req.body as { name?: string; arguments: Record<string, unknown>; workspaceId?: string };
  if (!name) {
    throw NextGenError.badRequest('Missing tool name');
  }
  const result = await executor.executeToolCall({ name, arguments: args }, req.params.id as string, workspaceId);
  res.json(result);
}));

export default router;
