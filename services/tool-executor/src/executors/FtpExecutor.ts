import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface FtpExecutionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  operation: 'list' | 'upload' | 'download' | 'delete' | 'mkdir';
  remotePath?: string;
  localPath?: string;
  content?: string;
}

export interface FtpExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export class FtpExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: FtpExecutionOptions, credentials: ToolCredentials): Promise<FtpExecutionResult> {
    const startTime = Date.now();
    const { host, port, username, password, operation, remotePath, localPath, content } = options;

    const resolvedPassword = password || credentials.password || '';
    const resolvedUsername = username || credentials.username || 'anonymous';

    if (!host || !port) {
      return { success: false, error: 'FTP host and port are required' };
    }

    const curlArgs = [
      '-s', '--connect-timeout', '10', '--max-time', '30',
      '-u', `${resolvedUsername}:${resolvedPassword}`,
      'ftp://' + host + ':' + port,
    ];

    switch (operation) {
      case 'list':
        curlArgs.push('-l');
        if (remotePath) curlArgs.push(remotePath);
        break;
      case 'upload':
        if (!localPath || !remotePath) {
          return { success: false, error: 'localPath and remotePath are required for upload' };
        }
        if (!fs.existsSync(localPath)) {
          return { success: false, error: `Local file not found: ${localPath}` };
        }
        curlArgs.push('--upload-file', localPath);
        curlArgs.push(remotePath);
        break;
      case 'download':
        if (!remotePath || !localPath) {
          return { success: false, error: 'remotePath and localPath are required for download' };
        }
        curlArgs.push('-o', localPath);
        curlArgs.push(remotePath);
        break;
      case 'delete':
        if (!remotePath) {
          return { success: false, error: 'remotePath is required for delete' };
        }
        curlArgs.push('-Q', `DELE ${remotePath}`);
        break;
      case 'mkdir':
        if (!remotePath) {
          return { success: false, error: 'remotePath is required for mkdir' };
        }
        curlArgs.push('-Q', `MKD ${remotePath}`);
        break;
      default:
        return { success: false, error: `Unsupported FTP operation: ${operation}` };
    }

    return new Promise((resolve) => {
      const proc = spawn('curl', curlArgs, {
        timeout: 35000,
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

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout.trim() || { message: `${operation} completed` },
            durationMs: Date.now() - startTime,
          });
        } else {
          resolve({
            success: false,
            error: stderr.trim() || `curl exited with code ${code}`,
            durationMs: Date.now() - startTime,
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to start curl: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}
