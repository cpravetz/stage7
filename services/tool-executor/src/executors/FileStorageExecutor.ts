import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import fs from 'fs';
import path from 'path';

export interface FileStorageOptions {
  operation: 'read' | 'write' | 'list' | 'delete' | 'exists' | 'mkdir';
  path: string;
  content?: string;
  bucket?: string;
}

export interface FileStorageResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

export class FileStorageExecutor {
  private credentialProvider = CredentialProvider;
  private basePath: string;

  constructor() {
    this.basePath = process.env.FILE_STORAGE_BASE_PATH || '/tmp/stage7-filestore';
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  async execute(options: FileStorageOptions, _credentials: ToolCredentials): Promise<FileStorageResult> {
    const startTime = Date.now();
    const { operation, path: filePath, content, bucket } = options;

    const resolvedPath = bucket ? path.join(this.basePath, bucket, filePath) : path.join(this.basePath, filePath);

    try {
      switch (operation) {
        case 'read':
          if (!fs.existsSync(resolvedPath)) {
            return { success: false, error: `File not found: ${resolvedPath}`, durationMs: Date.now() - startTime };
          }
          const data = fs.readFileSync(resolvedPath, 'utf-8');
          return { success: true, data, durationMs: Date.now() - startTime };

        case 'write':
          const dir = path.dirname(resolvedPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(resolvedPath, content || '');
          return { success: true, data: { path: resolvedPath, bytes: (content || '').length }, durationMs: Date.now() - startTime };

        case 'list':
          if (!fs.existsSync(resolvedPath)) {
            return { success: false, error: `Directory not found: ${resolvedPath}`, durationMs: Date.now() - startTime };
          }
          const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
          const listing = entries.map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: entry.isFile() ? (fs.statSync(path.join(resolvedPath, entry.name)).size || 0) : 0,
          }));
          return { success: true, data: listing, durationMs: Date.now() - startTime };

        case 'delete':
          if (!fs.existsSync(resolvedPath)) {
            return { success: false, error: `File not found: ${resolvedPath}`, durationMs: Date.now() - startTime };
          }
          fs.unlinkSync(resolvedPath);
          return { success: true, data: { message: 'Deleted', path: resolvedPath }, durationMs: Date.now() - startTime };

        case 'exists':
          return { success: true, data: { exists: fs.existsSync(resolvedPath) }, durationMs: Date.now() - startTime };

        case 'mkdir':
          if (fs.existsSync(resolvedPath)) {
            return { success: true, data: { message: 'Already exists', path: resolvedPath }, durationMs: Date.now() - startTime };
          }
          fs.mkdirSync(resolvedPath, { recursive: true });
          return { success: true, data: { message: 'Created', path: resolvedPath }, durationMs: Date.now() - startTime };

        default:
          return { success: false, error: `Unsupported file storage operation: ${operation}`, durationMs: Date.now() - startTime };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
