import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, NamedCredentialSource } from '../services/CredentialProvider';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { STORE_WRITE_LOG } from '../adk/events';
import type { StoreWrite } from '../adk/events';

export interface CodeExecutionOptions {
  language: 'javascript' | 'typescript' | 'python';
  code: string;
  timeoutMs?: number;
  isolated?: boolean;
  httpMocks?: IsolatedHttpMock[];
  stdin?: string;
  input?: Record<string, unknown>;
  /**
   * Resolved Skill configuration (the values declared in the Skill's
   * configSchema). Injected alongside `input` so a handler can read the settings
   * it was configured with. Without this, configSchema was only ever a
   * presence gate: the values were checked for existence and then unreachable
   * from the handler.
   */
  config?: Record<string, unknown>;
  /**
   * Credentials the executor's provider already resolved for this run, keyed by
   * the logical key the Skill declared in `manifest.credentialSource`. Injected so
   * a handler reads secrets from the credential provider rather than from
   * process.env.
   */
  credentials?: Record<string, string | undefined>;
  // Optional environment variable name that tools use to persist state (e.g. 'ASSISTANT_HOME')
  persistenceEnvVar?: string;
  // Optional callback for tool execution bridge
  executorCallback?: (toolId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface IsolatedHttpMock {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  urlPattern: string;
  expectedRequestBody?: string;
  responseStatus: number;
  responseHeaders?: Record<string, string>;
  responseBody: Record<string, unknown>;
}

export interface CodeExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  durationMs?: number;
  /**
   * Instance data this run wrote, as reported by the Skill's own `ctx.store`.
   *
   * Present only on success: a run that wrote records and then failed changed
   * something this executor will not vouch for, and the event layer is what decides
   * whether to announce it.
   */
  storeWrites?: StoreWrite[];
}

export interface CodeExecutorCredentials {
  resolved: ToolCredentials;
  sources: NamedCredentialSource[];
}

function isolatedCommand(
  executable: string,
  args: string[],
  sandboxDir: string,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const bwrapPath = '/usr/bin/bwrap';
  const prlimitPath = '/usr/bin/prlimit';
  if (process.platform !== 'linux' || !fs.existsSync(bwrapPath) || !fs.existsSync(prlimitPath)) {
    throw new Error('Isolated plugin testing requires Linux bubblewrap and prlimit; refusing to run without network and resource isolation.');
  }
  if (!fs.existsSync('/usr')) {
    throw new Error('Isolated plugin test runtime mounts are unavailable.');
  }

  const executablePath = path.isAbsolute(executable)
    ? executable
    : (process.env.PATH || '').split(path.delimiter)
      .map((directory) => path.join(directory, executable))
      .find((candidate) => fs.existsSync(candidate));
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error(`Isolated plugin test runtime '${executable}' is unavailable.`);
  }
  const runtimePath = fs.realpathSync(executablePath);
  const isPythonRuntime = /python/i.test(path.basename(runtimePath));
  const runtimeArgs = args.map((arg) => arg.startsWith(`${sandboxDir}${path.sep}`)
    ? path.posix.join('/work', path.relative(sandboxDir, arg).split(path.sep).join(path.posix.sep))
    : arg);
  const libraryMounts = ['/lib', '/lib64'].flatMap((directory) =>
    fs.existsSync(directory) ? ['--ro-bind', directory, directory] : [],
  );
  const loaderCacheMount = fs.existsSync('/etc/ld.so.cache')
    ? ['--ro-bind', '/etc/ld.so.cache', '/etc/ld.so.cache']
    : [];
  const bubblewrapArgs = [
    '--unshare-net',
    '--unshare-pid',
    '--die-with-parent',
    '--new-session',
    '--ro-bind', '/usr', '/usr',
    ...libraryMounts,
    '--dev', '/dev',
    '--proc', '/proc',
    '--dir', '/etc',
    ...loaderCacheMount,
    '--tmpfs', '/tmp',
    '--dir', '/runtime',
    '--ro-bind', runtimePath, '/runtime/plugin-runtime',
    '--bind', sandboxDir, '/work',
    '--chdir', '/work',
    '--clearenv',
    '--setenv', 'PATH', '/usr/bin:/usr/local/bin:/runtime',
    '--setenv', 'HOME', '/tmp',
    '--setenv', 'NODE_ENV', 'test',
    '--setenv', 'PYTHONNOUSERSITE', '1',
    '--setenv', 'PYTHONDONTWRITEBYTECODE', '1',
    '--',
    prlimitPath,
    '--cpu=8',
    '--fsize=10485760',
    '--nofile=64',
    ...(isPythonRuntime ? ['--as=536870912'] : ['--data=536870912']),
    '--',
    '/runtime/plugin-runtime',
    ...(isPythonRuntime ? [] : ['--max-old-space-size=256']),
    ...runtimeArgs,
  ];
  return {
    command: bwrapPath,
    args: bubblewrapArgs,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  };
}

