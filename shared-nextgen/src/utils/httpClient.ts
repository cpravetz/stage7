export interface HttpClientOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /**
   * Total time allowed for the request, including reading the response body.
   * `0` disables the timeout.
   */
  timeoutMs?: number;
  /** Caller supplied cancellation signal, combined with the timeout. */
  signal?: AbortSignal;
}

interface FetchDispatcher {
  dispatch: unknown;
}

let dispatcherPromise: Promise<FetchDispatcher | undefined> | undefined;

/**
 * Undici applies an implicit 300 second ceiling to the time a response may
 * take to produce headers, and another 300 second ceiling to the gaps between
 * body chunks. Both are independent of the timeout the caller configured, so a
 * slow-but-legitimate call (a model completion, an agent task) is killed by
 * that ceiling and surfaces as an opaque "fetch failed" with no indication of
 * what went wrong. A dispatcher with those implicit ceilings disabled leaves
 * the caller's timeout as the only limit.
 */
function resolveDispatcher(): Promise<FetchDispatcher | undefined> {
  if (!dispatcherPromise) {
    dispatcherPromise = (async () => {
      try {
        // Resolved lazily so the package still loads when undici is absent.
        const undici = require('undici');
        const Agent = undici?.Agent;
        if (!Agent) return undefined;
        return new Agent({
          headersTimeout: 0,
          bodyTimeout: 0,
        }) as unknown as FetchDispatcher;
      } catch {
        return undefined;
      }
    })();
  }
  return dispatcherPromise;
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Performs an HTTP request and resolves with a standard `Response`.
 *
 * The response body is buffered so the configured timeout covers the whole
 * transfer, not only the arrival of the response headers.
 */
export async function httpRequest(
  url: string,
  options: HttpClientOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 0;
  const dispatcher = await resolveDispatcher();
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const signals: AbortSignal[] = [];
  if (options.signal) signals.push(options.signal);
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    signals.push(controller.signal);
  }
  const signal = signals.length === 1 ? signals[0] : signals.length > 1 ? AbortSignal.any(signals) : undefined;

  try {
    const init: RequestInit & { dispatcher?: unknown } = {
      method: options.method || 'GET',
      headers: options.headers,
      signal,
    };
    if (options.body !== undefined) init.body = options.body as any;
    if (dispatcher) (init as Record<string, unknown>).dispatcher = dispatcher;

    const response = await fetch(url, init as RequestInit);
    if (typeof response.arrayBuffer !== 'function') {
      return response;
    }
    let bodyInit: any = null;
    try {
      bodyInit = await response.arrayBuffer();
    } catch {
      bodyInit = null;
    }
    return new Response(NULL_BODY_STATUSES.has(response.status) ? null : bodyInit, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Describes a failed request in a way that names the actual cause instead of
 * the generic "fetch failed" that `fetch` produces.
 */
export function describeRequestError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && cause.message !== err.message) {
    return `${err.message} (${cause.message})`;
  }
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string') return `${err.message} (${code})`;
  }
  return err.message;
}
