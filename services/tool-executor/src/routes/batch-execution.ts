import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { createCodeSkill } from '../adk/code-skill-factory';
import { CredentialRequiredError } from '../types';
import { ValidationError } from '../utils/errors';
import { toolRegistry, executor } from '../utils/sharedInstance';
import asyncHandler from '../utils/asyncHandler';

const jsonSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.unknown()),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
}).passthrough();

const batchRequestSchema = z.object({
  assistantId: z.string().min(1).optional(),
  steps: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    toolId: z.string().min(1).max(200),
    input: z.record(z.unknown()).default({}),
    includePreviousOutput: z.boolean().default(false),
  })).min(1).max(20),
  outputSchema: jsonSchema,
});

function zodFromJsonSchema(schema: Record<string, unknown>, depth = 0): z.ZodType {
  if (depth > 8) throw new ValidationError('Batch output schema exceeds the maximum nesting depth.');
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new ValidationError('Batch outputSchema must define object properties.');
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === 'string') : []);
  const shape: Record<string, z.ZodType> = {};
  for (const [key, property] of Object.entries(properties)) {
    if (!property || typeof property !== 'object' || Array.isArray(property)) {
      throw new ValidationError(`Batch outputSchema property '${key}' is invalid.`);
    }
    let field: z.ZodType;
    switch (property.type) {
      case 'string': field = z.string(); break;
      case 'number': field = z.number(); break;
      case 'integer': field = z.number().int(); break;
      case 'boolean': field = z.boolean(); break;
      case 'object': field = zodFromJsonSchema(property, depth + 1); break;
      case 'array': {
        const items = property.items;
        if (!items || typeof items !== 'object' || Array.isArray(items)) {
          throw new ValidationError(`Batch outputSchema array '${key}' must define an item schema.`);
        }
        field = z.array(zodFromJsonSchema(items as Record<string, unknown>, depth + 1));
        break;
      }
      default:
        throw new ValidationError(`Batch outputSchema property '${key}' has an unsupported type.`);
    }
    shape[key] = required.has(key) ? field : field.optional();
  }
  const object = z.object(shape);
  return schema.additionalProperties === true ? object.passthrough() : object.strict();
}

function parseFinalOutput(output: unknown): unknown {
  if (typeof output !== 'string') return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new ValidationError('Batch runner did not return valid JSON.');
  }
}

const router = Router();

router.post('/tools/execute-batch', asyncHandler(async (req, res) => {
  const request = batchRequestSchema.parse(req.body);
  const ids = new Set<string>();
  for (const step of request.steps) {
    if (ids.has(step.id)) throw new ValidationError(`Duplicate batch step id '${step.id}'.`);
    ids.add(step.id);
    if (!toolRegistry.get(step.toolId)) throw new ValidationError(`Unknown batch tool '${step.toolId}'.`);
  }
  if (!req.header('x-assistant-id') && !request.assistantId) {
    throw new ValidationError('Batch execution requires assistant context.');
  }

  const script = `const steps = __tool_input.steps;
let previousOutput;
for (const step of steps) {
  const input = step.includePreviousOutput
    ? { ...step.input, previousOutput }
    : step.input;
  const result = await __execute_tool(step.toolId, input);
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('Batch step ' + step.id + ' failed: ' + (result && result.error ? result.error : 'invalid tool result'));
  }
  previousOutput = result;
}
console.log(JSON.stringify({ stepCount: steps.length, output: previousOutput }));
`;
  const batchTool = createCodeSkill({
    id: `internal-batch-${randomUUID()}`,
    name: 'Internal Batch Runner',
    description: 'Runs one bounded batch of registered tools inside the code executor.',
    manifest: { language: 'javascript', sourceCode: script, timeoutMs: 120_000 },
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    isSkill: false,
    timeoutMs: 120_000,
  });
  const execution = await executor.executeOrRequestCredentials(
    batchTool,
    { steps: request.steps },
    undefined,
    { assistantId: request.assistantId || req.header('x-assistant-id') },
  );
  if (execution instanceof CredentialRequiredError) {
    res.status(428).json({ error: execution.message, request: execution.request });
    return;
  }
  if (execution.status !== 'completed') {
    res.status(500).json({ success: false, error: execution.error || 'Batch execution failed.' });
    return;
  }

  const resultPayload = parseFinalOutput(execution.output?.output);
  const envelope = resultPayload && typeof resultPayload === 'object'
    ? resultPayload as Record<string, unknown>
    : { output: resultPayload };
  const parsed = zodFromJsonSchema(request.outputSchema).safeParse(envelope.output);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Batch final output did not match outputSchema.',
      issues: parsed.error.issues,
    });
    return;
  }
  res.json({ success: true, stepCount: request.steps.length, output: parsed.data });
}));

export default router;
