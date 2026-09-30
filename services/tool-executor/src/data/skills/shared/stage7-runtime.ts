/**
 * Stage7 Shared JS Runtime for Code Skills.
 * Loaded by spawned Node.js skill processes via require('stage7-runtime').
 */

import fs from 'fs';
import path from 'path';

declare const __tool_input: any;
declare const __execute_tool: any;

export interface RuntimeOptions {
  persistenceEnvVar?: string;
}

export function createRuntimeContext(opts: RuntimeOptions = {}) {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const persistenceEnvVar = opts.persistenceEnvVar || 'STORAGE_DIR';
  const baseDir = (typeof process !== 'undefined' && process.env && process.env[persistenceEnvVar]) || '/tmp/stage7';

  const store = {
    getFilePath(key: string) {
      return path.join(baseDir, `${key}.json`);
    },
    load(key: string, defaultValue: any = []) {
      try {
        const filePath = this.getFilePath(key);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(raw);
        }
      } catch (e) {
        // Fallback to default
      }
      return defaultValue;
    },
    save(key: string, data: any) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
        const filePath = this.getFilePath(key);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        // Best effort save
      }
      // Also sync to global persistent collection store under /tmp/stage7-store/ for inter-skill access
      try {
        const globalStoreDir = '/tmp/stage7-store';
        fs.mkdirSync(globalStoreDir, { recursive: true });
        fs.writeFileSync(path.join(globalStoreDir, `${key}.json`), JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        // Best effort sync
      }
    },
  };

  const emit = {
    success(result: any = {}) {
      const output = {
        success: true,
        data: result.data || null,
        status: result.status || 'ok',
        error: result.error || null,
        present: result.present || [],
        ...result,
      };
      console.log(JSON.stringify(output));
      return output;
    },
    failure(error: any, result: any = {}) {
      const output = {
        success: false,
        data: result.data || null,
        status: result.status || 'failed',
        error: typeof error === 'string' ? error : (error && error.message) || String(error),
        present: result.present || [
          {
            id: 'error-summary',
            title: 'Error',
            kind: 'text',
            body: typeof error === 'string' ? error : (error && error.message) || String(error),
          },
        ],
        ...result,
      };
      console.log(JSON.stringify(output));
      return output;
    },
    notConnected(reason = 'Required endpoint or configuration is missing', details = '') {
      const output = {
        success: false,
        status: 'not-connected',
        data: null,
        error: `Not connected: ${reason}`,
        present: [
          {
            id: 'not-connected',
            title: 'Connection required',
            kind: 'text',
            body: details ? `${reason}\n${details}` : reason,
          },
        ],
      };
      console.log(JSON.stringify(output));
      return output;
    },
  };

  const delegate = async (toolId: string, toolInput: any) => {
    if (typeof __execute_tool === 'function') {
      return await __execute_tool(toolId, toolInput);
    }
    throw new Error(`Tool execution environment does not support delegation to ${toolId}`);
  };

  const render = {
    text(id: string, title: string, bodyOrLines: string | string[]) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'text', body };
    },
    markdown(id: string, title: string, bodyOrLines: string | string[]) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'markdown', body };
    },
    list(id: string, title: string, items: string[]) {
      const body = items.map((i) => `- ${i}`).join('\n');
      return { id, title, kind: 'text', body };
    },
  };

  return {
    input,
    store,
    emit,
    delegate,
    render,
  };
}

module.exports = {
  context: createRuntimeContext,
};
