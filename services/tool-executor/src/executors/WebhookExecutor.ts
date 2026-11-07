import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials } from '../services/CredentialProvider';

export interface WebhookDispatchOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  secret?: string;
  event?: string;
  retries?: number;
  timeoutMs?: number;
  idempotencyKey?: string;
  executionId?: string;
  lookupUrl?: string;
  providerRequestIdHeader?: string;
}

export interface WebhookDispatchResult {
  success: boolean;
  statusCode?: number;
  response?: unknown;
  error?: string;
  durationMs?: number;
  idempotencyKey?: string;
  providerRequestId?: string;
  outcomeKnown?: boolean;
  reconciliation?: Record<string, unknown>;
}

export class WebhookExecutor {
  async execute(options: WebhookDispatchOptions, _credentials: ToolCredentials): Promise<WebhookDispatchResult> {
    const startTime = Date.now();
    const {
      url,
      method = 'POST',
      headers = {},
      body,
      secret,
      event,
      retries = 3,
      timeoutMs = 10000,
    } = options;
    const idempotencyKey = options.idempotencyKey || options.executionId;

    if (!url) {
      return { success: false, error: 'Webhook URL is required', durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false, reconciliation: { provider: 'webhook', outcomeKnown: false, note: 'No URL provided.' } };
    }

    if (options.lookupUrl) {
      try {
        const res = await fetch(options.lookupUrl, { method: 'GET', headers: { Accept: 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) } });
        const responseText = await res.text().catch(() => '');
        let responseData: unknown = responseText;
        try { responseData = JSON.parse(responseText); } catch {}
        return {
          success: res.ok,
          statusCode: res.status,
          response: responseData,
          error: res.ok ? undefined : `Webhook lookup failed (${res.status})`,
          durationMs: Date.now() - startTime,
          idempotencyKey,
          outcomeKnown: res.ok,
          reconciliation: { provider: 'webhook', lookupAttempted: true, lookupStatus: String(res.status), outcomeKnown: res.ok, note: res.ok ? 'Webhook/status lookup completed.' : 'Webhook/status lookup attempted but did not confirm outcome.' },
        };
      } catch (err) {
        return {
          success: false,
          error: `Webhook lookup error: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - startTime,
          idempotencyKey,
          outcomeKnown: false,
          reconciliation: { provider: 'webhook', lookupAttempted: true, outcomeKnown: false, note: 'Webhook/status lookup failed; outcome unknown.' },
        };
      }
    }

    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (secret) finalHeaders['X-Webhook-Secret'] = secret;
    if (event) finalHeaders['X-Webhook-Event'] = event;
    if (idempotencyKey) {
      finalHeaders['Idempotency-Key'] = idempotencyKey;
      finalHeaders['X-Idempotency-Key'] = idempotencyKey;
    }

    const payload = body || { event, timestamp: Date.now() };
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    let providerRequestId: string | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method,
          headers: finalHeaders,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        lastStatus = response.status;
        providerRequestId = response.headers.get(options.providerRequestIdHeader || 'x-request-id') || response.headers.get('x-correlation-id') || undefined;

        const responseText = await response.text();
        let responseData: unknown = responseText;
        try { responseData = JSON.parse(responseText); } catch {}

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            response: responseData,
            durationMs: Date.now() - startTime,
            idempotencyKey,
            providerRequestId,
            outcomeKnown: true,
            reconciliation: { provider: 'webhook', outcomeKnown: true, providerRequestId, lookupStatus: String(response.status), note: 'Webhook accepted the request. Provider-side dedup depends on the remote endpoint honoring Idempotency-Key.' },
          };
        }

        lastError = `HTTP ${response.status}: ${typeof responseData === 'string' ? responseData.slice(0, 200) : JSON.stringify(responseData).slice(0, 200)}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    return {
      success: false,
      statusCode: lastStatus,
      error: lastError || `Webhook delivery failed after ${retries} attempts`,
      durationMs: Date.now() - startTime,
      idempotencyKey,
      providerRequestId,
      outcomeKnown: false,
      reconciliation: { provider: 'webhook', outcomeKnown: false, providerRequestId, lookupStatus: lastStatus !== undefined ? String(lastStatus) : undefined, note: 'Webhook delivery failed or response was ambiguous. If a prior attempt may have been accepted by the remote service, use lookupUrl/provider status before retrying; tool-executor cannot determine remote side effects without that.' },
    };
  }
}
