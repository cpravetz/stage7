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
    expect(parsed.error).toContain('not available');
  });

  it('allows a skill to delegate to another skill', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const callee = makeCodeTool(
      'callee-skill',
      'Callee Skill',
      'console.log(JSON.stringify({ success: true, data: { from: "callee" } }));',
      true,
    );
    registry.set(callee.id, callee);

    const wrapper = makeCodeTool(
      'wrapper-skill',
      'Wrapper Skill',
      'const r = await __execute_tool("callee-skill", {}); console.log(JSON.stringify({ success: true, result: r }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    expect(parsed.result).toEqual({ success: true, data: { from: 'callee' } });
  });

  it('rejects nested call to a skill tool that needs approval', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    // Skills delegate freely; what still needs approval is acting on the user's behalf.
    const skillTool: Tool = {
      ...makeCodeTool('skill-tool', 'Skill Tool', 'console.log("hi");', true),
      confirmBeforeSend: true,
    };
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
    expect(parsed.error).toContain('confirmation');
  });

  it('allows nested call to an approval-gated skill in dry-run mode', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const skillTool: Tool = {
      ...makeCodeTool(
        'skill-tool',
        'Skill Tool',
        'console.log(JSON.stringify({ success: true, data: { dryRun: true } }));',
        true,
      ),
      confirmBeforeSend: true,
    };
    registry.set(skillTool.id, skillTool);

    const wrapper = makeCodeTool(
      'wrapper-skill',
      'Wrapper Skill',
      'const r = await __execute_tool("skill-tool", { dryRun: true }); console.log(JSON.stringify({ success: true, result: r }));',
    );

    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    expect(parsed.result).toEqual({ success: true, data: { dryRun: true } });
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

  it('permits an approved gated parent to reach a gated callee (approval propagates)', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const gatedChild: Tool = {
      ...makeCodeTool(
        'gated-child',
        'Gated Child',
        'console.log(JSON.stringify({ success: true, data: { sent: true } }));',
        true,
      ),
      confirmBeforeSend: true,
    };
    registry.set(gatedChild.id, gatedChild);

    const gatedParent: Tool = {
      ...makeCodeTool(
        'gated-parent',
        'Gated Parent',
        'const r = await __execute_tool("gated-child", { message: "hello" }); console.log(JSON.stringify({ success: true, result: r }));',
        true,
      ),
      confirmBeforeSend: true,
    };

    // The parent cleared its own gate, so the nested gated call is approved too.
    const exec = await executor.execute(gatedParent, { confirmation: true });
    expect(exec.status).toBe('completed');
    const output = exec.output as { output?: string };
    const parsed = JSON.parse(output.output as string);
    // Not merely "not refused": the callee really ran and returned its own result.
    expect(parsed.result).toEqual({ success: true, data: { sent: true } });
  });

  it('still refuses a live nested call into a gated callee when the parent was not approved', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const gatedChild: Tool = {
      ...makeCodeTool(
        'gated-child-unapproved',
        'Gated Child Unapproved',
        'console.log(JSON.stringify({ success: true, data: { sent: true } }));',
        true,
      ),
      confirmBeforeSend: true,
    };
    registry.set(gatedChild.id, gatedChild);

    const gatedParent: Tool = {
      ...makeCodeTool(
        'gated-parent-unapproved',
        'Gated Parent Unapproved',
        'const r = await __execute_tool("gated-child-unapproved", { message: "hello" }); console.log(JSON.stringify({ success: true, result: r }));',
        true,
      ),
      confirmBeforeSend: true,
    };

    // Nothing has approved this execution, so the parent's own gate fires first.
    await expect(executor.execute(gatedParent, {})).rejects.toThrow(/confirmation/i);

    // A non-gated parent that has not been approved is refused at the nested layer,
    // and the gated callee never runs.
    const wrapper = makeCodeTool(
      'ungated-wrapper',
      'Ungated Wrapper',
      'const r = await __execute_tool("gated-child-unapproved", { message: "hello" }); console.log(JSON.stringify({ success: false, error: r.error }));',
    );
    const wrapperExec = await executor.execute(wrapper, {});
    expect(wrapperExec.status).toBe('completed');
    const wrapperOutput = wrapperExec.output as { output?: string };
    const wrapperParsed = JSON.parse(wrapperOutput.output as string);
    expect(wrapperParsed.success).toBe(false);
    expect(wrapperParsed.error).toContain('Nested execution requires confirmation for gated-child-unapproved');
  });

  it('does not let an earlier approved execution approve a later unapproved one', async () => {
    const registry = new Map<string, Tool>();
    const executor = new ToolExecutor(registry);

    const gatedChild: Tool = {
      ...makeCodeTool(
        'gated-child-leak',
        'Gated Child Leak',
        'console.log(JSON.stringify({ success: true, data: { sent: true } }));',
        true,
      ),
      confirmBeforeSend: true,
    };
    registry.set(gatedChild.id, gatedChild);

    const gatedParent: Tool = {
      ...makeCodeTool(
        'gated-parent-leak',
        'Gated Parent Leak',
        'const r = await __execute_tool("gated-child-leak", { message: "hello" }); console.log(JSON.stringify({ success: true, result: r }));',
        true,
      ),
      confirmBeforeSend: true,
    };

    const approved = await executor.execute(gatedParent, { confirmation: true });
    expect(approved.status).toBe('completed');
    expect(JSON.parse((approved.output as { output: string }).output).result)
      .toEqual({ success: true, data: { sent: true } });

    // The previous run's approval must not survive into this one.
    const wrapper = makeCodeTool(
      'ungated-wrapper-leak',
      'Ungated Wrapper Leak',
      'const r = await __execute_tool("gated-child-leak", { message: "hello" }); console.log(JSON.stringify({ success: false, error: r.error }));',
    );
    const wrapperExec = await executor.execute(wrapper, {});
    const wrapperParsed = JSON.parse((wrapperExec.output as { output: string }).output);
    expect(wrapperParsed.success).toBe(false);
    expect(wrapperParsed.error).toContain('Nested execution requires confirmation for gated-child-leak');
  });
});
