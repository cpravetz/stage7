import type { NativeExecutorKey } from '../types';

/**
 * Manifest-keyed dispatch data for the native executors.
 *
 * Every entry answers two questions with data instead of tool-name substrings:
 * which payload a tool's code module expects, and how the module's result maps
 * back into dispatch's return shape. The manifest's `executor` key is
 * authoritative; `fallbackMatch` keeps manifests that declare their category
 * through other data (capabilities, MCP server) on their existing path. A tool
 * whose manifest declares neither routes to discovery/plugin generation —
 * the same fall-through it had when no heuristic matched.
 */

/** `value || fallback` on an unknown-typed field, without claiming it is a string. */
function withDefault(value: unknown, fallback: unknown): unknown {
  return value || fallback;
}

/** Manifest-data predicate deciding an un-keyed tool's executor category. */
type FallbackMatch = (
  manifest: Record<string, unknown> | undefined,
  capabilities: string[],
) => boolean;

export interface ExecutorBinding {
  /** Category name used verbatim in "No code file resolved for X tool" errors. */
  readonly label: string;
  /** Maps raw tool input into the code module's payload. */
  readonly buildInput: (
    input: Record<string, unknown>,
    manifest: Record<string, unknown> | undefined,
  ) => Record<string, unknown>;
  /** Maps a successful module result into dispatch's return shape. */
  readonly mapOutput: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Manifest-data fallback for tools whose manifest does not declare `executor`. */
  readonly fallbackMatch?: FallbackMatch;
}

export const EXECUTOR_BINDINGS: Partial<Record<NativeExecutorKey, ExecutorBinding>> = {
  ftp: {
    label: 'FTP',
    buildInput: (input) => ({
      host: withDefault(input.host, ''),
      port: withDefault(input.port, 21),
      username: withDefault(input.username, ''),
      password: withDefault(input.password, ''),
      operation: withDefault(input.operation, 'list'),
      remotePath: input.remotePath,
      localPath: input.localPath,
      content: input.content,
    }),
    mapOutput: (data) => ({ output: data.output, durationMs: data.durationMs }),
  },

  webhook: {
    label: 'webhook',
    buildInput: (input) => ({
      url: withDefault(input.url, ''),
      method: withDefault(input.method, 'POST'),
      headers: input.headers,
      body: input.body,
      secret: input.secret,
      event: input.event,
      retries: withDefault(input.retries, 3),
      timeoutMs: withDefault(input.timeoutMs, 10000),
      idempotencyKey: withDefault(input.idempotencyKey, input.executionId),
      lookupUrl: input.lookupUrl,
    }),
    mapOutput: (data) => ({
      statusCode: data.statusCode,
      response: data.response,
      durationMs: data.durationMs,
      idempotencyKey: data.idempotencyKey,
      providerRequestId: data.providerRequestId,
      outcomeKnown: data.outcomeKnown,
      reconciliation: data.reconciliation,
    }),
  },

  database: {
    label: 'database',
    fallbackMatch: (_manifest, capabilities) => capabilities.includes('query'),
    buildInput: (input) => ({
      engine: withDefault(input.engine, 'sqlite'),
      connectionString: input.connectionString,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      password: input.password,
      query: withDefault(input.query, ''),
      params: input.params,
      timeoutMs: withDefault(input.timeoutMs, 30000),
    }),
    mapOutput: (data) => ({
      rows: data.rows,
      columns: data.columns,
      rowCount: data.rowCount,
      durationMs: data.durationMs,
    }),
  },

  files: {
    label: 'file',
    fallbackMatch: (_manifest, capabilities) => capabilities.includes('read') || capabilities.includes('write'),
    buildInput: (input) => ({
      operation: withDefault(input.operation, 'read'),
      path: withDefault(input.path, ''),
      content: input.content,
      bucket: input.bucket,
    }),
    mapOutput: (data) => ({
      data: data.data,
      durationMs: data.durationMs,
      idempotencyKey: data.idempotencyKey,
      providerRequestId: data.providerRequestId,
      outcomeKnown: data.outcomeKnown,
      reconciliation: data.reconciliation,
    }),
  },

  vendor: {
    label: 'vendor',
    buildInput: (input, manifest) => ({
      // Vendor identity is manifest data — the schema requires `vendor` for
      // executor: 'vendor', so no name inference here.
      vendor: manifest?.vendor,
      operation: withDefault(input.operation, 'query'),
      input,
      idempotencyKey: withDefault(input.idempotencyKey, input.executionId),
      lookupUrl: input.lookupUrl,
    }),
    mapOutput: (data) => ({
      data: data.data,
      durationMs: data.durationMs,
      idempotencyKey: data.idempotencyKey,
      providerRequestId: data.providerRequestId,
      outcomeKnown: data.outcomeKnown,
      reconciliation: data.reconciliation,
    }),
  },

  email: {
    label: 'email',
    fallbackMatch: (manifest, capabilities) =>
      manifest?.server === 'email-mcp' || capabilities.includes('send'),
    buildInput: (input) => ({
      to: withDefault(input.to, ''),
      subject: withDefault(input.subject, ''),
      text: withDefault(input.body, input.text),
      html: input.html,
      from: input.from,
      attachments: withDefault(input.attachments, []),
      idempotencyKey: withDefault(input.idempotencyKey, input.executionId),
      lookupUrl: input.lookupUrl,
      lookupRequestId: input.lookupRequestId,
    }),
    mapOutput: (data) => ({
      messageId: data.messageId,
      providerRequestId: data.providerRequestId,
      status: 'sent',
      idempotencyKey: data.idempotencyKey,
      outcomeKnown: data.outcomeKnown,
      reconciliation: data.reconciliation,
    }),
  },

  search: {
    label: 'search',
    fallbackMatch: (_manifest, capabilities) => capabilities.includes('search'),
    buildInput: (input) => ({
      query: withDefault(withDefault(input.query, input.q), ''),
      maxResults: withDefault(withDefault(input.maxResults, input.max_results), 10),
      searchType: withDefault(input.searchType, 'web'),
      freshness: input.freshness || undefined,
    }),
    mapOutput: (data) => {
      const results = data.results as unknown[] | undefined;
      return { results: data.results, count: results?.length ?? 0 };
    },
  },
};

