import { connect, AmqpConnectionManager, ChannelWrapper, Channel } from 'amqp-connection-manager';
import { ConsumeMessage } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message queue client for RabbitMQ using amqp-connection-manager
 * Provides a robust interface with automatic reconnection and error handling
 */
export class MessageQueueClient {
  private connection: AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;
  private url: string;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(url: string = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672') {
    this.url = url;
  }

  /**
   * Connect to RabbitMQ with automatic reconnection
   * @param options Connection options
   */
  async connect(options: any = {}): Promise<void> {
    if (this.connection && this.channelWrapper) {
      return;
    }

    if (this.isConnecting && this.connectionPromise) {
      await this.connectionPromise;
      return;
    }

    this.isConnecting = true;

    try {
      console.log(`Connecting to RabbitMQ at ${this.url}`);

      // Create connection with automatic reconnection
      this.connection = connect([this.url], {
        heartbeatIntervalInSeconds: options.heartbeat || 60,
        reconnectTimeInSeconds: options.reconnectDelay ? options.reconnectDelay / 1000 : 5,
      });

      // Set up connection event handlers
      this.connection.on('connect', () => console.log('Connected to RabbitMQ'));
      this.connection.on('disconnect', (err) => console.log('Disconnected from RabbitMQ', err));

      // Create channel wrapper with automatic setup
      this.channelWrapper = this.connection.createChannel({
        setup: async (channel: Channel) => {
          // Create the main exchange if it doesn't exist
          await channel.assertExchange('stage7', 'topic', { durable: true });
          console.log('Channel created successfully');
        }
      });

      // Wait for channel to be ready
      await this.channelWrapper.waitForConnect();
      console.log('RabbitMQ channel ready');

      this.isConnecting = false;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      this.connection = null;
      this.channelWrapper = null;
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Get the channel wrapper for direct operations
   * This allows consumers to use the channel directly for operations
   */
  getChannel(): ChannelWrapper | null {
    return this.channelWrapper;
  }

  /**
   * Check if connected to RabbitMQ
   */
  isConnected(): boolean {
    return !!(this.connection && this.channelWrapper);
  }

  /**
   * Test the connection by publishing and consuming a test message
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConnected() || !this.channelWrapper) {
      return false;
    }

    try {
      const testId = uuidv4();
      const testQueue = `test-${testId}`;
      const testMessage = { test: true, timestamp: Date.now() };

      // Create a temporary queue and test the connection
      await this.channelWrapper.addSetup(async (channel: Channel) => {
        // Create a temporary queue
        await channel.assertQueue(testQueue, { exclusive: true, autoDelete: true });

        // Publish a message to the queue
        const success = await channel.sendToQueue(testQueue, Buffer.from(JSON.stringify(testMessage)));

        if (!success) {
          throw new Error('Failed to publish test message');
        }

        // Set up a promise to consume the message
        const messagePromise = new Promise<boolean>((resolve, reject) => {
          // Set a timeout
          const timeoutId = setTimeout(() => {
            reject(new Error('Timed out waiting for test message'));
          }, 5000);

          // Consume the message
          channel.consume(testQueue, (msg: ConsumeMessage | null) => {
            if (msg) {
              // Acknowledge the message
              channel.ack(msg);

              // Clean up
              clearTimeout(timeoutId);

              // Resolve the promise
              resolve(true);
            }
          }, { noAck: false })
            .then((result: any) => {
              const consumerTag = result.consumerTag;
              // Set up another timeout to cancel the consumer if no message is received
              setTimeout(() => {
                try {
                  channel.cancel(consumerTag);
                } catch (err) {
                  console.error('Error canceling consumer:', err);
                }
              }, 5000);
            })
            .catch(reject);
        });

        // Wait for the message to be consumed
        await messagePromise;

        // Delete the queue
        await channel.deleteQueue(testQueue);

        return true;
      });

      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Publish a message to an exchange with a routing key
   * @param exchange Name of the exchange to publish to
   * @param routingKey Routing key for the message
   * @param message Message to publish
   * @param options Publishing options
   * @returns Promise that resolves to true if the message was published, false otherwise
   */
  async publishMessage(
    exchange: string,
    routingKey: string,
    message: any,
    options: any = {}
  ): Promise<boolean> {
    if (!this.isConnected() || !this.channelWrapper) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      // Convert the message to a buffer
      const content = Buffer.from(JSON.stringify(message));

      // Publish the message
      const result = await this.channelWrapper.publish(exchange, routingKey, content, {
        persistent: true,
        ...options
      });

      return result;
    } catch (error) {
      console.error(`Failed to publish message to ${exchange} with routing key ${routingKey}:`, error);
      throw error;
    }
  }

  /**
   * Send an RPC request and wait for a response
   * @param exchange Name of the exchange to publish to
   * @param routingKey Routing key for the message
   * @param message Message to publish
   * @param timeout Timeout in milliseconds
   * @returns Promise that resolves with the response
   */
  async sendRpcRequest(
    exchange: string,
    routingKey: string,
    message: any,
    timeout: number = 30000
  ): Promise<any> {
    if (!this.isConnected() || !this.channelWrapper) {
      throw new Error('Not connected to RabbitMQ');
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Create a unique correlation ID for this request
        const correlationId = uuidv4();

        // Create a temporary queue for the response
        const replyQueueName = `rpc-reply-${uuidv4()}`;

        // Set up the temporary queue and consumer
        await this.channelWrapper!.addSetup(async (channel: Channel) => {
          // Create the reply queue
          const { queue } = await channel.assertQueue(replyQueueName, {
            exclusive: true,
            autoDelete: true
          });

          // Set up a consumer for the reply queue
          const { consumerTag } = await channel.consume(queue, (msg: ConsumeMessage | null) => {
            if (msg && msg.properties.correlationId === correlationId) {
              try {
                // Parse the response
                const response = JSON.parse(msg.content.toString());

                // Clean up
                channel.ack(msg);
                // Cancel the consumer - using type assertion for TypeScript
                (channel as any).cancel(consumerTag);

                // Resolve the promise with the response
                resolve(response);
              } catch (error) {
                reject(error);
              }
            }
          }, { noAck: false });

          // Set up a timeout
          setTimeout(() => {
            // Clean up the reply queue
            try {
              (channel as any).cancel(consumerTag);
              channel.deleteQueue(replyQueueName);
            } catch (err) {
              console.error(`Error cleaning up RPC resources:`, err);
            }

            reject(new Error(`RPC request timed out after ${timeout}ms`));
          }, timeout);

          // Publish the message with the reply queue and correlation ID
          const content = Buffer.from(JSON.stringify(message));
          channel.publish(exchange, routingKey, content, {
            correlationId,
            replyTo: replyQueueName,
            persistent: true
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Close the connection to RabbitMQ
   */
  async close(): Promise<void> {
    try {
      if (this.channelWrapper) {
        await this.channelWrapper.close();
        this.channelWrapper = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      console.log('Closed RabbitMQ connection');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
      throw error;
    }
  }
}



