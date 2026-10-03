import { ToolExecutor } from '../services/ToolExecutor';
import { createInMemoryEventLog, type EventLog } from '../services/EventLog';
import { buildCatalog } from '../adk/bootstrap';
import { allBlueprintSkills } from '../adk/types';
import { altersData, outcomeEventId } from '../adk/events';
import type { Tool } from '../types';

/**
 * Proof that emission happens, rather than merely being described.
 *
 * The validator reports that 61 Skills alter data without declaring `emitEvent`
 * and that 39 event triggers name prose. Neither number says whether a run emits
 * anything at all, and "nothing was ever emitted" is the exact failure this work
 * was meant to end. So this executes a real shipped Skill — not a fixture — and
 * reads the event back out of the log.
 *
 * Only the environment-dependent layers are stubbed (config, credentials, the
 * low-level run). The success check, id derivation, log append, and downstream
 * dispatch are all the real implementation.
 */
/**
 * Waits for the log to hold `count` events.
 *
 * Dispatch after a run is fire-and-forget, so a fixed sleep is a race: on a loaded
 * machine the append can land after the timer fires and the assertion fails for no
 * reason. Polling makes these tests deterministic instead of occasionally red.
 */
async function eventsEventually(log: { recent: (limit?: number) => Promise<unknown[]> }, count: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await log.recent()).length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('events are emitted by real shipped Skills', () => {
  const catalog = buildCatalog();
  const realSkills = catalog.order.flatMap((id) => {
    const blueprint = catalog.blueprints.get(id);
    return blueprint ? allBlueprintSkills(blueprint) : [];
  });

  const assistantOf = (toolId: string): string => {
    const id = catalog.order.find((candidate) => {
      const blueprint = catalog.blueprints.get(candidate);
      return blueprint ? allBlueprintSkills(blueprint).some((tool) => tool.id === toolId) : false;
    });
    return catalog.blueprints.get(id!)!.manifest.id;
  };

  // Real gated Skills, confirmed explicitly below: a `represent` Skill throws
  // ConfirmationRequiredError unless the input carries `confirmation: true`.
  // That gating is correct behaviour, so these runs pass the gate honestly
  // rather than having it stubbed out.
  const declaringNothing = realSkills.filter(
    (tool) => altersData(tool) && !(tool.manifest as Record<string, unknown>)?.emitEvent,
  );

  // A real gated Skill that declares a business event, confirmed below.
  const emitters = realSkills.filter(
    (tool) => altersData(tool) && typeof (tool.manifest as Record<string, unknown>)?.emitEvent === 'string',
  );

  const confirmedInput = { confirmation: true };

  /** An executor whose run reaches the emit path without needing credentials. */
  function executorFor(tools: Tool[], log: EventLog): ToolExecutor {
    const executor = new ToolExecutor(new Map(tools.map((tool) => [tool.id, tool])), undefined, log);
    const stub = executor as unknown as Record<string, unknown>;
    stub.validateConfigSchema = () => null;
    stub.resolveCredentials = async () => ({ resolved: {}, sources: {} });
    stub.ensureWorkspace = () => ({ workspaceId: 'ws-probe', workflow: undefined });
    stub.dispatch = async () => ({ ok: true });
    return executor;
  }

  
  it('has no mutating Skill in the catalogue that declares no emitEvent', () => {
    // The regression this whole file exists to prevent. It was 55; declaring the
    // events took it to zero, and the validator now agrees because both read the
    // same built Skill rather than the source text.
    expect(declaringNothing).toEqual([]);
  });

  it('emits the declared business event for a mutating run', async () => {
    const target = emitters[0];
    const log = createInMemoryEventLog();

    await executorFor([target], log).execute(target, confirmedInput, { assistantId: assistantOf(target.id) });
    await eventsEventually(log, 1);

    const emitted = (await log.recent()).find((event) => event.skillId === target.id);
    const declared = (target.manifest as Record<string, unknown>).emitEvent as string;

    // The declared id, not the derived one: this is what a downstream Skill keys off.
    expect(emitted).toBeDefined();
    expect(emitted!.id).toBe(declared);
    expect(emitted!.kind).toBe('declared');
    expect(emitted!.status).toBe('completed');
    expect(emitted!.assistantId).toBeTruthy();
  });

  it('delivers that exact id to a downstream subscriber', async () => {
    const target = emitters[0];
    const assistantId = assistantOf(target.id);

    // Subscribe to whatever id the run actually announces. If that id were not
    // derivable, no author could name it and this would find no edge to take.
    const scout = createInMemoryEventLog();
    await executorFor([target], scout).execute(target, confirmedInput, { assistantId });
    await eventsEventually(scout, 1);
    const announcedId = (await scout.recent()).find((event) => event.skillId === target.id)!.id;

    let subscriberRan = false;
    const subscriber = {
      id: 'probe-subscriber',
      name: 'Probe subscriber',
      description: 'Subscribes to a real Skill completion',
      type: 'custom',
      manifest: { sourceCode: 'module.exports = {};' },
      triggers: [{ kind: 'event', on: 'completion', eventId: announcedId }],
    } as unknown as Tool;

    const log = createInMemoryEventLog();
    const executor = executorFor([target, subscriber], log);
    (executor as unknown as Record<string, unknown>).nestedExecutorCallback = () => async () => {
      subscriberRan = true;
      return { success: true };
    };

    await executor.execute(target, confirmedInput, { assistantId });
    await eventsEventually(log, 1);

    expect(subscriberRan).toBe(true);
  });

  it('announces a failure without announcing the business change it failed to make', async () => {
    const target = emitters[0];
    const assistantId = assistantOf(target.id);
    const declared = (target.manifest as Record<string, unknown>).emitEvent as string;
    const log = createInMemoryEventLog();
    const executor = executorFor([target], log);

    // `dispatch` reports failure as `{ error }` instead of throwing, so a tool
    // that "succeeded" with an error payload must not announce a change.
    (executor as unknown as Record<string, unknown>).dispatch = async () => ({
      error: 'deliberate failure',
    });

    const result = await executor.execute(target, confirmedInput, { assistantId });
    await eventsEventually(log, 1);

    // The run is still reported `completed`, because that is how `dispatch`
    // signals failure. What stops the false event is the error check on the
    // output, not the status — so this asserts both, deliberately.
    expect(result.status).toBe('completed');

    const events = await log.recent();
    // Exactly one event: the failure. No completion, and above all not the
    // declared business event, because the change it names did not happen.
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('failed');
    expect(events[0].id).toBe(`${assistantId}.${target.id}.failed`);
    expect(events[0].id).not.toBe(declared);
    expect(events[0].error).toBe('deliberate failure');
  });
});

