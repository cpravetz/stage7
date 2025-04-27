# Message Queue Implementation

## Overview

This document outlines the implementation of a message queue system using RabbitMQ to replace direct HTTP calls between services in the Stage7 system. The implementation provides a more robust and resilient communication mechanism, reducing the risk of service failures due to network issues or service unavailability.

## Components

### 1. Message Queue Client

The `MessageQueueClient` class in `shared/src/messaging/queueClient.ts` provides a robust interface for interacting with RabbitMQ:

- **Connection Management**: Handles connection establishment, reconnection, and error recovery
- **Message Publishing**: Publishes messages to exchanges with appropriate routing keys
- **Message Consumption**: Subscribes to queues and processes incoming messages
- **RPC Support**: Implements request-response pattern for synchronous communication
- **Error Handling**: Provides comprehensive error handling and recovery mechanisms

### 2. BaseEntity Integration

The `BaseEntity` class in `shared/src/BaseEntity.ts` has been enhanced to prioritize message queue communication:

- **Initialization**: Sets up message queue connection and bindings during entity initialization
- **Message Handling**: Processes messages received from the queue
- **Synchronous Communication**: Implements RPC pattern for synchronous requests
- **Fallback Mechanism**: Falls back to HTTP if message queue is unavailable
- **Cleanup**: Properly closes connections during shutdown

### 3. PostOffice Routing

The `PostOffice` class in `services/postoffice/src/PostOffice.ts` has been updated to route messages through RabbitMQ:

- **Message Routing**: Routes messages to appropriate recipients via RabbitMQ
- **Synchronous Handling**: Uses RPC pattern for synchronous messages
- **WebSocket Integration**: Maintains WebSocket connections for client communication
- **Fallback Mechanism**: Falls back to HTTP-based queue if RabbitMQ is unavailable

## Architecture

### Message Flow

1. **Service Initialization**:
   - Each service connects to RabbitMQ during startup
   - Services create and bind queues for receiving messages
   - Services register with PostOffice for discovery

2. **Asynchronous Communication**:
   - Service A publishes a message to the `stage7` exchange with routing key `message.{recipient}`
   - RabbitMQ routes the message to the appropriate queue
   - Service B consumes the message from its queue and processes it

3. **Synchronous Communication**:
   - Service A sends an RPC request with a correlation ID and reply-to queue
   - Service B processes the request and sends a response to the reply-to queue
   - Service A receives the response and resolves the promise

4. **Client Communication**:
   - PostOffice maintains WebSocket connections with clients
   - Messages to clients are sent directly via WebSocket
   - Client requests are routed to appropriate services via RabbitMQ

### Exchange and Queue Structure

- **Exchange**: `stage7` (topic exchange)
- **Routing Keys**:
  - `message.{serviceId}`: Messages for a specific service
  - `message.{serviceType}`: Messages for all services of a type
  - `message.all`: Broadcast messages to all services
- **Queues**:
  - `{serviceType}-{serviceId}`: Queue for each service instance
  - `amq.rabbitmq.reply-to`: Special queue for RPC responses

## Implementation Details

### 1. Message Queue Client

```typescript
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
    // Connection logic
  }

  async publishMessage(exchange: string, routingKey: string, message: any, options: amqplib.Options.Publish = {}): Promise<boolean> {
    // Publishing logic
  }

  async subscribeToQueue(queueName: string, callback: (message: any) => Promise<void>, options: amqplib.Options.AssertQueue = {}): Promise<void> {
    // Subscription logic
  }

  async sendRpcRequest(exchange: string, routingKey: string, message: any, timeout: number = 30000): Promise<any> {
    // RPC request logic
  }
}
```

### 2. BaseEntity Integration

