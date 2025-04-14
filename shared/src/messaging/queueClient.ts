import * as amqplib from 'amqplib';

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

  async publishMessage(exchange: string, routingKey: string, message: any): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      await this.channel!.assertExchange(exchange, 'topic', { durable: true });
      return this.channel!.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } catch (error) {
      console.error('Error publishing message:', error);
      await this.reconnect();
      return false;
    }
  }

  async subscribeToQueue(queueName: string, callback: (message: any) => Promise<void>): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      await this.channel!.assertQueue(queueName, { durable: true });
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

  async bindQueueToExchange(queueName: string, exchange: string, routingPattern: string): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      await this.channel!.assertExchange(exchange, 'topic', { durable: true });
      await this.channel!.assertQueue(queueName, { durable: true });
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
}

