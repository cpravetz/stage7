import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createDeclarativeCodeSkill, createCodeSkill, createSchemaRecord, SchemaProps } from '../data/skills/code-skill-factory';
import { ToolExecutor } from '../services/ToolExecutor';
import { TriggerExecutionEngine } from '../services/TriggerExecutionEngine';
import { Tool } from '../types';

function textSchema(): ReturnType<typeof createSchemaRecord> {
  return createSchemaRecord({ seed: SchemaProps.text() });
}

function successSchema(): ReturnType<typeof createSchemaRecord> {
  return createSchemaRecord({ success: SchemaProps.boolean() });
}

function valueSchema(): ReturnType<typeof createSchemaRecord> {
  return createSchemaRecord({
    success: SchemaProps.boolean(),
    data: SchemaProps.object({ value: SchemaProps.number() }),
  });
}

async function waitFor<T>(read: () => T | undefined, timeoutMs = 20000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for the downstream event dispatch');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Phase 1b event dispatch wiring', () => {
  it('factory records the emitted event without subscribing the skill to it', () => {
    const tool = createDeclarativeCodeSkill({
      id: 'emitter-skill',
      name: 'Emitter Skill',
      description: 'Emits test-event when it completes',
      emitEvent: 'test-event',
      inputSchema: textSchema(),
      outputSchema: successSchema(),
      handler: async function handler(input, ctx) {
        return { success: true };
      },
    });

    // The executor reads the manifest field.
    expect((tool.manifest as Record<string, unknown>).emitEvent).toBe('test-event');

    // And the Skill must not end up subscribed to its own event. It used to: the
    // factory appended a self-subscription so the edge would show in the Overview
    // trigger graph, but a subscription is also a dispatch edge, so declaring
    // `emitEvent` made a Skill re-run itself — for a `represent` Skill, one user
    // action performed twice. `emit-event-declared` in `src/adk/validate.ts` and
    // `findDownstreamEventTriggers` in `src/services/ToolExecutor.ts` both guard
    // this now.
    expect(tool.triggers ?? []).toEqual([]);
  });

  it('getEmitEventIds reads every emitEvent on the tool manifest', () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);
    const readEmitEvent = (executor as unknown as { getEmitEventIds(tool: Tool, assistantId?: string): string[] })
      .getEmitEventIds.bind(executor);

    const fromManifest = createCodeSkill({
      id: 'manifest-emitter',
      name: 'Manifest Emitter',
      description: 'Carries emitEvent inside the manifest',
      manifest: { sourceCode: 'console.log("{}");', emitEvent: 'manifest-event' },
      inputSchema: textSchema(),
      outputSchema: successSchema(),
    });
    expect(readEmitEvent(fromManifest)).toEqual(['manifest-event']);

    // A hand-authored tool may carry the field at the top level instead.
    const fromTopLevel = createCodeSkill({
      id: 'toplevel-emitter',
      name: 'Top Level Emitter',
      description: 'Carries emitEvent at the top level',
      manifest: { sourceCode: 'console.log("{}");' },
      inputSchema: textSchema(),
      outputSchema: successSchema(),
    });
    (fromTopLevel as unknown as Record<string, unknown>).emitEvent = 'toplevel-event';
    expect(readEmitEvent(fromTopLevel)).toEqual(['toplevel-event']);

    const silent = createCodeSkill({
      id: 'silent-tool',
      name: 'Silent Tool',
      description: 'Announces nothing in particular',
      manifest: { sourceCode: 'console.log("{}");' },
      inputSchema: textSchema(),
      outputSchema: successSchema(),
    });
    // A Skill that declared nothing still announces its completion, which is what
    // makes "every Skill that alters data emits an event" true without asking 55
    // represent Skills to declare an id they have no reason to care about. This
    // used to return undefined, which meant no run in the repo emitted anything.
    expect(readEmitEvent(silent, 'event')).toEqual(['event.silent-tool.completed']);
  });

  it('findDownstreamEventTriggers returns only subscribers of that event id', () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    // The emitter carries no triggers, so it is never its own downstream.
    const emitter = createCodeSkill({
      id: 'emitter',
      name: 'Emitter',
      description: 'Announces shared-event',
      manifest: { sourceCode: 'console.log("{}");', emitEvent: 'shared-event' },
      inputSchema: textSchema(),
      outputSchema: successSchema(),
    });
    const subscriber = createCodeSkill({
      id: 'subscriber',
      name: 'Subscriber',
      description: 'Listens for shared-event',
      manifest: { sourceCode: 'console.log("{}");' },
      inputSchema: textSchema(),
      outputSchema: successSchema(),
      triggers: [{ kind: 'event', on: 'shared-event completed', eventId: 'shared-event' }],
    });
    const unrelated = createCodeSkill({
      id: 'unrelated',
      name: 'Unrelated',
      description: 'Listens for a different event',
      manifest: { sourceCode: 'console.log("{}");' },
      inputSchema: textSchema(),
      outputSchema: successSchema(),
      triggers: [{ kind: 'event', on: 'other-event completed', eventId: 'other-event' }],
    });

    registry.set(emitter.id, emitter);
    registry.set(subscriber.id, subscriber);
    registry.set(unrelated.id, unrelated);

    expect(executor.findDownstreamEventTriggers('shared-event').map((t) => t.id)).toEqual(['subscriber']);
    expect(executor.findDownstreamEventTriggers('other-event').map((t) => t.id)).toEqual(['unrelated']);
    expect(executor.findDownstreamEventTriggers('nobody-listens')).toEqual([]);
  });

  it('TriggerExecutionEngine dispatches an event trigger to its registered consumer', async () => {
    const registry = new Map<string, Tool>();
    const tool = createDeclarativeCodeSkill({
      id: 'engine-listener',
      name: 'Engine Listener',
      description: 'Listens for engine-event',
      inputSchema: textSchema(),
      outputSchema: successSchema(),
      triggers: [{ kind: 'event', on: 'engine-event completed', eventId: 'engine-event' }],
      handler: async function handler(input, ctx) {
        return { success: true };
      },
    });
    registry.set(tool.id, tool);

    const engine = new TriggerExecutionEngine(registry);
    const seen: Array<{ toolId: string; eventId?: string }> = [];
    engine.registerConsumer('event', (toolId, trigger) => {
      seen.push({ toolId, eventId: trigger.kind === 'event' ? trigger.eventId : undefined });
    });

    const result = await engine.dispatch(tool.id, tool.triggers![0]);

    expect(result.dispatched).toBe(true);
    expect(seen).toEqual([{ toolId: 'engine-listener', eventId: 'engine-event' }]);
  });

  it('completing an emitting skill runs its downstream subscriber with the upstream output', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-dispatch-'));
    const recordPath = path.join(tmpDir, 'downstream-record.json');
    // The sandboxed handler reads its record path from the environment, since the
    // child process gets `process.env` but not this module's closure.
    process.env.EVENT_DISPATCH_RECORD_PATH = recordPath;

    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const upstream = createDeclarativeCodeSkill({
      id: 'upstream-skill',
      name: 'Upstream Skill',
      description: 'Produces a value and announces data-ready',
      emitEvent: 'data-ready',
      inputSchema: textSchema(),
      outputSchema: valueSchema(),
      handler: async function handler(input, ctx) {
        return { success: true, data: { value: 42 } };
      },
    });

    // The handler runs in a sandboxed child process, so it records the input it was
    // invoked with to a file that the test reads back.
    const downstream = createDeclarativeCodeSkill({
      id: 'downstream-skill',
      name: 'Downstream Skill',
      description: 'Consumes data-ready',
      inputSchema: createSchemaRecord({ upstreamData: SchemaProps.object({}) }),
      outputSchema: successSchema(),
      triggers: [{ kind: 'event', on: 'data-ready completed', eventId: 'data-ready' }],
      handler: async function handler(input, ctx) {
        const nodeFs = require('fs');
        nodeFs.writeFileSync(process.env.EVENT_DISPATCH_RECORD_PATH, JSON.stringify(input || null));
        return { success: true };
      },
    });

    registry.set(upstream.id, upstream);
    registry.set(downstream.id, downstream);

    try {
      const execution = await executor.execute(upstream, { seed: 'hello' });
      expect(execution.status).toBe('completed');

      // Event dispatch is fire-and-forget, so wait for the downstream run to land.
      const record = await waitFor(() =>
        fs.existsSync(recordPath)
          ? (JSON.parse(fs.readFileSync(recordPath, 'utf-8')) as Record<string, unknown>)
          : undefined,
      );

      // The upstream output really travelled across the event boundary.
      const upstreamData = record.upstreamData as { output?: string };
      expect(typeof upstreamData.output).toBe('string');
      expect(JSON.parse(upstreamData.output as string)).toMatchObject({ success: true, data: { value: 42 } });
    } finally {
      delete process.env.EVENT_DISPATCH_RECORD_PATH;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60000);
});
