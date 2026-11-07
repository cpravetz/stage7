import nodemailer from 'nodemailer';
import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials } from '../services/CredentialProvider';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  attachments?: Array<{
    filename?: string;
    content?: string | Buffer;
    path?: string;
  }>;
  idempotencyKey?: string;
  executionId?: string;
  headers?: Record<string, string>;
  /** Provider-specific lookup hook (e.g. SendGrid/SES message status URL) for reconciliation. */
  lookupUrl?: string;
  lookupRequestId?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  providerRequestId?: string;
  error?: string;
  idempotencyKey?: string;
  outcomeKnown?: boolean;
  reconciliation?: Record<string, unknown>;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export class EmailExecutor {
  async execute(options: EmailOptions, credentials: ToolCredentials): Promise<EmailResult> {
    const smtpHost = credentials.smtp_host;
    const smtpPort = credentials.smtp_port ? parseInt(String(credentials.smtp_port), 10) : 587;
    const smtpUser = credentials.smtp_user;
    const smtpPass = credentials.smtp_pass;
    const fromAddress = options.from || credentials.from_address || smtpUser;
    const secureOverride = parseBoolean(credentials.secure);
    const secure = secureOverride ?? smtpPort === 465;
    const idempotencyKey = options.idempotencyKey || options.executionId;

    // Reconciliation hook: generic lookup URL when the caller has a provider status endpoint.
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
            provider: 'email-lookup',
            lookupAttempted: true,
            lookupStatus: String(res.status),
            lookupOutcome: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500),
            outcomeKnown: res.ok,
            note: res.ok ? 'Email provider lookup completed.' : 'Email provider lookup attempted but did not confirm outcome.',
          },
          ...(res.ok ? {} : { error: `Email lookup failed (${res.status})` }),
        };
      } catch (err) {
        return {
          success: false,
          error: `Email lookup error: ${err instanceof Error ? err.message : String(err)}`,
          idempotencyKey,
          outcomeKnown: false,
          reconciliation: { provider: 'email-lookup', lookupAttempted: true, outcomeKnown: false, note: 'Email provider lookup failed; outcome unknown.' },
        };
      }
    }

    if (!smtpHost || !smtpUser || !smtpPass) {
      return {
        success: false,
        error: 'Missing SMTP credentials. Provide smtp_host, smtp_user, and smtp_pass.',
        idempotencyKey,
        outcomeKnown: false,
        reconciliation: { provider: 'smtp', outcomeKnown: false, note: 'Cannot send or reconcile without SMTP credentials.' },
      };
    }

    try {
      // Create per execution so config changes (including `secure`) take effect without restart.
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      // Pass idempotency key in headers when caller supplies it; SMTP/provider support varies and does not guarantee dedup.
      const headers: Record<string, string> = { ...(options.headers || {}) };
      if (idempotencyKey) {
        headers['X-Idempotency-Key'] = idempotencyKey;
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const info = await transporter.sendMail({
        from: fromAddress,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        headers,
        messageId: options.lookupRequestId ? `<${options.lookupRequestId}>` : undefined,
      });

      logger.info({ messageId: info.messageId, to: options.to, subject: options.subject, idempotencyKey }, 'Email sent successfully');
      return {
        success: true,
        messageId: info.messageId,
        providerRequestId: info.messageId,
        idempotencyKey,
        outcomeKnown: true,
        reconciliation: {
          provider: 'smtp',
          outcomeKnown: true,
          providerRequestId: info.messageId,
          note: 'SMTP server accepted the message. SMTP has no portable post-send status lookup by idempotency key; if a later response is lost after acceptance, delivery outcome may require a provider-specific API.',
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMessage, to: options.to, subject: options.subject, idempotencyKey }, 'Email send failed');
      return {
        success: false,
        error: errorMessage,
        idempotencyKey,
        outcomeKnown: false,
        reconciliation: {
          provider: 'smtp',
          outcomeKnown: false,
          note: 'SMTP send failed or transport outcome is ambiguous. Do not blindly retry without checking provider-specific delivery/status when possible; SMTP cannot confirm whether the server accepted the message before the error.',
        },
      };
    }
  }
}
