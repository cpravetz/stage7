import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface EmailMessage {
  id?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: string[];
  sentAt?: string;
}

interface EmailSearchCriteria {
  from?: string;
  to?: string;
  subject?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  unreadOnly?: boolean;
}

export class EmailTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'EmailTool',
      description: 'Manages email operations including sending, receiving, and searching emails.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the email tool.',
            enum: ['sendEmail', 'getEmails', 'searchEmails', 'markAsRead', 'deleteEmail'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific email action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Sends an email message.
   * @param emailDetails The details of the email to send.
   * @returns The sent email with ID and timestamp.
   */
  public async sendEmail(
    emailDetails: Omit<EmailMessage, 'id' | 'sentAt'>,
    conversationId: string,
    options?: {
      priority?: 'high' | 'normal' | 'low';
      template?: string;
      trackingEnabled?: boolean;
      readReceiptRequested?: boolean;
      tags?: string[];
    }
  ): Promise<EmailMessage> {
    const result = await this.execute(
      {
        action: 'sendEmail',
        payload: {
          ...emailDetails,
          priority: options?.priority,
          template: options?.template,
          tracking_enabled: options?.trackingEnabled,
          read_receipt_requested: options?.readReceiptRequested,
          tags: options?.tags,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Retrieves emails for a given user.
   * @param userId The ID of the user.
   * @param limit Maximum number of emails to retrieve.
   * @returns A list of email messages.
   */
  public async getEmails(
    userId: string,
    limit: number = 50,
    conversationId: string,
    options?: {
      folder?: string;
      includeArchived?: boolean;
      includeTrash?: boolean;
      sortBy?: 'date' | 'sender' | 'subject';
    }
  ): Promise<EmailMessage[]> {
    const result = await this.execute(
      {
        action: 'getEmails',
        payload: {
          userId,
          limit,
          folder: options?.folder,
          include_archived: options?.includeArchived,
          include_trash: options?.includeTrash,
          sort_by: options?.sortBy,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Searches emails based on criteria.
   * @param criteria The search criteria.
   * @returns A list of matching email messages.
   */
  public async searchEmails(
    criteria: EmailSearchCriteria,
    conversationId: string,
    options?: {
      includeBodyContent?: boolean;
      matchExactPhrase?: boolean;
      excludeSpam?: boolean;
    }
  ): Promise<EmailMessage[]> {
    const result = await this.execute(
      {
        action: 'searchEmails',
        payload: {
          ...criteria,
          include_body_content: options?.includeBodyContent,
          match_exact_phrase: options?.matchExactPhrase,
          exclude_spam: options?.excludeSpam,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Marks an email as read.
   * @param emailId The ID of the email to mark as read.
   * @returns Success status.
   */
  public async markAsRead(
    emailId: string,
    conversationId: string,
    options?: {
      markConversation?: boolean;
      notifyOthers?: boolean;
    }
  ): Promise<{ success: boolean }> {
    const result = await this.execute(
      {
        action: 'markAsRead',
        payload: {
          emailId,
          mark_conversation: options?.markConversation,
          notify_others: options?.notifyOthers,
        },
      },
      conversationId
    );
    return result;
  }

  /**
   * Deletes an email.
   * @param emailId The ID of the email to delete.
   * @returns Success status.
   */
  public async deleteEmail(emailId: string, conversationId: string, options?: { permanent?: boolean }): Promise<{ success: boolean }> {
    const result = await this.execute(
      { action: 'deleteEmail', payload: { emailId, permanent: options?.permanent } },
      conversationId
    );
    return result;
  }
}

