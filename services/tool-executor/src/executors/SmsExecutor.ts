import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials } from '../services/CredentialProvider';
import * as https from 'https';

export interface SmsOptions {
  to: string;
  body: string;
  from?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  lookupMessageSid?: string;
  idempotencyKey?: string;
  executionId?: string;
  /** Provider-specific status lookup URL (Twilio message status endpoint). */
  lookupUrl?: string;
  lookupRequestId?: string;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  providerRequestId?: string;
  error?: string;
  idempotencyKey?: string;
  outcomeKnown?: boolean;
  reconciliation?: Record<string, unknown>;
}

export class SmsExecutor {
  private baseUrl: string | null = null;

  async execute(options: SmsOptions, credentials: ToolCredentials): Promise<SmsResult> {
    const accountSid = credentials.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = credentials.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
    const from = options.from || credentials.twilio_from_number || process.env.TWILIO_FROM_NUMBER;
    const idempotencyKey = options.idempotencyKey || options.executionId;

    // Reconciliation hook: caller-supplied Twilio message status endpoint.
    if (options.lookupUrl && typeof options.lookupUrl === 'string') {
      try {
        const res = await fetch(options.lookupUrl, { method: 'GET', headers: { Accept: 'application/json' } });
        const text = await res.text().catch(() => '');
        let body: any = text;
        try { body = text ? JSON.parse(text) : text; } catch {}
        return {
          success: res.ok,
          providerRequestId: options.lookupRequestId,
          idempotencyKey,
          outcomeKnown: res.ok,
          reconciliation: {
            provider: 'twilio',
            lookupAttempted: true,
            lookupStatus: String(res.status),
            lookupOutcome: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500),
            outcomeKnown: res.ok,
            note: res.ok ? 'Twilio message status lookup completed.' : 'Twilio message status lookup attempted but did not confirm outcome.',
          },
          ...(res.ok ? {} : { error: `Twilio lookup failed (${res.status})` }),
        };
      } catch (err) {
        return {
          success: false,
          error: `Twilio lookup error: ${err instanceof Error ? err.message : String(err)}`,
          idempotencyKey,
          outcomeKnown: false,
          reconciliation: { provider: 'twilio', lookupAttempted: true, outcomeKnown: false, note: 'Twilio message status lookup failed; outcome unknown.' },
        };
      }
    }

    // Reconciliation hook: look up an existing message by SID so a lost response
    // after a prior send can still be reconciled. Twilio exposes a per-message
    // status endpoint, so this is a real (not best-effort) outcome lookup.
    if (options.lookupMessageSid && typeof options.lookupMessageSid === 'string' && accountSid && authToken) {
      const lookupUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${encodeURIComponent(options.lookupMessageSid)}.json`;
      try {
        const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const res = await fetch(lookupUrl, { method: 'GET', headers: { Authorization: authHeader, Accept: 'application/json' } });
        const text = await res.text().catch(() => '');
        let body: any = text;
        try { body = text ? JSON.parse(text) : text; } catch {}
        const delivered = res.ok && body && typeof body === 'object' && (body.status === 'delivered' || body.status === 'sent');
        return {
          success: res.ok,
          providerRequestId: options.lookupMessageSid,
          idempotencyKey,
          outcomeKnown: delivered,
          reconciliation: {
            provider: 'twilio',
            lookupAttempted: true,
            lookupStatus: String(res.status),
            lookupOutcome: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500),
            outcomeKnown: delivered,
            note: delivered ? 'Twilio message status lookup confirmed delivery.' : 'Twilio message status lookup did not confirm delivery.',
          },
          ...(delivered ? {} : { error: `Twilio message ${options.lookupMessageSid} not confirmed delivered` }),
        };
      } catch (err) {
        return {
          success: false,
          error: `Twilio lookup error: ${err instanceof Error ? err.message : String(err)}`,
          idempotencyKey,
          outcomeKnown: false,
          reconciliation: { provider: 'twilio', lookupAttempted: true, outcomeKnown: false, note: 'Twilio message status lookup failed; outcome unknown.' },
        };
      }
    }

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: 'Missing Twilio credentials. Provide twilio_account_sid and twilio_auth_token via Vault or environment.',
        idempotencyKey,
        outcomeKnown: false,
        reconciliation: { provider: 'twilio', outcomeKnown: false, note: 'Cannot send or reconcile without Twilio credentials.' },
      };
    }
    if (!from) {
      return {
        success: false,
        error: 'Missing Twilio From number. Provide twilio_from_number or set TWILIO_FROM_NUMBER environment variable.',
        idempotencyKey,
        outcomeKnown: false,
        reconciliation: { provider: 'twilio', outcomeKnown: false, note: 'Cannot send without a From number.' },
      };
    }

    if (!this.baseUrl) {
      this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const bodyParams = new URLSearchParams();
      bodyParams.set('From', from);
      bodyParams.set('To', options.to);
      bodyParams.set('Body', options.body);
      const body = bodyParams.toString();
      const url = new URL(this.baseUrl);
      let messageId: string | undefined;
      await new Promise<void>((resolve, reject) => {
        const req = https.request(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body).toString(),
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const result = JSON.parse(data);
                messageId = result.sid;
                logger.info({ messageId, to: options.to }, 'SMS sent successfully');
                resolve();
              } catch {
                resolve();
              }
            } else {
              let errorMessage = `Twilio API error (${res.statusCode})`;
              try {
                const result = JSON.parse(data);
                errorMessage = result.message || errorMessage;
              } catch { /* ignore */ }
              logger.error({ status: res.statusCode, error: errorMessage, to: options.to }, 'Twilio SMS send failed');
              reject(new Error(errorMessage));
            }
          });
        });
        req.on('error', (err) => reject(err));
        req.write(body);
        req.end();
      });

      return {
        success: true,
        messageId,
        providerRequestId: messageId,
        idempotencyKey,
        outcomeKnown: true,
        reconciliation: {
          provider: 'twilio',
          outcomeKnown: true,
          providerRequestId: messageId,
          note: 'Twilio accepted the SMS. Pass lookupMessageSid/lookupUrl to reconcile delivery status on a lost response.',
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMessage, to: options.to }, 'SMS send failed');
      return {
        success: false,
        error: errorMessage,
        idempotencyKey,
        outcomeKnown: false,
        reconciliation: {
          provider: 'twilio',
          outcomeKnown: false,
          note: 'Twilio SMS send failed or transport outcome is ambiguous. Do not blindly retry without checking provider-specific delivery/status when possible.',
        },
      };
    }
  }
}