describe('aborted runs announce themselves', () => {
  const catalog = buildCatalog();
  const realSkills = catalog.order.flatMap((id) => {
    const blueprint = catalog.blueprints.get(id);
    return blueprint ? allBlueprintSkills(blueprint) : [];
  });
  const assistantOf = (toolId: string): string => {
    const id = catalog.order.find((candidate) => {
      const blueprint = catalog.blueprints.get(candidate);
      return blueprint ? allBlueprintSkills(blueprint).some((tool) => tool.id === toolId) : false;
    });
    return catalog.blueprints.get(id!)!.manifest.id;
  };

  const gated = realSkills.find(
    (tool) => altersData(tool) && tool.confirmBeforeSend === true && typeof (tool.manifest as Record<string, unknown>)?.emitEvent === 'string',
  )!;

  function executorFor(tools: Tool[], log: EventLog): ToolExecutor {
    const executor = new ToolExecutor(new Map(tools.map((tool) => [tool.id, tool])), undefined, log);
    const stub = executor as unknown as Record<string, unknown>;
    stub.validateConfigSchema = () => null;
    stub.resolveCredentials = async () => ({ resolved: {}, sources: {} });
    stub.ensureWorkspace = () => ({ workspaceId: 'ws-probe', workflow: undefined });
    stub.dispatch = async () => ({ ok: true });
    return executor;
  }

  
  it('aborts, rather than fails, when the run is waiting on a human', async () => {
    const log = createInMemoryEventLog();
    const assistantId = assistantOf(gated.id);

    // No `confirmation: true`, so the gate throws. The distinction matters: the
    // run did not break, it was never allowed to start, and a downstream Skill
    // retrying on failure would be retrying something the user has not approved.
    await expect(executorFor([gated], log).execute(gated, {}, { assistantId })).rejects.toThrow();

    const events = await log.recent();
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('aborted');
    expect(events[0].id).toBe(`${assistantId}.${gated.id}.aborted`);
    expect(events[0].error).toBe('awaiting user confirmation');
  });

  it('aborts when required configuration is missing', async () => {
    // A Skill that genuinely requires config, so the gate is the real one and
    // not a stub standing in for it.
    const needsConfig = realSkills.find(
      (skill) =>
        (((skill as unknown as Record<string, unknown>).configSchema ??
          (skill.manifest as Record<string, unknown>)?.configSchema) as { required?: string[] })?.required
          ?.length,
    )!;
    const log = createInMemoryEventLog();
    const assistantId = assistantOf(needsConfig.id);

    // No config stub here: this is the real config gate rejecting the run.
    const executor = new ToolExecutor(new Map([[needsConfig.id, needsConfig]]), undefined, log);
    const stub = executor as unknown as Record<string, unknown>;
    stub.ensureWorkspace = () => ({ workspaceId: 'ws-probe', workflow: undefined });
    stub.dispatch = async () => ({ ok: true });

    await executor.execute(needsConfig, { confirmation: true }, { assistantId });
    await eventsEventually(log, 1);

    const events = await log.recent();
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('aborted');
    expect(events[0].id).toBe(`${assistantId}.${needsConfig.id}.aborted`);
  });

  it('derives failed and aborted ids from the Skill, never from its declared event', () => {
    // A declared id names a business outcome ("contract booked"). Publishing that
    // id for a run that broke would claim the outcome happened.
    expect(outcomeEventId('event', 'vendor-booking', 'failed')).toBe('event.vendor-booking.failed');
    expect(outcomeEventId('event', 'vendor-booking', 'aborted')).toBe('event.vendor-booking.aborted');
  });
});
