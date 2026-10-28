import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import * as https from 'https';

export interface SmsOptions {
  to: string;
  from?: string;
  body: string;
}

export class SmsExecutor {
  private credentialProvider = CredentialProvider;
  private baseUrl: string | null = null;

  async execute(options: SmsOptions, credentials: ToolCredentials): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const accountSid = credentials.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = credentials.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
    const from = options.from || credentials.twilioFromNumber || process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: 'Missing Twilio credentials. Provide twilio_account_sid and twilio_auth_token via Vault or environment.',
      };
    }

    if (!from) {
      return {
        success: false,
        error: 'Missing Twilio From number. Provide twilio_from_number or set TWILIO_FROM_NUMBER environment variable.',
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
            'Content-Length': Buffer.byteLength(body),
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

      return { success: true, messageId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMessage, to: options.to }, 'SMS send failed');
      return { success: false, error: errorMessage };
    }
  }
}
