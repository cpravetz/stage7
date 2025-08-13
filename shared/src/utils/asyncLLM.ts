import { v4 as uuidv4 } from 'uuid';
import { MessageQueueClient } from '../messaging/queueClient';
import { MessageType } from '../types/Message';
import { Channel, ConsumeMessage } from 'amqplib';

/**
 * Utility class for making asynchronous LLM requests via the message queue
 */
export class AsyncLLM {
  private mqClient: MessageQueueClient;
  private responsePromises: Map<string, {
    resolve: (value: any) => void,
    reject: (reason: any) => void,
    timeout: NodeJS.Timeout
  }> = new Map();
  private responseQueueName: string;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(rabbitmqUrl?: string) {
    this.mqClient = new MessageQueueClient(rabbitmqUrl);
    this.responseQueueName = `llm-responses-${uuidv4().substring(0, 8)}`;
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Connect to RabbitMQ
      await this.mqClient.connect({
        heartbeat: 60,
        reconnectDelay: 5000
      });

      const channel = this.mqClient.getChannel();
      if (!channel) {
        throw new Error('Failed to get channel wrapper');
      }

      // Set up the queue and bindings
      await channel.addSetup(async (ch: Channel) => {
        // Create a queue for responses
        await ch.assertQueue(this.responseQueueName, {
          durable: false,
          autoDelete: true
        });

        // Consume messages from the queue
        await ch.consume(this.responseQueueName, async (msg: ConsumeMessage | null) => {
          if (msg) {
            try {
              // Parse the message content
              const content = JSON.parse(msg.content.toString());

              // Process the message
              await this.handleResponse(content);

              // Acknowledge the message
              ch.ack(msg);
            } catch (error) {
              console.error(`Error processing message from queue ${this.responseQueueName}:`, error);

              // Reject the message and requeue it if it's not a parsing error
              const requeue = !(error instanceof SyntaxError);
              // Using type assertion because the type definition is incomplete
              (ch as any).reject(msg, requeue);
            }
          }
        });

        // Create and bind to the main exchange
        const exchangeName = 'stage7';

        // Assert the exchange exists
        await ch.assertExchange(exchangeName, 'topic', { durable: true });

        // Bind the queue to the exchange with appropriate routing pattern
        await ch.bindQueue(this.responseQueueName, exchangeName, `message.${this.responseQueueName}`);
      });

      this.initialized = true;
      console.log('AsyncLLM initialized and connected to message queue');
    } catch (error) {
      console.error('Failed to initialize AsyncLLM:', error);
      // We'll retry on next operation
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Send a chat request to the Brain service via the message queue
   * @param exchanges The conversation exchanges
   * @param optimization The optimization strategy
   * @param optionals Optional parameters
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that resolves with the LLM response
   */
  async chat(
    exchanges: Array<{ role: string, content: string }>,
    optimization: string = 'accuracy',
    optionals: Record<string, any> = {},
    timeoutMs: number = 60000
  ): Promise<{ response: string, mimeType: string }> {
    // Make sure we're initialized
    if (!this.initialized) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        this.initPromise = this.initialize();
        await this.initPromise;
      }
    }

    const requestId = uuidv4();

    return new Promise(async (resolve, reject) => {
      try {
        // Set up timeout
        const timeout = setTimeout(() => {
          const handler = this.responsePromises.get(requestId);
          if (handler) {
            this.responsePromises.delete(requestId);
            reject(new Error(`LLM request timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);

        // Store the promise handlers
        this.responsePromises.set(requestId, { resolve, reject, timeout });

        // Get the channel wrapper
        const channel = this.mqClient.getChannel();
        if (!channel) {
          throw new Error('Failed to get channel wrapper');
        }

        // Send the request via message queue
        await channel.addSetup(async (ch: Channel) => {
          const message = {
            type: MessageType.CHAT_REQUEST,
            sender: this.responseQueueName,
            recipient: 'Brain',
            content: {
              requestId,
              exchanges,
              optimization,
              optionals
            },
            requiresSync: false,
            timestamp: new Date().toISOString()
          };

          const content = Buffer.from(JSON.stringify(message));
          ch.publish('stage7', 'message.Brain', content, {
            persistent: true
          });
        });

        console.log(`Sent async LLM chat request with ID ${requestId}`);
      } catch (error) {
        // Clean up and reject on error
        const handler = this.responsePromises.get(requestId);
        if (handler) {
          clearTimeout(handler.timeout);
          this.responsePromises.delete(requestId);
        }
        reject(error);
      }
    });
  }

  /**
   * Handle responses from the Brain service
   */
  private async handleResponse(message: any) {
    if (message.type !== MessageType.CHAT_RESPONSE) {
      console.log('Received non-chat response message:', message);
      return;
    }

    const { requestId, response, mimeType, error } = message.content;
    const handler = this.responsePromises.get(requestId);

    if (!handler) {
      console.log(`No handler found for request ID ${requestId}`);
      return;
    }

    // Clear the timeout and remove the promise handlers
    clearTimeout(handler.timeout);
    this.responsePromises.delete(requestId);

    if (error) {
      handler.reject(new Error(error));
    } else {
      handler.resolve({ response, mimeType });
    }
  }

  /**
   * Close the connection to RabbitMQ
   */
  async close(): Promise<void> {
    if (this.mqClient) {
      await this.mqClient.close();
    }
    this.initialized = false;
  }
}
