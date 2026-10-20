import { httpRequest } from '@stage7-nextgen/shared';

const DEFAULT_PROVIDER_TIMEOUT_MS = 300000;

export function providerTimeoutMs(): number {
  const configured = Number(process.env.BRAIN_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PROVIDER_TIMEOUT_MS;
}

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const [key, value] of headers) record[key] = value;
    return record;
  }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  return headers as Record<string, string>;
}

export async function fetchProvider(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const timeoutMs = providerTimeoutMs();
  const body = init.body;
  const isPlainBody = body === undefined || typeof body === 'string' || body instanceof Uint8Array;

  if (!isPlainBody) {
    // Streams and form data are not supported by the explicit client.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Provider request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    // `fetch` aborts a request that has not received response headers within
    // 300 seconds, which is shorter than the provider timeout this service
    // is configured with. The explicit client keeps the configured timeout.
    return await httpRequest(String(input), {
      method: init.method,
      headers: toHeaderRecord(init.headers),
      body: body as string | Uint8Array | undefined,
      timeoutMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timed out/i.test(message)) {
      throw new Error(`Provider request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}
