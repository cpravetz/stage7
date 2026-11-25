import { BRAIN_OPTIMIZE_FOR_CONTEXT_KEY, BRAIN_ROUTING_SESSION_CONTEXT_KEY } from '@stage7-nextgen/shared'
import { parseTaskSpec } from '../services/agent-executor/requirements'

function taskInput(context: Record<string, unknown>) {
  return { prompt: 'Do the work.', context };
}

describe('parseTaskSpec optimizeFor lift', () => {
  it('lifts the optimize-for context key into TaskSpec.optimizeFor', () => {
    const spec = parseTaskSpec(taskInput({
      [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: 'mission-1:task:phase-1:task-1',
      [BRAIN_OPTIMIZE_FOR_CONTEXT_KEY]: 'cost',
    }));
    expect(spec.routingSessionId).toBe('mission-1:task:phase-1:task-1');
    expect(spec.optimizeFor).toBe('cost');
  });

  it('accepts every router union value', () => {
    for (const value of ['cost', 'speed', 'accuracy', 'creativity']) {
      expect(parseTaskSpec(taskInput({ [BRAIN_OPTIMIZE_FOR_CONTEXT_KEY]: value })).optimizeFor).toBe(value);
    }
  });

  it('drops unknown criterion values instead of forwarding them', () => {
    const spec = parseTaskSpec(taskInput({ [BRAIN_OPTIMIZE_FOR_CONTEXT_KEY]: 'cheapest' }));
    expect(spec.optimizeFor).toBeUndefined();
  });

  it('leaves optimizeFor undefined when the context key is absent', () => {
    const spec = parseTaskSpec(taskInput({}));
    expect(spec.optimizeFor).toBeUndefined();
    expect(spec.routingSessionId).toBeUndefined();
  });
});
