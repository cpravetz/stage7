import * as amqplib from 'amqplib';
import { Message } from '../types/Message';

/**
 * Message queue client for RabbitMQ
 * Provides a robust interface for publishing and consuming messages
 * with automatic reconnection and error handling
 */

export class MessageQueueClient {
  private connection: amqplib.Connection | null = null;
  private channel: amqplib.Channel | null = null;
  private url: string;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(url: string = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672') {
    this.url = url;
  }

  async connect(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }

    if (this.isConnecting && this.connectionPromise) {
      await this.connectionPromise;
      return;
    }

    this.isConnecting = true;
    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    try {
      // Use type assertion to fix the type error
      this.connection = await amqplib.connect(this.url) as unknown as amqplib.Connection;

      if (this.connection) {
        // Use type assertion to fix the type error
        this.channel = await (this.connection as any).createChannel();

        // Set up connection error handlers
        this.connection.on('error', (err: Error) => {
          console.error('RabbitMQ connection error:', err);
          this.reconnect();
        });

        this.connection.on('close', () => {
          console.log('RabbitMQ connection closed, attempting to reconnect...');
          this.reconnect();
        });
      }

      console.log('Connected to RabbitMQ');
      this.isConnecting = false;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      this.isConnecting = false;

      // Attempt to reconnect after a delay
      setTimeout(() => this.reconnect(), 5000);
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    if (this.isConnecting) return;

    this.connection = null;
    this.channel = null;
    this.isConnecting = false;

    console.log('Attempting to reconnect to RabbitMQ...');
    await this.connect();
  }

  /**
   * Publish a message to an exchange with a routing key
   * @param exchange Exchange name
   * @param routingKey Routing key
   * @param message Message to publish
   * @param options Optional publishing options
   * @returns Promise that resolves to true if the message was published successfully
   */
  async publishMessage(exchange: string, routingKey: string, message: any, options: amqplib.Options.Publish = {}): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      await this.channel!.assertExchange(exchange, 'topic', { durable: true });
      // Set default options
      const publishOptions: amqplib.Options.Publish = {
        persistent: true,  // Make message persistent by default
        contentType: 'application/json',
        ...options
      };

      return this.channel!.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        publishOptions
      );
    } catch (error) {
      console.error('Error publishing message:', error);
      await this.reconnect();
      return false;
    }
  }

  /**
   * Subscribe to a queue and process messages
   * @param queueName Queue name
   * @param callback Callback function to process messages
   * @param options Optional queue options
   * @returns Promise that resolves when subscription is set up
   */
  async subscribeToQueue(queueName: string, callback: (message: any) => Promise<void>, options: amqplib.Options.AssertQueue = {}): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      // Set default options
      const queueOptions: amqplib.Options.AssertQueue = {
        durable: true,  // Make queue durable by default
        ...options
      };

      await this.channel!.assertQueue(queueName, queueOptions);
      await this.channel!.consume(queueName, async (msg: amqplib.ConsumeMessage | null) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            await callback(content);
            this.channel!.ack(msg);
          } catch (error) {
            console.error('Error processing message:', error);
            // Requeue the message if processing failed
            this.channel!.nack(msg, false, true);
          }
        }
      });

      console.log(`Subscribed to queue: ${queueName}`);
    } catch (error) {
      console.error('Error subscribing to queue:', error);
      await this.reconnect();
      throw error;
    }
  }

  /**
   * Bind a queue to an exchange with a routing pattern
   * @param queueName Queue name
   * @param exchange Exchange name
   * @param routingPattern Routing pattern
   * @param exchangeOptions Optional exchange options
   * @param queueOptions Optional queue options
   * @returns Promise that resolves when binding is complete
   */
  async bindQueueToExchange(
    queueName: string,
    exchange: string,
    routingPattern: string,
    exchangeOptions: amqplib.Options.AssertExchange = {},
    queueOptions: amqplib.Options.AssertQueue = {}
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      // Set default options
      const defaultExchangeOptions: amqplib.Options.AssertExchange = {
        durable: true,  // Make exchange durable by default
        ...exchangeOptions
      };

      const defaultQueueOptions: amqplib.Options.AssertQueue = {
        durable: true,  // Make queue durable by default
        ...queueOptions
      };

      await this.channel!.assertExchange(exchange, 'topic', defaultExchangeOptions);
      await this.channel!.assertQueue(queueName, defaultQueueOptions);
      await this.channel!.bindQueue(queueName, exchange, routingPattern);

      console.log(`Bound queue ${queueName} to exchange ${exchange} with pattern ${routingPattern}`);
    } catch (error) {
      console.error('Error binding queue to exchange:', error);
      await this.reconnect();
      throw error;
    }
  }

  /**
   * Check if the client is connected to RabbitMQ
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        // Use type assertion to fix the type error
        await (this.connection as any).close();
      }
    } catch (error) {
      console.error('Error closing connection:', error);
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }

  /**
   * Create a direct reply-to queue for RPC-style communication
   * @param callback Callback function to process reply messages
   * @returns Promise that resolves with the correlation ID and reply queue
   */
  async createReplyQueue(callback: (message: any) => Promise<void>): Promise<{ correlationId: string, replyTo: string }> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      // Generate a correlation ID for this request
      const correlationId = Math.random().toString() + Date.now().toString();

      // Use the amqp.node direct reply-to feature
      const replyTo = 'amq.rabbitmq.reply-to';

      // Set up consumer for the reply queue
      await this.channel!.consume(
        replyTo,
        async (msg) => {
          if (msg && msg.properties.correlationId === correlationId) {
            try {
              const content = JSON.parse(msg.content.toString());
              await callback(content);
              this.channel!.ack(msg);
            } catch (error) {
              console.error('Error processing reply message:', error);
              this.channel!.nack(msg, false, false); // Don't requeue, as this is a reply
            }
          }
        },
        { noAck: false }
      );

      return { correlationId, replyTo };
    } catch (error) {
      console.error('Error creating reply queue:', error);
      await this.reconnect();
      throw error;
    }
  }

  /**
   * Send an RPC-style request and wait for a response
   * @param exchange Exchange name
   * @param routingKey Routing key
   * @param message Message to send
   * @param timeout Timeout in milliseconds
   * @returns Promise that resolves with the response
   */
  async sendRpcRequest(exchange: string, routingKey: string, message: any, timeout: number = 30000): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.channel) {
          await this.connect();
        }

        // Create a reply queue
        const { correlationId, replyTo } = await this.createReplyQueue(async (response) => {
          clearTimeout(timeoutId);
          resolve(response);
        });

        // Set up timeout
        const timeoutId = setTimeout(() => {
          reject(new Error(`RPC request timed out after ${timeout}ms`));
        }, timeout);

        // Publish the message with reply-to and correlation ID
        await this.channel!.assertExchange(exchange, 'topic', { durable: true });
        const success = this.channel!.publish(
          exchange,
          routingKey,
          Buffer.from(JSON.stringify(message)),
          {
            persistent: true,
            contentType: 'application/json',
            correlationId,
            replyTo
          }
        );

        if (!success) {
          clearTimeout(timeoutId);
          reject(new Error('Failed to publish RPC request'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}