/**
 * First-match order for the capability fallbacks. Preserves the relative
 * order of the heuristic chain it replaced: a manifest declaring both
 * `query` and `read` resolved to the database binding before files.
 */
const FALLBACK_ORDER: NativeExecutorKey[] = ['database', 'files', 'email', 'search'];

/**
 * Resolve the binding that dispatches this tool, from manifest data only.
 * A declared `executor` key wins even if the key has no binding table entry
 * (those tools route through the explicit executor path and never reach the
 * binding fallback).
 */
export function resolveNativeBinding(
  manifest: Record<string, unknown> | undefined,
  capabilities: string[],
): ExecutorBinding | undefined {
  const declared = manifest?.executor;
  if (typeof declared === 'string' && declared) {
    return EXECUTOR_BINDINGS[declared as NativeExecutorKey];
  }
  for (const key of FALLBACK_ORDER) {
    const binding = EXECUTOR_BINDINGS[key];
    if (binding?.fallbackMatch?.(manifest, capabilities)) return binding;
  }
  return undefined;
}

/** Providers whose post-execution outcome can carry reconciliation metadata. */
export type ReconciliationProvider = 'email' | 'webhook' | 'api_client' | 'vendor' | 'unknown';

/**
 * Classify a tool's external provider for execution reconciliation, from the
 * manifest's `executor` key alone. Tool names are not evidence: a tool named
 * "email-template-renderer" never sent mail, and labeling it as an SMTP
 * provider produced wrong reconciliation guidance.
 */
export function reconciliationProvider(manifest: unknown): ReconciliationProvider {
  const key = (manifest as Record<string, unknown> | undefined)?.executor;
  return key === 'email' || key === 'webhook' || key === 'api_client' || key === 'vendor'
    ? key
    : 'unknown';
}
