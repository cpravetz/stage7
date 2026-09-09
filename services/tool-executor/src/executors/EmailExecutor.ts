import nodemailer from 'nodemailer';
import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

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
}

export class EmailExecutor {
  private credentialProvider = CredentialProvider;
  private transporter: nodemailer.Transporter | null = null;

  async execute(options: EmailOptions, credentials: ToolCredentials): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const smtpHost = credentials.smtp_host || process.env.SMTP_HOST;
    const smtpPort = credentials.smtp_port ? parseInt(credentials.smtp_port, 10) : parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = credentials.smtp_user || process.env.SMTP_USER;
    const smtpPass = credentials.smtp_pass || process.env.SMTP_PASS;
    const fromAddress = options.from || credentials.from_address || process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return {
        success: false,
        error: 'Missing SMTP credentials. Provide smtp_host, smtp_user, and smtp_pass via Vault or environment.',
      };
    }

    try {
      if (!this.transporter) {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      }

      const info = await this.transporter.sendMail({
        from: fromAddress,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });

      logger.info({ messageId: info.messageId, to: options.to, subject: options.subject }, 'Email sent successfully');
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMessage, to: options.to, subject: options.subject }, 'Email send failed');
      return { success: false, error: errorMessage };
    }
  }
}