function javascriptHttpMockPrelude(mocks: IsolatedHttpMock[]): string {
  if (mocks.length === 0) return '';
  return `
const __stage7_http_mocks = ${JSON.stringify(mocks)};
const __stage7_http_mock_uses = __stage7_http_mocks.map(() => 0);
const __stage7_pattern_matches = (pattern, url) => {
  const expression = new RegExp('^' + pattern.replace(/[.+?^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '.*') + '$');
  return expression.test(url);
};
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || input.method || 'GET').toUpperCase();
  const index = __stage7_http_mocks.findIndex((fixture, fixtureIndex) =>
    fixture.method === method
    && __stage7_pattern_matches(fixture.urlPattern, url)
    && __stage7_http_mock_uses[fixtureIndex] === 0
  );
  if (index < 0) throw new Error('Unmatched HTTP request blocked by the isolated test harness: ' + method + ' ' + url);
  const fixture = __stage7_http_mocks[index];
  const rawBody = init.body == null && input instanceof Request ? await input.text() : init.body;
  const requestBody = typeof rawBody === 'string' ? rawBody : (rawBody == null ? '' : String(rawBody));
  if (fixture.expectedRequestBody !== undefined && requestBody !== fixture.expectedRequestBody) {
    throw new Error('HTTP request body did not match the test fixture for ' + method + ' ' + url);
  }
  __stage7_http_mock_uses[index]++;
  const responseBody = fixture.responseStatus === 204 ? null : JSON.stringify(fixture.responseBody);
  return new Response(responseBody, { status: fixture.responseStatus, headers: fixture.responseHeaders || {} });
};
process.on('beforeExit', () => {
  if (__stage7_http_mock_uses.some((count) => count === 0)) {
    console.error('One or more expected HTTP fixture requests were not made');
    process.exitCode = 1;
  }
});
`;
}

function pythonHttpMockPrelude(mocks: IsolatedHttpMock[]): string {
  if (mocks.length === 0) return '';
  return `
import io
import urllib.request

__stage7_http_mocks = ${JSON.stringify(mocks)}
__stage7_http_mock_uses = [0 for _ in __stage7_http_mocks]

class __Stage7MockResponse(io.BytesIO):
    def __init__(self, content, status, headers):
        super().__init__(content)
        self.status = status
        self.code = status
        self.headers = headers
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

def __stage7_mock_urlopen(request, *args, **kwargs):
    if isinstance(request, urllib.request.Request):
        url = request.full_url
        method = request.get_method().upper()
        data = request.data
    else:
        url = str(request)
        method = 'GET'
        data = None
    body = data.decode() if isinstance(data, bytes) else (str(data) if data is not None else '')
    for index, fixture in enumerate(__stage7_http_mocks):
        pattern = '^' + __import__('re').escape(fixture['urlPattern']).replace(r'\\*', '.*') + '$'
        if fixture['method'] != method or not __import__('re').match(pattern, url) or __stage7_http_mock_uses[index] > 0:
            continue
        expected = fixture.get('expectedRequestBody')
        if expected is not None and body != expected:
            raise RuntimeError('HTTP request body did not match the test fixture for ' + method + ' ' + url)
        __stage7_http_mock_uses[index] += 1
        response_body = b'' if fixture['responseStatus'] == 204 else json.dumps(fixture['responseBody']).encode()
        response = __Stage7MockResponse(response_body, fixture['responseStatus'], fixture.get('responseHeaders', {}))
        if fixture['responseStatus'] >= 400:
            raise urllib.error.HTTPError(url, fixture['responseStatus'], 'Mock HTTP error', response.headers, response)
        return response
    raise RuntimeError('Unmatched HTTP request blocked by the isolated test harness: ' + method + ' ' + url)

urllib.request.urlopen = __stage7_mock_urlopen
`;
}

