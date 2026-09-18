import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EMAIL_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error', 'not-connected'] },
    system: { type: 'string' },
    action: { type: 'string' },
    operation: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'operation', 'request', 'response', 'error'],
};

export const emailIntegrationSkill = createExternalActionSkill({
  id: 'email-integration',
  name: 'Email Integration',
  description: 'Unified email operations via POP3, IMAP, and SMTP. Supports listing, fetching, searching, sending, and managing emails across protocols. Requires configured email server endpoints and credentials.',
  system: 'email',
  action: 'execute',
  endpoint: { envVar: 'EMAIL_INTEGRATION_ENDPOINT', method: 'POST' },
  auth: {
    type: 'custom',
    credentialEnvKeyMap: {
      imapHost: 'EMAIL_IMAP_HOST',
      imapPort: 'EMAIL_IMAP_PORT',
      imapUser: 'EMAIL_IMAP_USER',
      imapPassword: 'EMAIL_IMAP_PASSWORD',
      smtpHost: 'EMAIL_SMTP_HOST',
      smtpPort: 'EMAIL_SMTP_PORT',
      smtpUser: 'EMAIL_SMTP_USER',
      smtpPassword: 'EMAIL_SMTP_PASSWORD',
      pop3Host: 'EMAIL_POP3_HOST',
      pop3Port: 'EMAIL_POP3_PORT',
      pop3User: 'EMAIL_POP3_USER',
      pop3Password: 'EMAIL_POP3_PASSWORD',
    },
  },
  configSchema: {
    type: 'object',
    properties: {
      // IMAP Configuration
      imapHost: { type: 'string', description: 'IMAP server hostname (e.g., imap.gmail.com)' },
      imapPort: { type: 'integer', description: 'IMAP server port (typically 993 for SSL)', default: 993 },
      imapTls: { type: 'boolean', description: 'Use TLS/SSL for IMAP', default: true },
      imapUser: { type: 'string', description: 'IMAP username/email' },
      imapPassword: { type: 'string', description: 'IMAP password or app-specific password' },
      
      // SMTP Configuration
      smtpHost: { type: 'string', description: 'SMTP server hostname (e.g., smtp.gmail.com)' },
      smtpPort: { type: 'integer', description: 'SMTP server port (typically 465 for SSL, 587 for STARTTLS)', default: 465 },
      smtpTls: { type: 'boolean', description: 'Use TLS/SSL for SMTP', default: true },
      smtpStartTls: { type: 'boolean', description: 'Use STARTTLS for SMTP (port 587)', default: false },
      smtpUser: { type: 'string', description: 'SMTP username/email' },
      smtpPassword: { type: 'string', description: 'SMTP password or app-specific password' },
      
      // POP3 Configuration
      pop3Host: { type: 'string', description: 'POP3 server hostname (e.g., pop.gmail.com)' },
      pop3Port: { type: 'integer', description: 'POP3 server port (typically 995 for SSL)', default: 995 },
      pop3Tls: { type: 'boolean', description: 'Use TLS/SSL for POP3', default: true },
      pop3User: { type: 'string', description: 'POP3 username/email' },
      pop3Password: { type: 'string', description: 'POP3 password or app-specific password' },
      
      // General
      defaultFolder: { type: 'string', description: 'Default IMAP folder/mailbox', default: 'INBOX' },
      confirmBeforeSend: { type: 'boolean', description: 'Require explicit confirmation before sending emails', default: true },
      dryRun: { type: 'boolean', description: 'Validate without executing; defaults to true', default: true },
    },
    required: [],
  },
  credentialSource: {
    imapHost: { envVar: 'EMAIL_IMAP_HOST', configKey: 'email.imap.host' },
    imapPort: { envVar: 'EMAIL_IMAP_PORT', configKey: 'email.imap.port' },
    imapUser: { envVar: 'EMAIL_IMAP_USER', configKey: 'email.imap.user' },
    imapPassword: { envVar: 'EMAIL_IMAP_PASSWORD', configKey: 'email.imap.password' },
    smtpHost: { envVar: 'EMAIL_SMTP_HOST', configKey: 'email.smtp.host' },
    smtpPort: { envVar: 'EMAIL_SMTP_PORT', configKey: 'email.smtp.port' },
    smtpUser: { envVar: 'EMAIL_SMTP_USER', configKey: 'email.smtp.user' },
    smtpPassword: { envVar: 'EMAIL_SMTP_PASSWORD', configKey: 'email.smtp.password' },
    pop3Host: { envVar: 'EMAIL_POP3_HOST', configKey: 'email.pop3.host' },
    pop3Port: { envVar: 'EMAIL_POP3_PORT', configKey: 'email.pop3.port' },
    pop3User: { envVar: 'EMAIL_POP3_USER', configKey: 'email.pop3.user' },
    pop3Password: { envVar: 'EMAIL_POP3_PASSWORD', configKey: 'email.pop3.password' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(
        ['list-messages', 'fetch-message', 'search-messages', 'send-message', 'delete-message', 'mark-read', 'mark-unread', 'list-folders', 'create-folder'],
        { description: 'Email operation to perform' }
      ),
      // Common
      protocol: SchemaProps.select(['imap', 'pop3', 'smtp'], { description: 'Protocol to use for this operation', default: 'imap' }),
      folder: { type: 'string', description: 'IMAP folder/mailbox (e.g., INBOX, Sent, Drafts)', default: 'INBOX' },
      
      // List messages
      limit: { type: 'integer', description: 'Maximum messages to return', default: 50, minimum: 1, maximum: 500 },
      offset: { type: 'integer', description: 'Offset for pagination', default: 0 },
      since: { type: 'string', description: 'ISO 8601 date - only messages after this date' },
      before: { type: 'string', description: 'ISO 8601 date - only messages before this date' },
      seen: { type: 'boolean', description: 'Filter by read/unread status' },
      flagged: { type: 'boolean', description: 'Filter by flagged status' },
      
      // Fetch message
      messageId: { type: 'string', description: 'Message UID or sequence number' },
      includeBody: { type: 'boolean', description: 'Include full message body', default: true },
      includeAttachments: { type: 'boolean', description: 'Include attachment metadata', default: true },
      
      // Search messages
      query: { type: 'string', description: 'IMAP search query (e.g., FROM "user@domain.com" SUBJECT "test")' },
      searchCriteria: {
        type: 'object',
        description: 'Structured search criteria',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          since: { type: 'string' },
          before: { type: 'string' },
          seen: { type: 'boolean' },
          flagged: { type: 'boolean' },
          hasAttachment: { type: 'boolean' },
        },
      },
      
      // Send message
      to: SchemaProps.stringArray({ description: 'Recipient email addresses' }),
      cc: SchemaProps.stringArray({ description: 'CC email addresses' }),
      bcc: SchemaProps.stringArray({ description: 'BCC email addresses' }),
      subject: { type: 'string', description: 'Email subject' },
      textBody: { type: 'string', description: 'Plain text body' },
      htmlBody: { type: 'string', description: 'HTML body' },
      attachments: {
        type: 'array',
        description: 'Attachments',
        items: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            contentType: { type: 'string' },
            content: { type: 'string', description: 'Base64 encoded content' },
            contentId: { type: 'string', description: 'Content-ID for inline attachments' },
          },
          required: ['filename', 'contentType', 'content'],
        },
      },
      inReplyTo: { type: 'string', description: 'Message-ID of message being replied to' },
      references: SchemaProps.stringArray({ description: 'References header for threading' }),
      
      // Delete/Mark
      messageIds: SchemaProps.stringArray({ description: 'Message UIDs to operate on' }),
      
      // Create folder
      folderName: { type: 'string', description: 'Name of folder to create' },
      
      // Override config per-request
      endpointUrl: { type: 'string', description: 'Override endpoint URL' },
      dryRun: { type: 'boolean', description: 'Validate without executing', default: true },
    },
    required: ['operation'],
  },
  outputSchema: EMAIL_EXTERNAL_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'user', phrase_examples: ['check my email', 'send an email', 'search emails', 'read latest emails'] },
    { kind: 'schedule', cadence: 'daily email sync' },
    { kind: 'event', on: 'new email received' },
    { kind: 'event', on: 'email sent' },
  ],
  timeoutMs: 60000,
  confirmBeforeSend: true,
});

emailIntegrationSkill.confirmBeforeSend = true;
