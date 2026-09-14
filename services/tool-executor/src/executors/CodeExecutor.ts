import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, NamedCredentialSource } from '../services/CredentialProvider';
import fs from 'fs';
import { spawn } from 'child_process';

export interface CodeExecutionOptions {
  language: 'javascript' | 'typescript' | 'python';
  code: string;
  timeoutMs?: number;
  stdin?: string;
  input?: Record<string, unknown>;
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
      return this.executeJavaScript(options.code, options.input, timeoutMs, startTime, resolvedCreds, sourceMappings);
    }

    if (options.language === 'python') {
      return this.executePython(options.code, options.input, timeoutMs, startTime, resolvedCreds, sourceMappings);
    }

    return {
      success: false,
      error: `Unsupported language: ${options.language}. Supported: javascript, typescript, python`,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeJavaScript(
    code: string,
    input: Record<string, unknown> | undefined,
    timeoutMs: number,
    startTime: number,
    resolvedCreds: Record<string, string | undefined>,
    sourceMappings: NamedCredentialSource[]
  ): Promise<CodeExecutionResult> {
    const sandboxDir = fs.mkdtempSync('/tmp/js_sandbox_');
    const scriptPath = `${sandboxDir}/main.js`;

    const sourceMapJson = JSON.stringify(sourceMappings);

    return new Promise((resolve) => {
      try {
        const wrapped = `const __tool_input = ${JSON.stringify(input || {})};

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
        fs.writeFileSync(scriptPath, wrapped);

        const env: Record<string, string | undefined> = {
          ...process.env,
          NODE_ENV: 'production',
          HOME: sandboxDir,
          PATH: process.env.PATH || '/usr/bin:/bin',
        };

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
          try { proc.kill('SIGKILL'); } catch {}
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: `JavaScript execution timed out after ${timeoutMs}ms`,
            durationMs: Date.now() - startTime,
          });
        }, timeoutMs);

        proc.on('close', (code) => {
          clearTimeout(timeoutHandle);
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

        proc.on('error', (err) => {
          clearTimeout(timeoutHandle);
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: err.message,
            durationMs: Date.now() - startTime,
          });
        });
      } catch (err) {
        cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        });
      }
    });
  }

  private executePython(
    code: string,
    input: Record<string, unknown> | undefined,
    timeoutMs: number,
    startTime: number,
    resolvedCreds: Record<string, string | undefined>,
    sourceMappings: NamedCredentialSource[]
  ): Promise<CodeExecutionResult> {
    const sandboxDir = fs.mkdtempSync('/tmp/py_sandbox_');
    const scriptPath = `${sandboxDir}/main.py`;
    const pythonBin = process.env.PYTHON_BIN || 'python3';

    return new Promise((resolve) => {
      try {
        const wrapped = `import json
import os
import base64
import urllib.request

__tool_input = ${JSON.stringify(input || {})}

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

${code}`;
        fs.writeFileSync(scriptPath, wrapped);

        const env: Record<string, string | undefined> = {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONUNBUFFERED: '1',
          HOME: sandboxDir,
          PATH: process.env.PATH || '/usr/bin:/bin',
        };

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
          try { proc.kill('SIGKILL'); } catch {}
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: `Python execution timed out after ${timeoutMs}ms`,
            durationMs: Date.now() - startTime,
          });
        }, timeoutMs);

        proc.on('close', (code) => {
          clearTimeout(timeoutHandle);
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

        proc.on('error', (err) => {
          clearTimeout(timeoutHandle);
          cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
            success: false,
            error: err.message,
            durationMs: Date.now() - startTime,
          });
        });
      } catch (err) {
        cleanupAndResolve(resolve, sandboxDir, scriptPath, startTime, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        });
      }
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
        try { fs.unlinkSync(`${sandboxDir}/${entry}`); } catch {}
      }
      fs.rmdirSync(sandboxDir);
    }
  } catch {
  }
  resolve(result);
}
