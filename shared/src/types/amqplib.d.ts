declare module 'amqplib' {
  export interface Connection {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): Connection;
  }

  export interface Channel {
    assertQueue(queue: string, options?: any): Promise<any>;
    assertExchange(exchange: string, type: string, options?: any): Promise<any>;
    bindQueue(queue: string, exchange: string, pattern: string): Promise<any>;
    publish(exchange: string, routingKey: string, content: Buffer, options?: any): boolean;
    consume(queue: string, onMessage: (msg: ConsumeMessage | null) => void, options?: any): Promise<any>;
    ack(message: ConsumeMessage, allUpTo?: boolean): void;
    nack(message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
    close(): Promise<void>;
  }

  export interface ConsumeMessage {
    content: Buffer;
    fields: any;
    properties: any;
  }

  export function connect(url: string): Promise<Connection>;
}