```typescript
protected async initializeMessageQueue() {
  try {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
    this.mqClient = new MessageQueueClient(rabbitmqUrl);
    await this.mqClient.connect();

    // Create a queue for this component
    const queueName = `${this.componentType.toLowerCase()}-${this.id}`;
    await this.mqClient.subscribeToQueue(queueName, async (message) => {
      await this.handleQueueMessage(message);
    });
    
    // Bind the queue to the exchange with appropriate routing patterns
    await this.mqClient.bindQueueToExchange(queueName, 'stage7', `message.${this.id}`);
    await this.mqClient.bindQueueToExchange(queueName, 'stage7', `message.${this.componentType.toLowerCase()}`);
    await this.mqClient.bindQueueToExchange(queueName, 'stage7', 'message.all');
  } catch (error) {
    console.error(`Failed to initialize message queue for ${this.componentType}:`, error);
    // Continue without message queue - will fall back to HTTP
  }
}
```

### 3. PostOffice Routing

```typescript
private async routeMessage(message: Message) {
  // Handle messages to users (via WebSocket)
  if (message.recipient === 'user') {
    if (clientId) {
      this.sendToClient(clientId, message);
      return;
    } else {
      this.broadcastToClients(message);
      return;
    }
  }

  // Handle messages to services
  const recipientId = message.recipient;
  
  // Always try to use RabbitMQ first
  try {
    const routingKey = `message.${recipientId}`;
    
    if (requiresSync) {
      // For synchronous messages, use RPC pattern
      const response = await this.mqClient.sendRpcRequest('stage7', routingKey, message, 30000);
      
      // If this is a request from a client, send the response back to the client
      if (clientId) {
        this.sendToClient(clientId, response);
      }
      
      return;
    } else {
      // For asynchronous messages, just publish
      await this.mqClient.publishMessage('stage7', routingKey, message);
      return;
    }
  } catch (error) {
    // Fallback to traditional queue if RabbitMQ fails
  }
}
```

## Configuration

### Environment Variables

- `RABBITMQ_URL`: URL for connecting to RabbitMQ (default: `amqp://stage7:stage7password@rabbitmq:5672`)
- `RABBITMQ_DEFAULT_USER`: RabbitMQ username (default: `stage7`)
- `RABBITMQ_DEFAULT_PASS`: RabbitMQ password (default: `stage7password`)
- `RABBITMQ_DEFAULT_VHOST`: RabbitMQ virtual host (default: `/`)

### Docker Compose

```yaml
rabbitmq:
  image: rabbitmq:3-management
  ports:
    - "5672:5672"  # AMQP port
    - "15672:15672"  # Management UI
  volumes:
    - rabbitmq_data:/var/lib/rabbitmq
  environment:
    - RABBITMQ_DEFAULT_USER=stage7
    - RABBITMQ_DEFAULT_PASS=stage7password
    - RABBITMQ_DEFAULT_VHOST=/
  healthcheck:
    test: ["CMD", "rabbitmq-diagnostics", "ping"]
    interval: 10s
    timeout: 10s
    retries: 5
    start_period: 30s
  restart: unless-stopped
```

## Benefits

1. **Resilience**: Services can continue operating even if other services are temporarily unavailable
2. **Scalability**: Multiple instances of the same service can consume from the same queue
3. **Load Balancing**: Messages are distributed among service instances
4. **Decoupling**: Services don't need to know the location of other services
5. **Reliability**: Messages are persisted and not lost if a service is down
6. **Monitoring**: RabbitMQ provides tools for monitoring message flow and queue status

## Monitoring and Management

The RabbitMQ Management UI is available at `http://localhost:15672` with the following credentials:
- Username: `stage7`
- Password: `stage7password`

The Management UI provides:
- Queue monitoring
- Message rate visualization
- Connection management
- Exchange and binding configuration
- User management

## Future Enhancements

1. **Message Prioritization**: Implement priority queues for critical messages
2. **Dead Letter Exchange**: Handle failed message processing
3. **Message TTL**: Set time-to-live for messages to prevent queue buildup
4. **Circuit Breaker**: Implement circuit breaker pattern for service communication
5. **Message Batching**: Batch messages for improved performance
6. **Message Compression**: Compress large messages to reduce bandwidth usage
