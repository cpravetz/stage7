const DEFAULT_PROVIDER_TIMEOUT_MS = 10000;

export function providerTimeoutMs(): number {
  const configured = Number(process.env.BRAIN_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PROVIDER_TIMEOUT_MS;
}

export async function fetchProvider(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}