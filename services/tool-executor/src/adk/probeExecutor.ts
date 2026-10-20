/**
 * ProbeExecutor — the sandbox a harness candidate is judged in.
 *
 * The Harness² inner loop proposes an edit, and the edit is only worth
 * composing if it survives contact with reality. "Contact with reality" has to
 * happen somewhere that is not production: a probe that writes to the live
 * store, or calls out to a live API, has changed the world it was supposed to
 * be reasoning about, and the evidence it produces is then worthless.
 *
 * So a probe runs in an ephemeral workspace with:
 *
 *   - an empty working directory that is deleted when the run ends
 *   - an environment built from an allowlist, not inherited — no production
 *     persistence variables, no credentials, nothing that names a live store
 *   - the network off by default, enforced with a network namespace where the
 *     platform allows it
 *   - a wall-clock budget and an output cap, both enforced by killing the
 *     process group
 *   - a check afterwards that the production roots named by the caller were not
 *     written to
 *
 * The read-only guarantee is mode-based, not a kernel sandbox: input fixtures
 * are written 0444 and the workspace is disposable. That is "read-only where
 * possible" — enough to keep a probe from corrupting the fixture it was given,
 * not enough to survive a probe that deliberately tries to escape.
 */

import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '@stage7-nextgen/shared';

export type ProbeLanguage = 'javascript' | 'typescript' | 'python' | 'shell';

export interface ProbeExpectation {
  /** `json` parses stdout as JSON before the probe can pass. */
  format: 'json' | 'text';
  /** Dot-separated paths that must be present in the parsed output. */
  requiredFields?: string[];
}

export interface ProbeSpec {
  /** Stable id, echoed into the evidence log. */
  probeId?: string;
  language?: ProbeLanguage;
  /** Inline program text. Written into the ephemeral workspace and run there. */
  source?: string;
  /** Explicit program. Mutually exclusive with `source`. */
  command?: string;
  args?: string[];
  /** Files materialised into the workspace as read-only inputs. */
  files?: Record<string, string>;
  /** Environment variables to expose, by name. Names are checked, not trusted. */
  env?: Record<string, string>;
  /** Wall-clock budget. Default 15s, capped at 60s. */
  timeoutMs?: number;
  /** Network access. `off` (the default) isolates the run. */
  network?: 'off' | 'on';
  /** Fail the probe outright when the network could not be isolated. */
  requireNetworkIsolation?: boolean;
  /** Exit codes that count as success. Default `[0]`. */
  successExitCodes?: number[];
  expect?: ProbeExpectation;
  /** Directories that must be untouched by the run. */
  productionRoots?: string[];
  /** Keep the ephemeral workspace on disk, for debugging a failed probe. */
  keepWorkspace?: boolean;
}

export interface ProbeResult {
  probeId: string;
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  /**
   * `enforced` when the run happened in a network namespace, `best-effort` when
   * the platform refused one and only the proxy black-hole is standing between
   * the probe and the network.
   */
  networkIsolation: 'enforced' | 'best-effort';
  workspacePath?: string;
  /** Parsed stdout, when the probe was expected to emit JSON. */
  structured?: unknown;
  error?: string;
  validationError?: string;
  /** Production paths the run wrote to. Any entry fails the probe. */
  productionMutations?: string[];
  warnings: string[];
}

export interface ProbeExecutorOptions {
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
  /** Where the ephemeral workspaces are created. Defaults to the OS temp dir. */
  rootDir?: string;
}

/**
 * Environment names a probe never receives, however the caller asks.
 *
 * The base environment is *not* inherited, so these are the names that would
 * slip back in through an explicit allowlist entry. Two groups matter: the
 * persistence variables that point a run at a live store, and anything that
 * looks like a credential.
 */
const BLOCKED_ENV_PATTERNS: RegExp[] = [
  /^STORAGE_DIR$/i,
  /_HOME$/i,
  /^VAULT_/i,
  /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|CREDENTIALS?)$/i,
  /^(AWS|OPENAI|ANTHROPIC|GOOGLE|AZURE|GCP|STRIPE|SLACK|GITHUB|GITLAB)_/i,
  /^(DATABASE_URL|MONGO_?URI|REDIS_URL)$/i,
];

