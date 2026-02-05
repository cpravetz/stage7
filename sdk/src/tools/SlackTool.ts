import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface SlackMessage {
  id?: string;
  channelId: string;
  text: string;
  timestamp?: string;
  user?: string;
  threadTs?: string;
}

interface SlackChannel {
  id?: string;
  name: string;
  isPrivate?: boolean;
  purpose?: string;
  topic?: string;
}

interface SlackFile {
  id?: string;
  name: string;
  filetype?: string;
  url?: string;
  permalink?: string;
  size?: number;
}

export class SlackTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'SlackTool',
      description: 'Interacts with Slack for sending messages, retrieving messages, uploading files, and managing channels.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with Slack.',
            enum: ['sendMessage', 'getMessages', 'uploadFile', 'createChannel'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific Slack action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Sends a message to a Slack channel.
   * @param channelId The ID of the channel to send the message to.
   * @param text The text content of the message.
   * @param threadTs Optional thread timestamp to reply in a thread.
   * @returns The sent Slack message with metadata.
   */
  public async sendMessage(
    channelId: string,
    text: string,
    conversationId: string,
    options?: {
      threadTs?: string;
      unfurlLinks?: boolean;
      unfurlMedia?: boolean;
      blocks?: any[];
      attachments?: any[];
    }
  ): Promise<SlackMessage> {
    const actionPayload = {
      action: 'sendMessage',
      payload: {
        channelId,
        text,
        thread_ts: options?.threadTs,
        unfurl_links: options?.unfurlLinks,
        unfurl_media: options?.unfurlMedia,
        blocks: options?.blocks,
        attachments: options?.attachments,
      },
    };
    const result = await this.execute(actionPayload, conversationId);
    return result;
  }

  /**
   * Retrieves messages from a Slack channel.
   * @param channelId The ID of the channel to retrieve messages from.
   * @param limit Optional limit on the number of messages to retrieve.
   * @param oldest Optional timestamp to get messages newer than this.
   * @returns An array of Slack messages.
   */
  public async getMessages(
    channelId: string,
    conversationId: string,
    options?: {
      limit?: number;
      oldest?: string;
      latest?: string;
      includeThreadReplies?: boolean;
    }
  ): Promise<SlackMessage[]> {
    const actionPayload = {
      action: 'getMessages',
      payload: {
        channelId,
        limit: options?.limit,
        oldest: options?.oldest,
        latest: options?.latest,
        include_thread_replies: options?.includeThreadReplies,
      },
    };
    const result = await this.execute(actionPayload, conversationId);
    return result;
  }

  /**
   * Uploads a file to Slack.
   * @param channelId The ID of the channel to upload the file to.
   * @param fileName The name of the file.
   * @param fileContent The content of the file (as base64 or text).
   * @param conversationId The conversation ID.
   * @param options Optional configuration for the file upload.
   * @returns The uploaded Slack file with metadata.
   */
  public async uploadFile(
    channelId: string,
    fileName: string,
    fileContent: string,
    conversationId: string,
    options?: {
      fileType?: string;
      title?: string;
      initialComment?: string;
      threadTs?: string;
    }
  ): Promise<SlackFile> {
    const actionPayload = {
      action: 'uploadFile',
      payload: {
        channelId,
        fileName,
        fileContent,
        file_type: options?.fileType,
        title: options?.title,
        initial_comment: options?.initialComment,
        thread_ts: options?.threadTs,
      },
    };
    const result = await this.execute(actionPayload, conversationId);
    return result;
  }

  /**
   * Creates a new Slack channel.
   * @param name The name of the channel to create.
   * @param conversationId The conversation ID.
   * @param options Optional configuration for the channel.
   * @returns The created Slack channel with metadata.
   */
  public async createChannel(
    name: string,
    conversationId: string,
    options?: {
      isPrivate?: boolean;
      purpose?: string;
      topic?: string;
    }
  ): Promise<SlackChannel> {
    const actionPayload = {
      action: 'createChannel',
      payload: {
        name,
        is_private: options?.isPrivate,
        purpose: options?.purpose,
        topic: options?.topic,
      },
    };
    const result = await this.execute(actionPayload, conversationId);
    return result;
  }
}