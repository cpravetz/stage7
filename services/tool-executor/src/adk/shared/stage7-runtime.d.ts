/**
 * Type declarations for `stage7-runtime.js`, the CommonJS runtime that
 * CodeExecutor copies verbatim into every JavaScript skill sandbox.
 *
 * The `.js` file is the source of truth; generated sandbox code does
 * `require('./stage7-runtime')` at runtime. This declaration exists so
 * editors and type-aware tooling can resolve that module during skill
 * development — the runtime itself never participates in the TypeScript
 * build.
 */

export interface Stage7Store {
  read(key: string, defaultValue?: unknown): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  [key: string]: unknown;
}

export interface Stage7RenderBlock {
  type: string;
  [key: string]: unknown;
}

export interface Stage7RuntimeContext<
  TInput = Record<string, unknown>,
  TConfig = Record<string, unknown>,
> {
  input: TInput;
  config: TConfig;
  credentials: Record<string, string>;
  store: Stage7Store;
  render(blocks: Stage7RenderBlock[]): void;
  delegate(...args: unknown[]): Promise<never>;
  [key: string]: unknown;
}

export interface Stage7RuntimeContextOptions {
  /** Env var (default `ASSISTANT_HOME`) that scopes the sandbox's store dir. */
  persistenceEnvVar?: string;
  config?: Record<string, unknown>;
  credentials?: Record<string, string>;
  [key: string]: unknown;
}

export function context<TInput = Record<string, unknown>, TConfig = Record<string, unknown>>(
  opts?: Stage7RuntimeContextOptions,
): Stage7RuntimeContext<TInput, TConfig>;

export function createRuntimeContext<
  TInput = Record<string, unknown>,
  TConfig = Record<string, unknown>,
>(opts?: Stage7RuntimeContextOptions): Stage7RuntimeContext<TInput, TConfig>;