export class CodeExecutor {
  private static readonly MAX_TIMEOUT_MS = 300000; // 5 minutes max
  private static readonly DEFAULT_TIMEOUT_MS = 30000;
  private static readonly MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB max output

  async execute(options: CodeExecutionOptions, credentials?: CodeExecutorCredentials | Record<string, string | undefined>): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = Math.min(
      options.timeoutMs ?? CodeExecutor.DEFAULT_TIMEOUT_MS,
      CodeExecutor.MAX_TIMEOUT_MS
    );

    const resolvedCreds: Record<string, string | undefined> =
      (credentials as CodeExecutorCredentials)?.resolved ??
      (credentials as Record<string, string | undefined>) ??
      {};
    const sourceMappings: NamedCredentialSource[] =
      (credentials as CodeExecutorCredentials)?.sources ?? [];

    if (options.isolated && (
      options.executorCallback
      || options.persistenceEnvVar
      || options.config
      || options.credentials
      || (options.httpMocks && !Array.isArray(options.httpMocks))
      || Object.keys(resolvedCreds).length > 0
      || sourceMappings.length > 0
    )) {
      return {
        success: false,
        error: 'Isolated plugin tests cannot receive callbacks, persistence, configuration, or credentials.',
        durationMs: Date.now() - startTime,
      };
    }
    if (options.httpMocks?.length && !options.isolated) {
      return {
        success: false,
        error: 'HTTP fixtures are only supported in isolated plugin tests.',
        durationMs: Date.now() - startTime,
      };
    }

    if (options.language === 'javascript' || options.language === 'typescript') {
      return this.executeJavaScript(options, timeoutMs, startTime, resolvedCreds, sourceMappings);
    }

    if (options.language === 'python') {
      return this.executePython(options, timeoutMs, startTime, resolvedCreds, sourceMappings);
    }

