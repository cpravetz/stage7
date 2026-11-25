import fs from 'fs';
import os from 'os';
import path from 'path';

import { ToolDispatcher } from '../src/services/ToolDispatcher';
import { ToolConfigResolver } from '../src/services/ToolConfig';
import {
  EXECUTOR_BINDINGS,
  reconciliationProvider,
  resolveNativeBinding,
} from '../src/services/ExecutorBindings';
import type { Tool } from '../src/types';

describe('reconciliationProvider (manifest data only)', () => {
  it.each([
    [{ executor: 'email' }, 'email'],
    [{ executor: 'webhook' }, 'webhook'],
    [{ executor: 'api_client' }, 'api_client'],
    [{ executor: 'vendor' }, 'vendor'],
    [{ executor: 'database' }, 'unknown'],
  ] as Array<[Record<string, unknown>, string]>)(
    'manifest %j classifies as %s',
    (manifest, expected) => {
      expect(reconciliationProvider(manifest)).toBe(expected);
    },
  );

  it('does not classify by tool name', () => {
    // Regression (finding 14): a tool named "email-template-renderer" never
    // sent mail, but the name fallback labeled it an SMTP provider and gave
    // its lost responses SMTP-specific reconciliation guidance.
    const manifest = { language: 'javascript' };
    expect(reconciliationProvider(manifest)).toBe('unknown');
    expect(reconciliationProvider(undefined)).toBe('unknown');
  });
});

describe('resolveNativeBinding', () => {
  it('a declared executor key selects its binding, even against the tool name', () => {
    const binding = resolveNativeBinding({ executor: 'search' }, ['send']);
    expect(binding).toBe(EXECUTOR_BINDINGS.search);
  });

  it('capability declarations select the binding for un-keyed manifests', () => {
    expect(resolveNativeBinding({}, ['query'])?.label).toBe('database');
    expect(resolveNativeBinding(undefined, ['read'])?.label).toBe('file');
    expect(resolveNativeBinding(undefined, ['write'])?.label).toBe('file');
    expect(resolveNativeBinding({}, ['send'])?.label).toBe('email');
    expect(resolveNativeBinding({}, ['search'])?.label).toBe('search');
  });

  it('the email-mcp server declaration selects the email binding', () => {
    expect(resolveNativeBinding({ server: 'email-mcp' }, [])?.label).toBe('email');
  });

  it('a manifest declaring no data resolves to no binding', () => {
    expect(resolveNativeBinding({}, [])).toBeUndefined();
    expect(resolveNativeBinding(undefined, [])).toBeUndefined();
  });

  it('keeps the former chain order when several capabilities match', () => {
    // 'query' resolved to database before 'read' resolved to files.
    expect(resolveNativeBinding({}, ['query', 'read'])?.label).toBe('database');
  });
});

describe('binding payload mappings', () => {
  it('email maps body onto text and defaults attachments', () => {
    const payload = EXECUTOR_BINDINGS.email!.buildInput(
      { to: 'a@example.org', body: 'hello', subject: 's' },
      undefined,
    );
    expect(payload).toMatchObject({ to: 'a@example.org', text: 'hello', subject: 's', attachments: [] });
  });

  it('email falls back from body to text without losing html/from', () => {
    const payload = EXECUTOR_BINDINGS.email!.buildInput(
      { to: 'a@example.org', text: 'plain', html: '<p>hi</p>', from: 'noreply@example.org' },
      undefined,
    );
    expect(payload).toMatchObject({ text: 'plain', html: '<p>hi</p>', from: 'noreply@example.org' });
  });

  it('database applies engine/query/timeout defaults', () => {
    const payload = EXECUTOR_BINDINGS.database!.buildInput({ query: 'SELECT 1' }, undefined);
    expect(payload).toMatchObject({ engine: 'sqlite', query: 'SELECT 1', timeoutMs: 30000, params: undefined });
  });

  it('search falls back to q and max_results, and counts results', () => {
    const payload = EXECUTOR_BINDINGS.search!.buildInput({ q: 'stage7', max_results: 5 }, undefined);
    expect(payload).toMatchObject({ query: 'stage7', maxResults: 5, searchType: 'web' });
    expect(EXECUTOR_BINDINGS.search!.mapOutput({ results: [1, 2, 3] })).toEqual({ results: [1, 2, 3], count: 3 });
  });

  it('vendor reads its identity from the manifest, never the tool name', () => {
    const payload = EXECUTOR_BINDINGS.vendor!.buildInput(
      { operation: 'query_issues' },
      { vendor: 'jira' },
    );
    expect(payload).toMatchObject({ vendor: 'jira', operation: 'query_issues' });
  });
});

describe('dispatcher routes un-keyed capability tools through their binding', () => {
  const executor = new ToolDispatcher(null, new Map(), new ToolConfigResolver(new Map()), async () => ({}));

  const echoedModule = 'module.exports.execute = async (input) => ({ success: true, reconciliation: { echoed: input } });';

  function tempTool(manifest: Record<string, unknown>): { tool: Tool; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-binding-'));
    const codeFile = path.join(dir, 'echo.js');
    fs.writeFileSync(codeFile, echoedModule);
    return {
      tool: {
        id: 'binding-probe',
        name: 'Bulk Notifier',
        description: 'probe',
        type: 'native',
        manifest: { ...manifest, codeFile },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
    };
  }

  it('a manifest declaring capabilities: [send] keeps its email dispatch path', async () => {
    const { tool, cleanup } = tempTool({ capabilities: ['send'] });
    try {
      const result = await executor.dispatch(tool, { to: 'a@example.org', body: 'hello' }, { resolved: {}, sources: [] });
      expect(result).toMatchObject({ status: 'sent' });
      // The email mapping reached the module: body became text, attachments defaulted.
      expect((result.reconciliation as { echoed: Record<string, unknown> }).echoed)
        .toMatchObject({ text: 'hello', attachments: [] });
    } finally {
      cleanup();
    }
  });

  it('a tool whose manifest declares nothing is not routed by its name', async () => {
    const { tool, cleanup } = tempTool({});
    try {
      // 'Bulk Notifier' contains neither an executor key nor a capability —
      // dispatch must fall through to discovery/plugin generation (stubbed
      // out here), not guess from the name.
      (executor as unknown as { toolDiscovery: { discoverAndRegister: () => Promise<undefined> } }).toolDiscovery =
        { discoverAndRegister: async () => undefined };
      (executor as unknown as { pluginGenerator: { generate: () => Promise<{ success: false }> } }).pluginGenerator =
        { generate: async () => ({ success: false }) };

      const result = await executor.dispatch(tool, { to: 'a@example.org' }, { resolved: {}, sources: [] });
      expect(result.output).toEqual({ error: 'Unsupported tool type: native. Register a real executor or MCP server for this tool.' });
      // The email binding never ran: no module execution, no mapped output.
      expect(result.reconciliation).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('a binding-matched tool without a code file names the binding in the error', async () => {
    const tool: Tool = {
      id: 'binding-probe-no-file',
      name: 'Bulk Notifier',
      description: 'probe',
      type: 'native',
      manifest: { capabilities: ['send'] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await executor.dispatch(tool, {}, { resolved: {}, sources: [] });
    expect(result).toEqual({ output: { error: "No code file resolved for email tool 'Bulk Notifier'" } });
  });
});
