'use strict';
/**
 * Preload for the spawned `node` child that runs a code skill.
 *
 * CodeExecutor spawns a real `node` process that inherits `process.env`, so
 * NODE_OPTIONS="--require <this file>" installs a `fetch` interceptor *inside*
 * the child. That is the only seam that lets a test control what the skill's
 * real network layer sees without touching production code: an in-process
 * `global.fetch` mock in the Jest process is invisible to the child.
 *
 * Behaviour is entirely data-driven. Configuration is provided via a JSON file
 * written by tests (to avoid environment variable proliferation). The file is
 * located at `${CAREER_HOME}/career-test-fetch-config.json` by default, or
 * overridden by `CAREER_TEST_FETCH_CONFIG_PATH`. The file contains:
 *   routesBase64  base64 JSON array of route objects, matched in
 *                 order against the full request URL as a prefix:
 *                   { urlPrefix, status?, body?, bodies?, queryParam? }
 *                 `bodies` maps a query-parameter value to a body,
 *                 letting one route serve "cards for this term" and
 *                 "empty shell for that term".
 *   fetchLog      file path; one requested URL per line.
 */

const fs = require('fs');
const path = require('path');
const realFetch = globalThis.fetch;

function loadConfig() {
  let configPath;
  if (process.env.CAREER_TEST_FETCH_CONFIG_PATH) {
    configPath = process.env.CAREER_TEST_FETCH_CONFIG_PATH;
  } else {
    const home = process.env.CAREER_HOME || '';
    configPath = path.join(home, 'career-test-fetch-config.json');
  }
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return { routesBase64: '', fetchLog: '' };
}

function decodeRoutes(config) {
  const raw = config.routesBase64;
  if (!raw) return [];
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return [];
  }
}

function readQueryParam(url, name) {
  try {
    return new URL(url).searchParams.get(name) || '';
  } catch {
    return '';
  }
}

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

function logRequest(url, fetchLogPath) {
  if (!fetchLogPath) return;
  try {
    fs.appendFileSync(fetchLogPath, url + '\n');
  } catch {
    // Logging is diagnostic only.
  }
}

const config = loadConfig();
const routes = decodeRoutes(config);

globalThis.fetch = async function interceptedFetch(url, init) {
  const href = typeof url === 'string' ? url : String(url && url.url ? url.url : url);
  logRequest(href, config.fetchLog);

  for (const route of routes) {
    if (!route || typeof route.urlPrefix !== 'string' || !href.startsWith(route.urlPrefix)) continue;
    const status = typeof route.status === 'number' ? route.status : 200;
    let body = typeof route.body === 'string' ? route.body : '';
    if (route.bodies && route.queryParam) {
      const key = readQueryParam(href, route.queryParam);
      if (Object.prototype.hasOwnProperty.call(route.bodies, key)) body = route.bodies[key];
    }
    return makeResponse(status, body);
  }

  if (typeof realFetch === 'function') return realFetch(url, init);
  throw new Error('job-board-fetch-intercept: no route for ' + href);
};
