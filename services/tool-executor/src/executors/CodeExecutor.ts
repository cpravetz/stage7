import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, NamedCredentialSource } from '../services/CredentialProvider';
import fs from 'fs';
import http from 'http';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';

export interface CodeExecutionOptions {
  language: 'javascript' | 'typescript' | 'python';
  code: string;
  timeoutMs?: number;
  stdin?: string;
  input?: Record<string, unknown>;
  // Optional environment variable name that tools use to persist state (e.g. 'CTO_HOME')
  persistenceEnvVar?: string;
  // Optional callback for tool execution bridge
  executorCallback?: (toolId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface CodeExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface CodeExecutorCredentials {
  resolved: ToolCredentials;
  sources: NamedCredentialSource[];
}

export class CodeExecutor {
  async execute(options: CodeExecutionOptions, credentials?: CodeExecutorCredentials | Record<string, string | undefined>): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 10000;

    const resolvedCreds: Record<string, string | undefined> =
      (credentials as CodeExecutorCredentials)?.resolved ??
      (credentials as Record<string, string | undefined>) ??
      {};
    const sourceMappings: NamedCredentialSource[] =
      (credentials as CodeExecutorCredentials)?.sources ?? [];

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

const __credential_sources = ${sourceMapJson};

function __getCredential(logicalKey) {
  return process.env[logicalKey] || '';
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
        };

        if (options.persistenceEnvVar) {
          try {
            env[options.persistenceEnvVar] = process.env[options.persistenceEnvVar] || `/var/data/stage7/${options.persistenceEnvVar.toLowerCase()}`;
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

        const proc = spawn('node', [scriptPath], {
          timeout: timeoutMs,
          cwd: sandboxDir,
          env,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
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

__credential_sources = ${JSON.stringify(sourceMappings)}

def __get_credential(logical_key):
    return os.environ.get(logical_key, '')

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
        hn = auth.get('header') || 'X-API-Key'
        v = await resolve_val(auth.get('value') or auth.get('apiKey'))
        if v:
            headers[hn] = v
    elif type_ == 'custom':
        if auth.get('headers'):
            for k, v in auth['headers'].items():
                if v is not None:
                    headers[k] = str(v)
    return {'headers': headers, 'type': type_}

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
            env[options.persistenceEnvVar] = process.env[options.persistenceEnvVar] || `/var/data/stage7/${options.persistenceEnvVar.toLowerCase()}`;
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

        const proc = spawn(pythonBin, [scriptPath], {
          timeout: timeoutMs,
          cwd: sandboxDir,
          env,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
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
