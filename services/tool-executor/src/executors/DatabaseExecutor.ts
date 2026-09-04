import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface DatabaseQueryOptions {
  engine: 'sqlite' | 'postgres' | 'mysql';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  query: string;
  params?: unknown[];
  timeoutMs?: number;
}

export interface DatabaseQueryResult {
  success: boolean;
  rows?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  error?: string;
  durationMs?: number;
}

export class DatabaseExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: DatabaseQueryOptions, credentials: ToolCredentials): Promise<DatabaseQueryResult> {
    const startTime = Date.now();
    const { engine, query, params, timeoutMs = 30000 } = options;

    const resolvedConnectionString = options.connectionString ||
      credentials.connectionString ||
      this.buildConnectionString(options, credentials);

    if (!resolvedConnectionString && engine !== 'sqlite') {
      return {
        success: false,
        error: 'Connection string or database credentials are required',
        durationMs: Date.now() - startTime,
      };
    }

    switch (engine) {
      case 'sqlite':
        return this.executeSQLite(options, startTime);
      case 'postgres':
        return this.executePostgres(resolvedConnectionString!, query, params || [], timeoutMs, startTime);
      case 'mysql':
        return this.executeMySQL(resolvedConnectionString!, query, params || [], timeoutMs, startTime);
      default:
        return {
          success: false,
          error: `Unsupported database engine: ${engine}`,
          durationMs: Date.now() - startTime,
        };
    }
  }

  private buildConnectionString(options: DatabaseQueryOptions, credentials: ToolCredentials): string {
    const host = options.host || credentials.host || 'localhost';
    const port = options.port || credentials.port || (options.engine === 'postgres' ? 5432 : 3306);
    const database = options.database || credentials.database || 'test';
    const username = options.username || credentials.username || 'user';
    const password = options.password || credentials.password || '';

    if (options.engine === 'postgres') {
      return `postgresql://${username}:${password}@${host}:${port}/${database}`;
    }
    return `mysql://${username}:${password}@${host}:${port}/${database}`;
  }

  private async executeSQLite(options: DatabaseQueryOptions, startTime: number): Promise<DatabaseQueryResult> {
    const dbPath = options.connectionString || ':memory:';
    const query = options.query.trim().toLowerCase();

    try {
      // @ts-expect-error better-sqlite3 is an optional dependency
      const { Database } = await import('better-sqlite3');
      const db = new Database(dbPath);

      if (query.startsWith('select') || query.startsWith('pragma') || query.startsWith('explain')) {
        const stmt = db.prepare(options.query);
        const rows = stmt.all(...(options.params || [])) as Record<string, unknown>[];
        return {
          success: true,
          rows,
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          rowCount: rows.length,
          durationMs: Date.now() - startTime,
        };
      } else {
        const stmt = db.prepare(options.query);
        const result = stmt.run(...(options.params || [])) as { changes: number };
        return {
          success: true,
          rows: [],
          rowCount: result.changes,
          durationMs: Date.now() - startTime,
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executePostgres(connectionString: string, query: string, params: unknown[], timeoutMs: number, startTime: number): Promise<DatabaseQueryResult> {
    try {
      // @ts-expect-error pg is an optional dependency
      const { Client } = await import('pg');
      const client = new Client({ connectionString });
      await client.connect();

      try {
        const result = await client.query({ text: query, values: params as any[] });
        return {
          success: true,
          rows: result.rows,
          columns: result.fields.map((f: any) => f.name),
          rowCount: result.rowCount,
          durationMs: Date.now() - startTime,
        };
      } finally {
        await client.end();
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeMySQL(connectionString: string, query: string, params: unknown[], timeoutMs: number, startTime: number): Promise<DatabaseQueryResult> {
    try {
      // @ts-expect-error mysql2/promise is an optional dependency
      const mysql = await import('mysql2/promise');
      const [rows, fields] = await (mysql as any).query(connectionString, query, { rowsAsArrays: false });
      return {
        success: true,
        rows: rows as Record<string, unknown>[],
        columns: fields ? fields.map((f: any) => f.name) : [],
        rowCount: Array.isArray(rows) ? rows.length : 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