    return {
      success: false,
      error: `Unsupported language: ${options.language}. Supported: javascript, typescript, python`,
      durationMs: Date.now() - startTime,
    };
  }

  private createCallbackBridge(
    callback: (toolId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>
  ): Promise<{ url: string; close: () => Promise<void> }> {
    const token = randomUUID();
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== `/${token}`) {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { toolId, input } = JSON.parse(body);
          const result = await callback(toolId, input);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    });
    return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        (resolve as any)({
          url: `http://127.0.0.1:${port}/${token}`,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      });
    });
  }

  private async executeJavaScript(
    options: CodeExecutionOptions,
    timeoutMs: number,
    startTime: number,
    resolvedCreds: Record<string, string | undefined>,
    sourceMappings: NamedCredentialSource[],
  ): Promise<CodeExecutionResult> {
    const sandboxDir = fs.mkdtempSync('/tmp/js_sandbox_');
    const scriptPath = `${sandboxDir}/main.js`;

    // Copy stage7-runtime into sandboxDir so skills can require('stage7-runtime')
    try {
      const runtimeJsSrc = path.resolve(__dirname, '../adk/shared/stage7-runtime.js');
      const runtimeTsSrc = path.resolve(__dirname, '../adk/shared/stage7-runtime.ts');
      if (fs.existsSync(runtimeJsSrc)) {
        fs.copyFileSync(runtimeJsSrc, `${sandboxDir}/stage7-runtime.js`);
      } else if (fs.existsSync(runtimeTsSrc)) {
        fs.copyFileSync(runtimeTsSrc, `${sandboxDir}/stage7-runtime.js`);
      }
    } catch (_) {
      // Best effort runtime copy
    }

    const sourceMapJson = JSON.stringify(sourceMappings);

    return new Promise((resolve) => {
      void (async () => {
        let bridge: { url: string; close: () => Promise<void> } | undefined;
        if (options.executorCallback) {
          bridge = await this.createCallbackBridge(options.executorCallback);
        }

        const bridgeUrl = bridge?.url ?? '';
        const hasBridge = !!bridge;

        try {
        const code = options.code;
        const wrapped = `const __tool_input = ${JSON.stringify(options.input || {})};

const __skill_config = ${JSON.stringify(options.config || {})}

const __skill_credentials = ${JSON.stringify(options.credentials || {})};

const __credential_sources = ${sourceMapJson};

function __getCredential(logicalKey) {
  // Resolved by the executor's credential provider, not read from the process
  // environment: a Skill must not depend on env vars for its own settings.
  return __skill_credentials[logicalKey] || '';
}

function __getCredentialSource(logicalKey) {
  return __credential_sources.find(s => s.logicalKey === logicalKey);
}

const __resolveAuth = async (auth) => {
  const type = (auth && auth.type) || 'none';
  const headers = {};
  const resolveVal = async (val) => {
    if (val == null) return '';
    if (typeof val === 'object') {
      if (val.vaultSecretId) {
        try {
          const r = await fetch((process.env.VAULT_URL || 'http://vault:4000') + '/secrets/' + val.vaultSecretId + '/decrypt', {
            headers: { 'X-Tenant-Id': 'system' },
          });
          if (r.ok) { const d = await r.json(); return d.plaintext || ''; }
        } catch {}
        return '';
      }
      if (val.envVar) return process.env[val.envVar] || '';
      if (val.configKey) return process.env[val.configKey] || '';
      return '';
    }
    if (typeof val === 'string') {
      const m = val.match(/^\\$\\{(\\w+)\\}$/);
      return m ? (process.env[m[1]] || '') : val;
    }
    return String(val);
  };
  switch (type) {
    case 'bearer': {
      const t = await resolveVal(auth.token != null ? auth.token : auth.accessToken);
      if (t) headers['Authorization'] = 'Bearer ' + t;
      break;
    }
    case 'basic': {
      const u = await resolveVal(auth.username);
      const p = await resolveVal(auth.password);
      if (u || p) headers['Authorization'] = 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
      break;
    }
    case 'api_key': {
      const hn = auth.header || 'X-API-Key';
      const v = await resolveVal(auth.value != null ? auth.value : auth.apiKey);
      if (v) headers[hn] = v;
      break;
    }
    case 'custom':
      if (auth.headers) for (const [k, v] of Object.entries(auth.headers)) if (v != null) headers[k] = String(v);
      break;
  }
  return { headers, type };
};
${options.isolated ? javascriptHttpMockPrelude(options.httpMocks || []) : ''}
${code}`;

        if (hasBridge) {
          const bridgeCode = `const __bridge_url = '${bridgeUrl}';
async function __execute_tool(toolId, input) {
  const res = await fetch(__bridge_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolId, input }),
  });
  if (!res.ok) throw new Error('Tool execution failed: ' + await res.text());
  return res.json();
}
`;
          fs.writeFileSync(scriptPath, bridgeCode + wrapped);
        } else {
          fs.writeFileSync(scriptPath, wrapped);
        }

        const env: Record<string, string | undefined> = {
          ...process.env,
          NODE_ENV: 'production',
          HOME: sandboxDir,
          PATH: process.env.PATH || '/usr/bin:/bin',
          STAGE7_SANDBOX_DIR: sandboxDir,
        };

        if (options.persistenceEnvVar) {
          try {
            const dir = process.env.ASSISTANT_HOME || process.env[options.persistenceEnvVar] || `/var/data/stage7/${(options.persistenceEnvVar || 'assistant').toLowerCase()}`;
            env[options.persistenceEnvVar || 'ASSISTANT_HOME'] = dir;
            env['ASSISTANT_HOME'] = dir;
          } catch (_) {
            // Ignore failures when the optional persistence variable is unavailable.
          }
        }

        for (const [key, value] of Object.entries(resolvedCreds)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
        for (const source of sourceMappings) {
          const value = resolvedCreds[source.logicalKey];
          if (value !== undefined) {
            if (source.envVar) env[source.envVar] = value;
            if (source.configKey) env[source.configKey] = value;
          }
        }

        const command = options.isolated
          ? isolatedCommand(process.execPath, [scriptPath], sandboxDir)
          : { command: 'node', args: [scriptPath], env };
        const proc = spawn(command.command, command.args, {
          timeout: timeoutMs,
          cwd: options.isolated ? undefined : sandboxDir,
          env: command.env,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;

        proc.stdout?.on('data', (data) => {
          const chunk = data.toString();
          const chunkBytes = Buffer.byteLength(chunk, 'utf8');
          if (stdoutBytes + chunkBytes > CodeExecutor.MAX_OUTPUT_BYTES) {
            proc.kill('SIGKILL');
            return;
          }
          stdout += chunk;
          stdoutBytes += chunkBytes;
        });

        proc.stderr?.on('data', (data) => {
          const chunk = data.toString();
          const chunkBytes = Buffer.byteLength(chunk, 'utf8');
          if (stderrBytes + chunkBytes > CodeExecutor.MAX_OUTPUT_BYTES) {
            proc.kill('SIGKILL');
            return;
          }
          stderr += chunk;
          stderrBytes += chunkBytes;
        });

        const timeoutHandle = setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {
            // The process may already have exited.
          }
          if (bridge) {
            bridge.close();
          }
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: `JavaScript execution timed out after ${timeoutMs}ms`,
            durationMs: Date.now() - startTime,
          });
        }, timeoutMs);

        proc.on('close', async (code: number | null) => {
          clearTimeout(timeoutHandle);
          if (bridge) {
            await bridge.close();
          }
          if (code === 0) {
            cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
              success: true,
              output: stdout || stderr || 'Execution completed with no output',
              exitCode: code ?? 0,
              durationMs: Date.now() - startTime,
            });
          } else {
            cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
              success: false,
              error: stderr || `Node process exited with code ${code}`,
              exitCode: code ?? -1,
              durationMs: Date.now() - startTime,
            });
          }
        });

        proc.on('error', async (err: Error) => {
          clearTimeout(timeoutHandle);
          if (bridge) {
            await bridge.close();
          }
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: err.message,
            durationMs: Date.now() - startTime,
          });
        });
      } catch (err) {
        if (bridge) {
          await bridge.close();
        }
        cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        });
      }
      })();
    });
  }

  private async executePython(
    options: CodeExecutionOptions,
    timeoutMs: number,
    startTime: number,
    resolvedCreds: Record<string, string | undefined>,
    sourceMappings: NamedCredentialSource[],
  ): Promise<CodeExecutionResult> {
    const sandboxDir = fs.mkdtempSync('/tmp/py_sandbox_');
    const scriptPath = `${sandboxDir}/main.py`;
    const pythonBin = process.env.PYTHON_BIN || 'python3';

    return new Promise((resolve) => {
      void (async () => {
        let bridge: { url: string; close: () => Promise<void> } | undefined;
        if (options.executorCallback) {
          bridge = await this.createCallbackBridge(options.executorCallback);
        }

        const bridgeUrl = bridge?.url ?? '';
        const hasBridge = !!bridge;

        try {
        const code = options.code;
        const wrapped = `import json
import os
import base64
import urllib.request

__tool_input = ${JSON.stringify(options.input || {})}

__skill_config = ${JSON.stringify(options.config || {})}

__skill_credentials = ${JSON.stringify(options.credentials || {})}

__credential_sources = ${JSON.stringify(sourceMappings)}

def __get_credential(logical_key):
    return __skill_credentials.get(logical_key, '')

def __get_credential_source(logical_key):
    for s in __credential_sources:
        if s.get('logicalKey') == logical_key:
            return s
    return None

async def __resolve_auth(auth):
    import asyncio
    type_ = (auth.get('type') if auth else None) or 'none'
    headers = {}
    
    async def resolve_val(val):
        if val is None:
            return ''
        if isinstance(val, dict):
            if val.get('vaultSecretId'):
                try:
                    vault_url = os.environ.get('VAULT_URL', 'http://vault:4000')
                    req = urllib.request.Request(
                        f'{vault_url}/secrets/{val["vaultSecretId"]}/decrypt',
                        headers={'X-Tenant-Id': 'system'}
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        import json as json_mod
                        data = json_mod.loads(resp.read().decode())
                        return data.get('plaintext', '') or ''
                except Exception:
                    return ''
            if val.get('envVar'):
                return os.environ.get(val['envVar'], '') or ''
            if val.get('configKey'):
                return os.environ.get(val['configKey'], '') or ''
            return ''
        if isinstance(val, str):
            import re
            m = re.match(r'^\\$\\{(\\w+)\\}$', val)
            return os.environ.get(m.group(1), '') if m else val
        return str(val)
    
    if type_ == 'bearer':
        t = await resolve_val(auth.get('token') or auth.get('accessToken'))
        if t:
            headers['Authorization'] = 'Bearer ' + t
    elif type_ == 'basic':
        u = await resolve_val(auth.get('username'))
        p = await resolve_val(auth.get('password'))
        if u or p:
            raw = u + ':' + p
            headers['Authorization'] = 'Basic ' + base64.b64encode(raw.encode()).decode()
    elif type_ == 'api_key':
        hn = auth.get('header') or 'X-API-Key'
        v = await resolve_val(auth.get('value') or auth.get('apiKey'))
        if v:
            headers[hn] = v
    elif type_ == 'custom':
        if auth.get('headers'):
            for k, v in auth['headers'].items():
                if v is not None:
                    headers[k] = str(v)
    return {'headers': headers, 'type': type_}

${options.isolated ? pythonHttpMockPrelude(options.httpMocks || []) : ''}
${code}`;

        if (hasBridge) {
          const bridgeCode = `__bridge_url = '${bridgeUrl}'
import urllib.request
import json as _json

async def __execute_tool(tool_id, input):
    data = _json.dumps({'toolId': tool_id, 'input': input}).encode()
    req = urllib.request.Request(__bridge_url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req) as resp:
        return _json.loads(resp.read().decode())
`;
          fs.writeFileSync(scriptPath, bridgeCode + wrapped);
        } else {
          fs.writeFileSync(scriptPath, wrapped);
        }

        const env: Record<string, string | undefined> = {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONUNBUFFERED: '1',
          HOME: sandboxDir,
          PATH: process.env.PATH || '/usr/bin:/bin',
        };

        if (options.persistenceEnvVar) {
          try {
            const dir = process.env.ASSISTANT_HOME || process.env[options.persistenceEnvVar] || `/var/data/stage7/${(options.persistenceEnvVar || 'assistant').toLowerCase()}`;
            env[options.persistenceEnvVar || 'ASSISTANT_HOME'] = dir;
            env['ASSISTANT_HOME'] = dir;
          } catch (_) {
            // Ignore failures when the optional persistence variable is unavailable.
          }
        }

        for (const [key, value] of Object.entries(resolvedCreds)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
        for (const source of sourceMappings) {
          const value = resolvedCreds[source.logicalKey];
          if (value !== undefined) {
            if (source.envVar) env[source.envVar] = value;
            if (source.configKey) env[source.configKey] = value;
          }
        }

        const command = options.isolated
          ? isolatedCommand(pythonBin, [scriptPath], sandboxDir)
          : { command: pythonBin, args: [scriptPath], env };
        const proc = spawn(command.command, command.args, {
          timeout: timeoutMs,
          cwd: options.isolated ? undefined : sandboxDir,
          env: command.env,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;

        proc.stdout?.on('data', (data) => {
          const chunk = data.toString();
          const chunkBytes = Buffer.byteLength(chunk, 'utf8');
          if (stdoutBytes + chunkBytes > CodeExecutor.MAX_OUTPUT_BYTES) {
            proc.kill('SIGKILL');
            return;
          }
          stdout += chunk;
          stdoutBytes += chunkBytes;
        });

        proc.stderr?.on('data', (data) => {
          const chunk = data.toString();
          const chunkBytes = Buffer.byteLength(chunk, 'utf8');
          if (stderrBytes + chunkBytes > CodeExecutor.MAX_OUTPUT_BYTES) {
            proc.kill('SIGKILL');
            return;
          }
          stderr += chunk;
          stderrBytes += chunkBytes;
        });

        const timeoutHandle = setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {
            // The process may already have exited.
          }
          if (bridge) {
            bridge.close();
          }
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: `Python execution timed out after ${timeoutMs}ms`,
            durationMs: Date.now() - startTime,
          });
        }, timeoutMs);

        proc.on('close', async (code: number | null) => {
          clearTimeout(timeoutHandle);
          if (bridge) {
            await bridge.close();
          }
          if (code === 0) {
            cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
              success: true,
              output: stdout || stderr || 'Execution completed with no output',
              exitCode: code ?? 0,
              durationMs: Date.now() - startTime,
            });
          } else {
            cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
              success: false,
              error: stderr || `Python process exited with code ${code}`,
              exitCode: code ?? -1,
              durationMs: Date.now() - startTime,
            });
          }
        });

        proc.on('error', async (err: Error) => {
          clearTimeout(timeoutHandle);
          if (bridge) {
            await bridge.close();
          }
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: err.message,
            durationMs: Date.now() - startTime,
          });
        });
      } catch (err) {
        if (bridge) {
          await bridge.close();
        }
        cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        });
      }
      })();
    });
  }
}

