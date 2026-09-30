/**
 * Stage7 Shared JS Runtime for Code Skills.
 * Loaded by spawned Node.js skill processes via require('stage7-runtime').
 */

const fs = require('fs');
const path = require('path');

function createRuntimeContext(opts = {}) {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const persistenceEnvVar = opts.persistenceEnvVar || 'STORAGE_DIR';
  const baseDir = (typeof process !== 'undefined' && process.env && process.env[persistenceEnvVar]) || '/tmp/stage7';

  const store = {
    getFilePath(key) {
      return path.join(baseDir, `${key}.json`);
    },
    load(key, defaultValue = []) {
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
    save(key, data) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
        const filePath = this.getFilePath(key);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        // Best effort save
      }
    },
  };

  const emit = {
    success(result = {}) {
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
    failure(error, result = {}) {
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

  const delegate = async (toolId, toolInput) => {
    if (typeof __execute_tool === 'function') {
      return await __execute_tool(toolId, toolInput);
    }
    throw new Error(`Tool execution environment does not support delegation to ${toolId}`);
  };

  const render = {
    text(id, title, bodyOrLines) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'text', body };
    },
    markdown(id, title, bodyOrLines) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'markdown', body };
    },
    list(id, title, items) {
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
