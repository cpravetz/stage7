import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import fs from 'fs';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

export interface CodeExecutionOptions {
  language: 'javascript' | 'typescript' | 'python';
  code: string;
  timeoutMs?: number;
  stdin?: string;
}

export interface CodeExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  durationMs?: number;
}

export class CodeExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: CodeExecutionOptions, _credentials: ToolCredentials): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 10000;

    if (options.language === 'javascript' || options.language === 'typescript') {
      return this.executeJavaScript(options.code, timeoutMs, startTime);
    }

    if (options.language === 'python') {
      return this.executePython(options.code, timeoutMs, startTime);
    }

    return {
      success: false,
      error: `Unsupported language: ${options.language}. Supported: javascript, typescript, python`,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeJavaScript(code: string, timeoutMs: number, startTime: number): Promise<CodeExecutionResult> {
    // Run JavaScript in a separate node process so network/fetch is available
    const sandboxDir = fs.mkdtempSync('/tmp/js_sandbox_');
    const scriptPath = `${sandboxDir}/main.js`;

    return new Promise((resolve) => {
      try {
        fs.writeFileSync(scriptPath, code);

        const proc = spawn('node', [scriptPath], {
          timeout: timeoutMs,
          cwd: sandboxDir,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            HOME: sandboxDir,
            PATH: process.env.PATH || '/usr/bin:/bin',
          },
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

  private executePython(code: string, timeoutMs: number, startTime: number): Promise<CodeExecutionResult> {
    const sandboxDir = fs.mkdtempSync('/tmp/py_sandbox_');
    const scriptPath = `${sandboxDir}/main.py`;
    const pythonBin = process.env.PYTHON_BIN || 'python3';

    return new Promise((resolve) => {
      try {
        fs.writeFileSync(scriptPath, code);

        const proc = spawn(pythonBin, [scriptPath], {
          timeout: timeoutMs,
          cwd: sandboxDir,
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONUNBUFFERED: '1',
            HOME: sandboxDir,
            PATH: process.env.PATH || '/usr/bin:/bin',
          },
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
    // ignore cleanup errors
  }
  resolve(result);
}