function cleanupAndResolve(
  resolve: (value: CodeExecutionResult) => void,
  sandboxDir: string,
  scriptPath: string,
  startTime: number,
  result: CodeExecutionResult,
): void {
  try {
    // Read the sidecar before cleanup: it is the only record of what the run wrote,
    // and it lives in the directory about to be deleted. Read on failure too — the
    // caller decides whether a failed run's writes are worth announcing, not this
    // function, and dropping them here would make that decision unrecoverable.
    const writes = readWriteLog(sandboxDir);
    if (writes && result.success) {
      result.storeWrites = writes;
    }
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
    if (fs.existsSync(sandboxDir)) {
      const entries = fs.readdirSync(sandboxDir);
      for (const entry of entries) {
        try {
          fs.unlinkSync(`${sandboxDir}/${entry}`);
        } catch {
          // Individual sandbox entries may already be gone.
        }
      }
      fs.rmdirSync(sandboxDir);
    }
  } catch {
    // Cleanup is best-effort; still return the execution result.
  }
  resolve(result);
}

/**
 * The store writes the Skill process recorded, or undefined if it recorded none.
 *
 * Tolerant by design: the sidecar is a best-effort channel, so a missing, truncated
 * or malformed log yields undefined rather than failing a run that otherwise
 * succeeded and, more importantly, rather than inventing writes that did not happen.
 */
function readWriteLog(sandboxDir: string): StoreWrite[] | undefined {
  try {
    const filePath = path.join(sandboxDir, STORE_WRITE_LOG);
    if (!fs.existsSync(filePath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) return undefined;
    const writes = parsed.filter(
      (entry): entry is StoreWrite =>
        !!entry && typeof entry.key === 'string' && typeof entry.operation === 'string',
    );
    return writes.length > 0 ? writes : undefined;
  } catch {
    return undefined;
  }
}