/** A routable-looking address that nothing listens on. */
const BLACKHOLE_PROXY = 'http://127.0.0.1:9';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export class ProbeExecutor {
  private readonly defaultTimeoutMs: number;
  private readonly maxTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly rootDir: string;
  /** `null` until the platform has been asked whether it can isolate the network. */
  private networkIsolationSupported: boolean | null = null;

  constructor(options: ProbeExecutorOptions = {}) {
    this.defaultTimeoutMs = Math.min(
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      options.maxTimeoutMs ?? MAX_TIMEOUT_MS,
    );
    this.maxTimeoutMs = options.maxTimeoutMs ?? MAX_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    this.rootDir = options.rootDir ?? os.tmpdir();
  }

  /**
   * Runs one probe and reports what came out.
   *
   * Never throws: a probe that cannot start is a failed probe, not a failed
   * call, because the caller is deciding whether to accept an edit and a
   * thrown error would skip that decision.
   */
  async run(spec: ProbeSpec): Promise<ProbeResult> {
    const probeId = spec.probeId ?? `probe_${randomUUID()}`;
    const startedAt = Date.now();
    const warnings: string[] = [];

    const workspace = this.createWorkspace();
    const workDir = path.join(workspace, 'work');
    const inputDir = path.join(workspace, 'in');
    const outputDir = path.join(workspace, 'out');
    const tmpDir = path.join(workspace, 'tmp');

    const base: ProbeResult = {
      probeId,
      ok: false,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      timedOut: false,
      truncated: false,
      networkIsolation: 'best-effort',
      warnings,
    };

    try {
      fs.mkdirSync(workDir, { recursive: true });
      fs.mkdirSync(inputDir, { recursive: true });
      fs.mkdirSync(outputDir, { recursive: true });
      fs.mkdirSync(tmpDir, { recursive: true });

      // The read-only copy lives in `in/`; the working directory gets an
      // ordinary copy so a probe that rewrites its own input still behaves the
      // way a script normally does.
      this.materialiseInputs(spec.files ?? {}, inputDir, { readOnly: true });
      this.materialiseInputs(spec.files ?? {}, workDir, { readOnly: false });

      const invocation = this.resolveInvocation(spec, workDir);
      if ('error' in invocation) {
        return { ...base, error: invocation.error, durationMs: Date.now() - startedAt };
      }

      const networkIsolation = spec.network === 'on' ? 'best-effort' : this.resolveNetworkIsolation();
      if (spec.network !== 'on' && networkIsolation === 'best-effort') {
        warnings.push(
          'the platform refused a network namespace; the probe ran with proxy black-holes only',
        );
      }
      if (spec.requireNetworkIsolation && networkIsolation !== 'enforced') {
        return {
          ...base,
          networkIsolation,
          error: 'network isolation was required but the platform could not provide it',
          durationMs: Date.now() - startedAt,
        };
      }

      const env = this.buildEnv(spec, { workspace, workDir, inputDir, outputDir, tmpDir, probeId });
      const timeoutMs = Math.min(spec.timeoutMs ?? this.defaultTimeoutMs, this.maxTimeoutMs);

      const run = await this.spawnProbe(invocation.argv, {
        cwd: workDir,
        env,
        timeoutMs,
        networkIsolation,
      });

      const result: ProbeResult = {
        ...base,
        exitCode: run.exitCode,
        signal: run.signal,
        stdout: run.stdout,
        stderr: run.stderr,
        timedOut: run.timedOut,
        truncated: run.truncated,
        networkIsolation,
        durationMs: Date.now() - startedAt,
      };

      const successExitCodes = spec.successExitCodes ?? [0];
      if (result.timedOut) {
        result.error = `the probe exceeded its ${timeoutMs}ms budget and was killed`;
      } else if (run.exitCode === null || !successExitCodes.includes(run.exitCode)) {
        result.error = run.stderr.trim() || `the probe exited with code ${run.exitCode}`;
      } else {
        // The exit code says the program ran; whether it demonstrated anything
        // is settled by the output expectation below.
        result.ok = true;
      }

      const mutations = this.findProductionMutations(spec.productionRoots ?? [], startedAt);
      if (mutations.length > 0) {
        result.productionMutations = mutations;
        result.ok = false;
        result.error = `the probe wrote to production state: ${mutations.slice(0, 5).join(', ')}`;
      }

      if (result.ok) {
        const validation = this.validateOutput(run.stdout, spec.expect);
        if (validation.error) {
          result.ok = false;
          result.validationError = validation.error;
        } else {
          result.structured = validation.structured;
        }
      }

      if (spec.keepWorkspace) {
        result.workspacePath = workspace;
      }

      return result;
    } catch (error) {
      return {
        ...base,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      };
    } finally {
      if (!spec.keepWorkspace) this.removeWorkspace(workspace);
    }
  }

  /**
   * Writes the probe's inputs.
   */
  private materialiseInputs(
    files: Record<string, string>,
    dir: string,
    options: { readOnly?: boolean } = {},
  ): void {
    const readOnly = options.readOnly ?? true;
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content ?? '', { mode: readOnly ? 0o444 : 0o644 });
    }
  }

  /**
   * Works out what to actually execute.
   *
   * Source probes are written into the workspace and run with the interpreter
   * that matches the declared language. Command probes are run as given, which
   * is why the command form belongs to a registered probe and not to an inline
   * request.
   */
  private resolveInvocation(
    spec: ProbeSpec,
    workDir: string,
  ): { argv: string[] } | { error: string } {
    const language = spec.language ?? (spec.source !== undefined ? 'javascript' : 'shell');

    if (spec.source !== undefined) {
      switch (language) {
        case 'javascript': {
          fs.writeFileSync(path.join(workDir, 'probe.js'), spec.source, { mode: 0o644 });
          return { argv: ['node', 'probe.js'] };
        }
        case 'typescript': {
          fs.writeFileSync(path.join(workDir, 'probe.ts'), spec.source, { mode: 0o644 });
          const nodeMajor = Number(process.versions.node.split('.')[0]);
          if (nodeMajor >= 22) {
            return { argv: ['node', '--experimental-strip-types', 'probe.ts'] };
          }
          const tsx = this.resolveTsx();
          if (tsx) return { argv: ['node', tsx, 'probe.ts'] };
          return {
            error:
              'typescript probes need Node 22 or the `tsx` runner; neither is available in this runtime',
          };
        }
        case 'python': {
          fs.writeFileSync(path.join(workDir, 'probe.py'), spec.source, { mode: 0o644 });
          return { argv: ['python3', 'probe.py'] };
        }
        case 'shell': {
          fs.writeFileSync(path.join(workDir, 'probe.sh'), spec.source, { mode: 0o644 });
          return { argv: ['/bin/sh', 'probe.sh'] };
        }
        default:
          return { error: `unsupported probe language: ${String(language)}` };
      }
    }

    if (spec.command) {
      return { argv: [spec.command, ...(spec.args ?? [])] };
    }

    return { error: 'the probe declares neither a source nor a command' };
  }

  private resolveTsx(): string | null {
    const candidates = [
      path.resolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs'),
      path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Builds the probe's environment.
   *
   * Nothing is inherited. The base set is the handful of variables a program
   * needs to run at all, and the caller's own variables are added only when
   * the name survives {@link BLOCKED_ENV_PATTERNS}.
   */
  private buildEnv(
    spec: ProbeSpec,
    dirs: {
      workspace: string;
      workDir: string;
      inputDir: string;
      outputDir: string;
      tmpDir: string;
      probeId: string;
    },
  ): Record<string, string> {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: dirs.workspace,
      TMPDIR: dirs.tmpDir,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      NODE_ENV: 'production',
      PYTHONDONTWRITEBYTECODE: '1',
      STAGE7_PROBE: '1',
      STAGE7_PROBE_ID: dirs.probeId,
      STAGE7_PROBE_WORK_DIR: dirs.workDir,
      STAGE7_PROBE_INPUT_DIR: dirs.inputDir,
      STAGE7_PROBE_OUTPUT_DIR: dirs.outputDir,
    };

    for (const [name, value] of Object.entries(spec.env ?? {})) {
      if (BLOCKED_ENV_PATTERNS.some((pattern) => pattern.test(name))) {
        // The caller's allowlist is a request, not a grant: a name that points
        // at a live store or a credential is dropped whatever the request says.
        logger.warn(
          { probeId: dirs.probeId, envName: name },
          'Blocked an environment name the probe asked for',
        );
        continue;
      }
      env[name] = String(value);
    }

    if (spec.network !== 'on') {
      env.HTTP_PROXY = BLACKHOLE_PROXY;
      env.HTTPS_PROXY = BLACKHOLE_PROXY;
      env.http_proxy = BLACKHOLE_PROXY;
      env.https_proxy = BLACKHOLE_PROXY;
      env.NO_PROXY = '';
    }

    return env;
  }

  /**
   * Asks the platform once whether it can give the probe its own network
   * namespace. The answer is cached: the probe is not the thing being measured.
   */
  private resolveNetworkIsolation(): 'enforced' | 'best-effort' {
    if (this.networkIsolationSupported === null) {
      this.networkIsolationSupported = this.probeNetworkIsolation();
    }
    return this.networkIsolationSupported ? 'enforced' : 'best-effort';
  }

  private probeNetworkIsolation(): boolean {
    try {
      const check = spawnSync('unshare', ['--map-root-user', '--net', '--', 'true'], {
        timeout: 5000,
        stdio: 'ignore',
      });
      return check.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Spawns the probe and reads it out.
   *
   * The child is its own process group so the timeout kills the whole tree: a
   * probe that forked a helper must not leave that helper running after the
   * budget expired.
   */
  private spawnProbe(
    argv: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      timeoutMs: number;
      networkIsolation: 'enforced' | 'best-effort';
    },
  ): Promise<{
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    truncated: boolean;
  }> {
    return new Promise((resolve) => {
      // A network namespace is only entered when the platform can provide one;
      // otherwise the proxy black-hole in the environment is what stands
      // between the probe and the network.
      const finalArgv =
        options.networkIsolation === 'enforced'
          ? ['unshare', '--map-root-user', '--net', '--', ...argv]
          : argv;

      let child: ChildProcess;
      try {
        child = spawn(finalArgv[0], finalArgv.slice(1), {
          cwd: options.cwd,
          env: options.env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolve({
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false,
          truncated: false,
        });
        return;
      }

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      let timedOut = false;
      let settled = false;

      const finish = (payload: {
        exitCode: number | null;
        signal: string | null;
        stdout: string;
        stderr: string;
        timedOut: boolean;
        truncated: boolean;
      }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(payload);
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        const bytes = chunk.length;
        if (stdoutBytes + bytes > this.maxOutputBytes) {
          truncated = true;
          this.killTree(child);
          return;
        }
        stdoutBytes += bytes;
        stdout += chunk.toString('utf8');
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const bytes = chunk.length;
        if (stderrBytes + bytes > this.maxOutputBytes) {
          truncated = true;
          this.killTree(child);
          return;
        }
        stderrBytes += bytes;
        stderr += chunk.toString('utf8');
      });

      const timer = setTimeout(() => {
        timedOut = true;
        this.killTree(child);
      }, options.timeoutMs);

      child.on('error', (error) => {
        finish({
          exitCode: null,
          signal: null,
          stdout,
          stderr: stderr || error.message,
          timedOut,
          truncated,
        });
      });

      child.on('close', (code, signal) => {
        finish({ exitCode: code, signal, stdout, stderr, timedOut, truncated });
      });
    });
  }

  private killTree(child: ChildProcess): void {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process is already gone.
      }
    }
  }

  /**
   * Finds anything under the production roots that the run wrote to.
   *
   * A file's modification time is the only witness available from outside the
   * probe, and it is enough: a probe that wrote to a live store leaves a file
   * behind with a modification time inside the probe's window.
   */
  private findProductionMutations(roots: string[], startedAt: number): string[] {
    const mutations: string[] = [];
    const threshold = startedAt - 5;
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      this.scanForMutations(root, threshold, mutations);
    }
    return mutations;
  }

  private scanForMutations(target: string, threshold: number, found: string[]): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      let entries: string[];
      try {
        entries = fs.readdirSync(target);
      } catch {
        return;
      }
      for (const entry of entries) {
        this.scanForMutations(path.join(target, entry), threshold, found);
      }
      return;
    }
    if (stat.mtimeMs >= threshold) found.push(target);
  }

  /**
   * Checks the probe's output against what the caller said to expect.
   *
   * A probe that exits zero but prints nothing useful has not demonstrated
   * anything, so the expectation is part of the pass condition rather than a
   * courtesy.
   */
  private validateOutput(
    stdout: string,
    expect?: ProbeExpectation,
  ): { structured?: unknown; error?: string } {
    if (!expect) return {};
    if (expect.format === 'text') return {};

    const text = stdout.trim();
    if (!text) {
      return { error: 'the probe was expected to print JSON and printed nothing' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return {
        error: `the probe output is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const missing = (expect.requiredFields ?? []).filter(
      (field) => readPath(parsed, field) === undefined,
    );
    if (missing.length > 0) {
      return { structured: parsed, error: `the probe output is missing: ${missing.join(', ')}` };
    }

    return { structured: parsed };
  }

  private createWorkspace(): string {
    fs.mkdirSync(this.rootDir, { recursive: true });
    return fs.mkdtempSync(path.join(this.rootDir, 'stage7_probe_'));
  }

  private removeWorkspace(workspace: string): void {
    try {
      // Fixtures are written 0444, so the tree has to be made writable again
      // before it can be unlinked.
      this.makeWritable(workspace);
      fs.rmSync(workspace, { recursive: true, force: true });
    } catch (error) {
      logger.warn(
        { workspace, err: error instanceof Error ? error.message : String(error) },
        'Could not remove the probe workspace',
      );
    }
  }

  private makeWritable(target: string): void {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(target);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      try {
        fs.chmodSync(target, 0o755);
      } catch {
        // Best effort.
      }
      let entries: string[];
      try {
        entries = fs.readdirSync(target);
      } catch {
        return;
      }
      for (const entry of entries) this.makeWritable(path.join(target, entry));
      return;
    }
    try {
      fs.chmodSync(target, 0o644);
    } catch {
      // Best effort.
    }
  }
}

function readPath(value: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, value);
}
