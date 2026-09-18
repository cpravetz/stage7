import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';

function makeCodeTool(id: string, name: string, source: string, isSkill = false): Tool {
  return {
    id,
    name,
    description: `Tool ${name}`,
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: source },
    isSkill,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ToolExecutor nested execution via CodeExecutor callback', () => {
  it('wrapper code tool can call a registered base tool and receives parsed structured output', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const baseTool = makeCodeTool(
      'base-tool',
      'Base Tool',
      'console.log(JSON.stringify({ success: true, data: { value: 42 } }));',
    );
    registry.set(baseTool.id, baseTool);

    const wrapper = makeCodeTool(
      'wrapper-tool',
      'Wrapper Tool',
      'const r = await __execute_tool("base-tool", {}); console.log(JSON.stringify({ success: true, result: r }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    expect(output.output).toBeDefined();
    const parsed = JSON.parse(output.output as string);
    expect(parsed.success).toBe(true);
    expect(parsed.result).toEqual({ success: true, data: { value: 42 } });
  });

  it('rejects nested call to a missing tool', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const wrapper = makeCodeTool(
      'wrapper-missing',
      'Wrapper Missing',
      'const r = await __execute_tool("does-not-exist", {}); console.log(JSON.stringify({ success: false, error: r.error }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Tool not found');
  });

  it('rejects nested call to a skill tool', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const skillTool = makeCodeTool('skill-tool', 'Skill Tool', 'console.log("hi");', true);
    registry.set(skillTool.id, skillTool);

    const wrapper = makeCodeTool(
      'wrapper-skill',
      'Wrapper Skill',
      'const r = await __execute_tool("skill-tool", {}); console.log(JSON.stringify({ success: false, error: r.error }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('skill tools');
  });

  it('resolves callee by name when id is not registered', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const baseTool = makeCodeTool('base-by-id', 'BaseByName Tool', 'console.log(JSON.stringify({ success: true, data: { from: "name" } }));');
    registry.set(baseTool.id, baseTool);

    const wrapper = makeCodeTool(
      'wrapper-name',
      'Wrapper Name',
      'const r = await __execute_tool("BaseByName Tool", {}); console.log(JSON.stringify({ success: true, result: r }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    expect(parsed.result).toEqual({ success: true, data: { from: 'name' } });
  });

  it('enforces maximum nesting depth', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    // Build a chain of 6 wrappers each calling the next by name.
    for (let i = 0; i < 6; i++) {
      const id = `chain-${i}`;
      const name = `Chain Tool ${i}`;
      const calleeName = `Chain Tool ${i + 1}`;
      const source = i < 5
        ? `const r = await __execute_tool(${JSON.stringify(calleeName)}, {}); console.log(JSON.stringify({ success: true, depth: ${i}, result: r }));`
        : `console.log(JSON.stringify({ success: true, depth: 5, leaf: true }));`;
      registry.set(id, makeCodeTool(id, name, source));
    }

    const exec = await executor.execute(registry.get('chain-0')!, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    // Depth 0 -> 1 -> 2 -> 3 -> 4 is allowed (5 levels), depth 5 should be rejected.
    // The rejection is nested at depth 4's result.
    const deepest = parsed.result.result.result.result.result;
    expect(deepest.success).toBe(false);
    expect(deepest.error).toContain('Maximum nesting depth');
  });

  it('parses JSON-string execution.output into an object', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    // Base tool returns output that is itself a JSON string.
    const baseTool = makeCodeTool(
      'base-json',
      'Base Json',
      'console.log(JSON.stringify({ success: true, data: { value: 42 } }));',
    );
    registry.set(baseTool.id, baseTool);

    const wrapper = makeCodeTool(
      'wrapper-json',
      'Wrapper Json',
      'const r = await __execute_tool("base-json", {}); console.log(JSON.stringify({ success: true, result: r }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    expect(parsed.result).toEqual({ success: true, data: { value: 42 } });
  });

  it('cleans up pending credential overrides after nested call', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const baseTool = makeCodeTool(
      'base-cleanup',
      'Base Cleanup',
      'console.log(JSON.stringify({ success: true, data: { ok: true } }));',
    );
    registry.set(baseTool.id, baseTool);

    const wrapper = makeCodeTool(
      'wrapper-cleanup',
      'Wrapper Cleanup',
      'const r = await __execute_tool("base-cleanup", {}); console.log(JSON.stringify({ success: true, result: r }));',
    );

    // Inject a fake override to ensure it is removed after nested execution.
    const overrides = (executor as unknown as { pendingCredentialOverrides: Map<string, Record<string, string>> }).pendingCredentialOverrides;
    overrides.set('base-cleanup', { token: 'x' });

    await executor.execute(wrapper, {});

    expect(overrides.get('base-cleanup')).toBeUndefined();
  });
});
