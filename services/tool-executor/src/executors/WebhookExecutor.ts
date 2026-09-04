import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import fs from 'fs';

export interface WebhookDispatchOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  secret?: string;
  event?: string;
  retries?: number;
  timeoutMs?: number;
}

export interface WebhookDispatchResult {
  success: boolean;
  statusCode?: number;
  response?: unknown;
  error?: string;
  durationMs?: number;
}

export class WebhookExecutor {
  private credentialProvider = CredentialProvider;

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

    if (!url) {
      return { success: false, error: 'Webhook URL is required', durationMs: Date.now() - startTime };
    }

    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (secret) {
      finalHeaders['X-Webhook-Secret'] = secret;
    }

    if (event) {
      finalHeaders['X-Webhook-Event'] = event;
    }

    const payload = body || { event, timestamp: Date.now() };

    let lastError: string | undefined;

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

        const responseText = await response.text();
        let responseData: unknown = responseText;
        try {
          responseData = JSON.parse(responseText);
        } catch {
          // keep as text
        }

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            response: responseData,
            durationMs: Date.now() - startTime,
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
      error: lastError || `Webhook delivery failed after ${retries} attempts`,
      durationMs: Date.now() - startTime,
    };
  }
}
