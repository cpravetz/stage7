import { parsePlanJson, repairJsonStructure } from '../src/planner/planJson';

function planWithClosedPhaseTwice(): string {
  const phase = (id: string): string =>
    `{"id":"${id}","name":"Phase ${id}","goal":"Do ${id}","requiresApproval":false,"status":"pending",`
    + `"tasks":[{"id":"${id}-task-1","title":"Task","description":"Description","agentRole":"AI Assistant",`
    + `"systemPrompt":"Do the work","dependsOnTaskIds":[],"expectedArtifacts":[],"requiredActions":[],`
    + `"status":"pending","artifacts":[]}]}`;
  // The defect seen in production: the phase object is closed twice, so the
  // second closing brace lands where the array expects a comma or a bracket.
  return `{"summary":"Plan","estimatedDuration":"One week","estimatedCost":"Low","requiresClarification":false,`
    + `"clarificationQuestions":[],"phases":[${phase('phase-1')}},${phase('phase-2')}}]}]}`;
}

describe('repairJsonStructure', () => {
  it('drops a container that was closed twice', () => {
    const repaired = repairJsonStructure('{"a":[1,2]}}');

    expect(repaired.repairs).toEqual([expect.stringContaining('dropped unmatched "}"')]);
    expect(JSON.parse(repaired.text)).toEqual({ a: [1, 2] });
  });

  it('removes a trailing comma before a closing bracket', () => {
    const repaired = repairJsonStructure('{"a":[1,2,]}');

    expect(repaired.repairs).toEqual([expect.stringContaining('removed trailing ","')]);
    expect(JSON.parse(repaired.text)).toEqual({ a: [1, 2] });
  });

  it('closes containers and strings that the response left open', () => {
    const repaired = repairJsonStructure('{"a":["unterminated');

    expect(repaired.repairs).toEqual(expect.arrayContaining([
      expect.stringContaining('closed an unterminated string'),
      expect.stringContaining('closed unterminated "["'),
      expect.stringContaining('closed unterminated "{"'),
    ]));
    expect(JSON.parse(repaired.text)).toEqual({ a: ['unterminated'] });
  });

  it('leaves well-formed JSON untouched', () => {
    const repaired = repairJsonStructure('{"a":[1,2],"b":{"c":true}}');

    expect(repaired.repairs).toEqual([]);
    expect(JSON.parse(repaired.text)).toEqual({ a: [1, 2], b: { c: true } });
  });
});

describe('parsePlanJson', () => {
  it('accepts a plan whose phase object was closed twice', () => {
    const parsed = parsePlanJson(planWithClosedPhaseTwice());

    expect(parsed.repaired).toBe(true);
    expect(parsed.repairs).toEqual(expect.arrayContaining([
      expect.stringContaining('dropped unmatched "}"'),
    ]));
    const plan = parsed.value as { phases: Array<{ id: string; tasks: unknown[] }> };
    expect(plan.phases).toHaveLength(2);
    expect(plan.phases[0]?.id).toBe('phase-1');
    expect(plan.phases[1]?.id).toBe('phase-2');
    expect(plan.phases[1]?.tasks).toHaveLength(1);
  });

  it('reports valid JSON as unrepaired', () => {
    const parsed = parsePlanJson('{"summary":"ok"}');

    expect(parsed.repaired).toBe(false);
    expect(parsed.repairs).toEqual([]);
    expect(parsed.value).toEqual({ summary: 'ok' });
  });

  it('extracts the plan object from a response that carries prose around it', () => {
    const parsed = parsePlanJson('Here is the plan:\n{"summary":"ok"}\nHope that helps.');

    expect(parsed.value).toEqual({ summary: 'ok' });
  });

  it('repairs a response that is wrapped in a markdown fence', () => {
    const parsed = parsePlanJson('```json\n{"summary":"ok"}\n```');

    expect(parsed.value).toEqual({ summary: 'ok' });
  });

  it('fails with a descriptive error when no JSON object is present', () => {
    expect(() => parsePlanJson('I could not produce a plan.')).toThrow(/did not contain a JSON plan/);
  });
});
