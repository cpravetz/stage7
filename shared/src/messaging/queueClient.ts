import * as amqplib from 'amqplib';

// Define missing types
declare module 'amqplib' {
  namespace Options {
    interface Publish {
      persistent?: boolean;
      contentType?: string;
      correlationId?: string;
      replyTo?: string;
      [key: string]: any;
    }

    interface AssertQueue {
      durable?: boolean;
      [key: string]: any;
    }

    interface AssertExchange {
      durable?: boolean;
      [key: string]: any;
    }
  }
}

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
      console.log(`Attempting to connect to RabbitMQ at ${this.url}`);
      // Use type assertion to fix the type error
      this.connection = await amqplib.connect(this.url) as unknown as amqplib.Connection;

      if (this.connection) {
        // Use type assertion to fix the type error
        this.channel = await (this.connection as any).createChannel();

        // Set up connection error handlers
        this.connection.on('error', (err: Error) => {
          console.error('RabbitMQ connection error:', err);
          this.connection = null;
          this.channel = null;
          this.reconnect();
        });

        this.connection.on('close', () => {
          console.log('RabbitMQ connection closed, attempting to reconnect...');
          this.connection = null;
          this.channel = null;
          this.reconnect();
        });
      }

      console.log('Connected to RabbitMQ');
      this.isConnecting = false;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      this.connection = null;
      this.channel = null;
      this.isConnecting = false;

      // Don't throw the error, just return - this allows the caller to handle the failure gracefully
      // without crashing the application
      throw error; // Throw the error so the caller can handle it with retries
    }
  }

  private async reconnect(): Promise<void> {
    if (this.isConnecting) return;

    this.connection = null;
    this.channel = null;
    this.isConnecting = true;

    console.log('Attempting to reconnect to RabbitMQ...');
    try {
      await this._connect(); // Use _connect directly to avoid potential issues with connect()
    } catch (error) {
      console.error('Reconnection attempt failed:', error);
      this.isConnecting = false;
      // Schedule another reconnection attempt with exponential backoff
      const delay = Math.floor(Math.random() * 5000) + 5000; // 5-10 seconds
      console.log(`Will try to reconnect again in ${delay}ms`);
      setTimeout(() => this.reconnect(), delay);
    }
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
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        if (!this.channel || !this.isConnected()) {
          console.log('Channel not available, connecting to RabbitMQ...');
          await this.connect();

          if (!this.channel) {
            throw new Error('Failed to establish channel after connection');
          }
        }

        await this.channel.assertExchange(exchange, 'topic', { durable: true });
        // Set default options
        const publishOptions: amqplib.Options.Publish = {
          persistent: true,  // Make message persistent by default
          contentType: 'application/json',
          ...options
        };

        const result = this.channel.publish(
          exchange,
          routingKey,
          Buffer.from(JSON.stringify(message)),
          publishOptions
        );

        if (result) {
          return true;
        } else {
          console.warn('Channel.publish returned false, retrying...');
          retries++;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      } catch (error) {
        console.error(`Error publishing message (attempt ${retries + 1}/${maxRetries}):`, error);
        retries++;

        if (retries < maxRetries) {
          console.log(`Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.reconnect();
        } else {
          console.error('Max retries reached, giving up on publishing message');
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Subscribe to a queue and process messages
   * @param queueName Queue name
   * @param callback Callback function to process messages
   * @param options Optional queue options
   * @returns Promise that resolves when subscription is set up
   */
  async subscribeToQueue(queueName: string, callback: (message: any) => Promise<void>, options: amqplib.Options.AssertQueue = {}): Promise<void> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        if (!this.channel || !this.isConnected()) {
          console.log(`Channel not available for queue ${queueName}, connecting to RabbitMQ...`);
          await this.connect();

          if (!this.channel) {
            throw new Error('Failed to establish channel after connection');
          }
        }

        // Set default options
        const queueOptions: amqplib.Options.AssertQueue = {
          durable: true,  // Make queue durable by default
          ...options
        };

        await this.channel.assertQueue(queueName, queueOptions);
        const consumeResult = await this.channel.consume(queueName, async (msg: amqplib.ConsumeMessage | null) => {
          if (msg) {
            try {
              const content = JSON.parse(msg.content.toString());
              await callback(content);
              if (this.channel) {
                this.channel.ack(msg);
              } else {
                console.error('Cannot acknowledge message: channel is null');
              }
            } catch (error) {
              console.error('Error processing message:', error);
              // Requeue the message if processing failed and channel is available
              if (this.channel) {
                this.channel.nack(msg, false, true);
              } else {
                console.error('Cannot nack message: channel is null');
              }
            }
          }
        });

        console.log(`Subscribed to queue: ${queueName} with consumer tag: ${consumeResult.consumerTag}`);
        return; // Success, exit the retry loop
      } catch (error) {
        console.error(`Error subscribing to queue ${queueName} (attempt ${retries + 1}/${maxRetries}):`, error);
        retries++;

        if (retries < maxRetries) {
          console.log(`Retrying subscription to ${queueName} in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.reconnect();
        } else {
          console.error(`Max retries reached, giving up on subscribing to queue ${queueName}`);
          throw error;
        }
      }
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
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        if (!this.channel || !this.isConnected()) {
          console.log(`Channel not available for binding queue ${queueName}, connecting to RabbitMQ...`);
          await this.connect();

          if (!this.channel) {
            throw new Error('Failed to establish channel after connection');
          }
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

        await this.channel.assertExchange(exchange, 'topic', defaultExchangeOptions);
        await this.channel.assertQueue(queueName, defaultQueueOptions);
        await this.channel.bindQueue(queueName, exchange, routingPattern);

        console.log(`Bound queue ${queueName} to exchange ${exchange} with pattern ${routingPattern}`);
        return; // Success, exit the retry loop
      } catch (error) {
        console.error(`Error binding queue ${queueName} to exchange ${exchange} (attempt ${retries + 1}/${maxRetries}):`, error);
        retries++;

        if (retries < maxRetries) {
          console.log(`Retrying binding queue ${queueName} to exchange ${exchange} in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.reconnect();
        } else {
          console.error(`Max retries reached, giving up on binding queue ${queueName} to exchange ${exchange}`);
          throw error;
        }
      }
    }
  }

  /**
   * Check if the client is connected to RabbitMQ
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    // Check if both connection and channel exist and are in a good state
    return this.connection !== null && this.channel !== null &&
           (this.connection as any)?.connection?.writable === true;
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

