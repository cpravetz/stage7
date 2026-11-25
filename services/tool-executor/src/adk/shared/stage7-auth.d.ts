/**
 * Type declarations for `stage7-auth.js`, the CommonJS auth module CodeExecutor
 * inlines verbatim into every JavaScript sandbox as the `__resolveAuth`
 * prelude. The `.js` file is the source of truth; this declaration exists so
 * editors, tests, and type-aware tooling can resolve the module — it never
 * participates in the TypeScript build itself.
 */

export interface Stage7ResolvedAuth {
  headers: Record<string, string>;
  type: 'bearer' | 'basic' | 'api_key' | 'custom' | 'none';
}

export function resolveAuth(
  auth: {
    type?: Stage7ResolvedAuth['type'];
    token?: unknown;
    accessToken?: unknown;
    username?: unknown;
    password?: unknown;
    header?: string;
    value?: unknown;
    apiKey?: unknown;
    headers?: Record<string, unknown> | null;
  } | null | undefined,
): Promise<Stage7ResolvedAuth>;

export function resolveAuthValue(val: unknown): Promise<string>;
