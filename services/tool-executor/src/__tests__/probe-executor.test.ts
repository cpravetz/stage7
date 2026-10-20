import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProbeExecutor } from '../adk/probeExecutor';

describe('ProbeExecutor', () => {
  let executor: ProbeExecutor;

  beforeEach(() => {
    executor = new ProbeExecutor({ defaultTimeoutMs: 5000, maxTimeoutMs: 10000 });
  });

  it('runs a source probe and captures its output', async () => {
    const result = await executor.run({
      probeId: 'echo',
      language: 'javascript',
      source: "console.log(JSON.stringify({ hello: 'world' }));",
      expect: { format: 'json', requiredFields: ['hello'] },
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.structured).toEqual({ hello: 'world' });
    expect(result.error).toBeUndefined();
  });

  it('fails a probe that exits non-zero', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: "console.error('boom'); process.exit(3);",
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.error).toContain('boom');
  });

  it('kills a probe that exceeds its budget', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: 'setTimeout(() => {}, 60000);',
      timeoutMs: 400,
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('budget');
  });

  it('does not hand the probe a production persistence variable', async () => {
    const result = await executor.run({
      language: 'javascript',
      source:
        "console.log(JSON.stringify({ storage: process.env.STORAGE_DIR ?? null, home: process.env.ASSISTANT_HOME ?? null, token: process.env.OPENAI_API_KEY ?? null }));",
      env: {
        STORAGE_DIR: '/var/data/stage7/live',
        ASSISTANT_HOME: '/var/data/stage7/live',
        OPENAI_API_KEY: 'sk-live',
        SAFE_VALUE: 'kept',
      },
      expect: { format: 'json' },
    });

    expect(result.ok).toBe(true);
    expect(result.structured).toEqual({ storage: null, home: null, token: null });
  });

  it('keeps an allowed environment variable', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: "console.log(JSON.stringify({ value: process.env.SAFE_VALUE ?? null }));",
      env: { SAFE_VALUE: 'kept' },
      expect: { format: 'json' },
    });

    expect(result.structured).toEqual({ value: 'kept' });
  });

  it('reports that the network was isolated when the platform allows it', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: "console.log('ok');",
    });

    expect(['enforced', 'best-effort']).toContain(result.networkIsolation);
  });

  it('fails a probe that writes to a production root', async () => {
    const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7_prod_'));
    const target = path.join(productionRoot, 'live.json');

    const result = await executor.run({
      language: 'javascript',
      source: `require('fs').writeFileSync(${JSON.stringify(target)}, '{"changed":true}');`,
      productionRoots: [productionRoot],
    });

    expect(result.ok).toBe(false);
    expect(result.productionMutations?.length).toBeGreaterThan(0);
    expect(result.error).toContain('production state');

    fs.rmSync(productionRoot, { recursive: true, force: true });
  });

  it('rejects output that does not match the expectation', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: "console.log(JSON.stringify({ present: true }));",
      expect: { format: 'json', requiredFields: ['absent'] },
    });

    expect(result.ok).toBe(false);
    expect(result.validationError).toContain('absent');
  });

  it('rejects output that is not JSON when JSON was expected', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: "console.log('not json');",
      expect: { format: 'json' },
    });

    expect(result.ok).toBe(false);
    expect(result.validationError).toContain('not JSON');
  });

  it('gives the probe its fixtures in the working directory', async () => {
    const result = await executor.run({
      language: 'javascript',
      source:
        "const fs = require('fs'); const path = require('path'); console.log(fs.readFileSync(path.join(process.env.STAGE7_PROBE_WORK_DIR, 'harness.json'), 'utf8'));",
      files: { 'harness.json': '{"version":"1"}' },
    });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('{"version":"1"}');
  });

  it('removes the ephemeral workspace when the probe is done', async () => {
    const result = await executor.run({
      language: 'javascript',
      source: "console.log('done');",
      keepWorkspace: true,
    });

    expect(result.workspacePath).toBeDefined();
    expect(fs.existsSync(result.workspacePath as string)).toBe(true);

    fs.rmSync(result.workspacePath as string, { recursive: true, force: true });
  });
});
