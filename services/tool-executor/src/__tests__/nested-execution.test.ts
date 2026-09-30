import { ToolExecutor } from '../services/ToolExecutor';
import { NativeExecutorKey, Tool } from '../types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

/**
 * A skill callee emits its own JSON, so `__execute_tool` hands back
 * `{ success, data, ... }`. Every other callee type returns a raw payload that
 * carries NO `success` key: `reasoning` returns `{ summary, _raw, ... }`, and
 * `native` has `success` stripped by dispatch before it ever reaches the bridge.
 *
 * A skill that checked `result.success` against one of those saw `undefined`,
 * judged a call that had actually succeeded to be a failure, and either spent a
 * redundant fallback call or reported the callee as offline. That is how the
 * Interview & Negotiation Prep skill reported a dead brain while the Brain log
 * showed all four calls OK. The bridge now normalizes those payloads into the
 * same envelope, and these tests pin that behaviour for each callee type.
 */
describe('ToolExecutor normalizes non-skill callee payloads', () => {
  const priorBrainUrl = process.env.BRAIN_URL;

  afterEach(() => {
    if (priorBrainUrl === undefined) delete process.env.BRAIN_URL;
    else process.env.BRAIN_URL = priorBrainUrl;
    jest.restoreAllMocks();
  });

  /** Runs a wrapper that echoes the whole nested result back out. */
  async function nestedResult(
    registry: Map<string, Tool>,
    wrapperSource: string,
  ): Promise<Record<string, unknown>> {
    const executor = new ToolExecutor(registry);
    const wrapper = makeCodeTool('normalize-wrapper', 'Normalize Wrapper', wrapperSource);
    registry.set(wrapper.id, wrapper);
    const exec = await executor.execute(wrapper, {});
    expect(exec.status).toBe('completed');
    return JSON.parse((exec.output as { output: string }).output).result as Record<string, unknown>;
  }

  const echo = 'const r = await __execute_tool(TOOL_ID, INPUT); console.log(JSON.stringify({ success: true, result: r }));';

  function makeReasoningTool(id: string): Tool {
    return {
      id,
      name: `Reasoning ${id}`,
      description: 'A reasoning base tool, like career-interview-prep',
      type: 'reasoning',
      manifest: { type: 'reasoning' },
      reasoningConfig: { promptTemplate: 'Answer {{input}}', maxTokens: 128 },
      createdAt: new Date(),
      updatedAt: new Date(),
      isSkill: false,
    };
  }

  function makeNativeTool(id: string, executorKey: NativeExecutorKey): Tool {
    return {
      id,
      name: `Native ${id}`,
      description: 'A native executor tool',
      type: 'native',
      manifest: { executor: executorKey, basePath: os.tmpdir() },
      createdAt: new Date(),
      updatedAt: new Date(),
      isSkill: false,
    };
  }

  it('gives a reasoning callee a success flag and a data envelope', async () => {
    // The callee runs in-process, so the brain stub is a fetch mock.
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'Five interview questions for the role.', tokensUsed: 120 }),
    } as unknown as Response);

    const registry = new Map<string, Tool>();
    registry.set('prep-tool', makeReasoningTool('prep-tool'));

    const result = await nestedResult(
      registry,
      echo.replace('TOOL_ID', '"prep-tool"').replace('INPUT', '{ targetRole: "CPO" }'),
    );

    // The regression: `success` was undefined, so the caller read a working
    // brain call as a failure.
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.error).toBeNull();
    expect((result.data as { summary?: string }).summary).toContain('Five interview questions');
  });

  it('preserves the reasoning callee raw fields at the top level', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'Negotiation advice.', model: 'test-model', tokensUsed: 90 }),
    } as unknown as Response);

    const registry = new Map<string, Tool>();
    registry.set('advisory-tool', makeReasoningTool('advisory-tool'));

    const result = await nestedResult(
      registry,
      echo.replace('TOOL_ID', '"advisory-tool"').replace('INPUT', '{ targetRole: "CPO" }'),
    );

    // Callers that read the reasoning payload directly must keep working; the
    // envelope is added, not substituted.
    expect((result.data as { _raw?: string })._raw).toBe('Negotiation advice.');
    expect(result._raw).toBe('Negotiation advice.');
  });

  it('reports a failed reasoning callee as success: false', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('brain unreachable'));

    const registry = new Map<string, Tool>();
    registry.set('prep-tool-down', makeReasoningTool('prep-tool-down'));

    const result = await nestedResult(
      registry,
      echo.replace('TOOL_ID', '"prep-tool-down"').replace('INPUT', '{}'),
    );

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/brain unreachable|Brain service unavailable/);
  });

  it('gives a successful native callee a success flag while keeping its raw fields', async () => {
    // FileStorageExecutor reads its root once, at construction, so the env var
    // has to be set before the ToolExecutor (and therefore the executor) is built.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-native-'));
    const priorBase = process.env.FILE_STORAGE_BASE_PATH;
    process.env.FILE_STORAGE_BASE_PATH = dir;
    fs.writeFileSync(path.join(dir, 'note.txt'), 'delegated content', 'utf-8');

    try {
      const registry = new Map<string, Tool>();
      registry.set('files-tool', makeNativeTool('files-tool', 'files'));

      const result = await nestedResult(
        registry,
        echo.replace('TOOL_ID', '"files-tool"').replace('INPUT', '{ operation: "read", path: "note.txt" }'),
      );

      // dispatch strips `success` from a native result before the bridge sees it,
      // so the caller previously saw `undefined` and judged success to be failure.
      expect(result.success).toBe(true);
      expect(result.status).toBe('ok');
      expect(result.data).toBe('delegated content');
      expect(typeof result.durationMs).toBe('number');
    } finally {
      if (priorBase === undefined) delete process.env.FILE_STORAGE_BASE_PATH;
      else process.env.FILE_STORAGE_BASE_PATH = priorBase;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a failed native callee as success: false with its error intact', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-native-'));
    const priorBase = process.env.FILE_STORAGE_BASE_PATH;
    process.env.FILE_STORAGE_BASE_PATH = dir;

    try {
      const registry = new Map<string, Tool>();
      registry.set('files-missing', makeNativeTool('files-missing', 'files'));

      const result = await nestedResult(
        registry,
        echo.replace('TOOL_ID', '"files-missing"').replace('INPUT', '{ operation: "read", path: "absent.txt" }'),
      );

      expect(result.success).toBe(false);
      expect(String(result.error)).toMatch(/File not found/);
    } finally {
      if (priorBase === undefined) delete process.env.FILE_STORAGE_BASE_PATH;
      else process.env.FILE_STORAGE_BASE_PATH = priorBase;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
