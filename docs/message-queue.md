# Consolidated Message Queue Documentation

## 1. Overview

This document describes the implementation of a robust message queue system within the Stage7 system, primarily utilizing RabbitMQ. This system replaces direct HTTP calls for asynchronous communication between services, providing a more resilient, scalable, and decoupled architecture. It enhances service communication by ensuring messages are delivered even if recipient services are temporarily unavailable, reducing coupling, and enabling graceful degradation through fallback mechanisms.

## 2. Architecture

### 2.1. Message Flow

Messages can flow through the system in two primary ways:

1.  **Synchronous Communication (HTTP)**: Used for messages that require an immediate response.
    *   Client sends a message to PostOffice via HTTP.
    *   PostOffice forwards the message to the recipient via HTTP.
    *   Recipient processes the message and returns a response.
    *   PostOffice forwards the response back to the client.

2.  **Asynchronous Communication (RabbitMQ)**: Used for messages that do not require an immediate response.
    *   Client publishes a message to the RabbitMQ exchange with a routing key.
    *   RabbitMQ routes the message to the appropriate queue(s).
    *   Recipient(s) consume the message from their queue.
    *   If a response is needed, it is sent back via another message (often using an RPC pattern).

### 2.2. Exchange and Queue Structure

The system uses a topic exchange named `stage7` for message routing.

*   **Exchange**: `stage7` (topic exchange)
*   **Routing Keys**:
    *   `message.{serviceId}`: Routes messages to a specific service instance (e.g., `message.brain-instance-1`).
    *   `message.{serviceType}`: Routes messages to all services of a specific type (e.g., `message.brain`).
    *   `message.all`: Broadcasts messages to all services.
*   **Queues**:
    *   `{serviceType}-{serviceId}`: A unique queue for each service instance to receive messages.
    *   `amq.rabbitmq.reply-to`: A special, temporary queue used for RPC (request-response) pattern responses.

Each service connects to RabbitMQ during startup, creates and binds its respective queues to the `stage7` exchange with the appropriate routing patterns.

## 3. Components

### 3.1. RabbitMQ

RabbitMQ acts as the central message broker, handling message routing, delivery, and persistence. It ensures messages are reliably delivered to their intended recipients.

### 3.2. Message Queue Client

The `MessageQueueClient` class (located in `shared/src/messaging/queueClient.ts`) provides a robust interface for interacting with RabbitMQ. Its key features include:
*   **Connection Management**: Handles connection establishment, automatic reconnection, and error recovery.
*   **Message Publishing**: Publishes messages to exchanges with specified routing keys and options.
*   **Message Consumption**: Subscribes to queues and processes incoming messages via callbacks.
*   **RPC Support**: Implements a request-response pattern for synchronous communication over the message queue.
*   **Error Handling**: Provides comprehensive error handling and recovery mechanisms for messaging operations.

### 3.3. BaseEntity Integration

The `BaseEntity` class (located in `shared/src/BaseEntity.ts`) has been enhanced to prioritize message queue communication.
*   **Initialization**: Sets up message queue connection and queue bindings during service initialization.
*   **Message Handling**: Provides a standardized method for processing messages received from the queue.
*   **Synchronous Communication**: Leverages the RPC pattern for synchronous requests, abstracting the message queue details.
*   **Fallback Mechanism**: Automatically falls back to HTTP communication if the message queue is unavailable, ensuring continued operation.
*   **Cleanup**: Properly closes message queue connections during service shutdown.

### 3.4. PostOffice Routing

The `PostOffice` class (located in `services/postoffice/src/PostOffice.ts`) has been updated to route messages primarily through RabbitMQ.
*   **Message Routing**: Routes messages to appropriate recipients (services or clients) via RabbitMQ or WebSockets.
*   **Synchronous Handling**: Uses the RPC pattern for synchronous messages, waiting for responses.
*   **WebSocket Integration**: Maintains WebSocket connections for direct client communication.
*   **Fallback Mechanism**: Falls back to HTTP-based communication if RabbitMQ is unavailable for service-to-service messages.

## 4. Implementation Details

1.  **Docker Compose**: RabbitMQ is integrated as a service within the `docker-compose.yaml` file, ensuring it's part of the system's deployment.
2.  **Environment Variables**: `RABBITMQ_URL` and other RabbitMQ-related environment variables are configured across all services that interact with the message queue.
3.  **MessageQueueClient**: This client handles the low-level details of connecting, publishing, and subscribing to RabbitMQ queues and exchanges.
4.  **BaseEntity Enhancements**: The `BaseEntity` class provides a high-level abstraction for services to send and receive messages, abstracting whether the communication happens over HTTP or the message queue.
5.  **Service Handlers**: Each service implements specific handlers to process messages received from its dedicated queue.

## 5. Configuration

### 5.1. Environment Variables

*   `RABBITMQ_URL`: URL for connecting to RabbitMQ (default: `amqp://stage7:stage7password@rabbitmq:5672`).
*   `RABBITMQ_DEFAULT_USER`: RabbitMQ username (default: `stage7`).
*   `RABBITMQ_DEFAULT_PASS`: RabbitMQ password (default: `stage7password`).
*   `RABBITMQ_DEFAULT_VHOST`: RabbitMQ virtual host (default: `/`).

### 5.2. Docker Compose

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

## 6. Benefits

1.  **Improved Resilience**: Services can communicate even if the recipient is temporarily unavailable, as messages are queued.
2.  **Reduced Coupling**: Services do not need to know the exact network location or availability status of other services.
3.  **Better Scalability**: Multiple instances of the same service can consume messages from the same queue, distributing the load.
4.  **Graceful Degradation**: The system can fall back to HTTP communication if the message queue becomes unavailable.
5.  **Reliability**: Messages can be configured for persistence, ensuring they are not lost during broker restarts or service downtime.
6.  **Load Balancing**: Messages are automatically distributed among available service instances consuming from a queue.
7.  **Monitoring**: RabbitMQ provides a management UI and APIs for monitoring message flow, queue status, and overall broker health.

## 7. Example Usage

### 7.1. Sending a Message

```typescript
// Synchronous message (requires immediate response)
await entity.sendMessage(MessageType.REQUEST, 'Brain', {
  question: 'What is the capital of France?'
}, true);

// Asynchronous message (fire and forget)
await entity.sendMessage(MessageType.STATUS_UPDATE, 'MissionControl', {
  status: 'Processing'
}, false);
```

### 7.2. Using AsyncLLM Utility

The `AsyncLLM` utility provides a simplified interface for making asynchronous LLM requests via the message queue. It handles the complexities of request/response correlation and timeouts.

```typescript
import { AsyncLLM } from '@cktmcs/shared';

const asyncLLM = new AsyncLLM();

try {
  const result = await asyncLLM.chat(
    [{ role: 'user', content: 'What is the capital of France?' }],
    'accuracy',
    { temperature: 0.7 }
  );

  console.log(`Response: ${result.response}`);
} catch (error) {
  console.error('Error:', error);
}
```

## 8. Monitoring and Management

The RabbitMQ Management UI is a powerful tool for observing and managing the message queue system. It is typically available at `http://localhost:15672` (if mapped in Docker Compose) with the following default credentials:
*   Username: `stage7`
*   Password: `stage7password`

The Management UI provides:
*   Queue monitoring
*   Message rate visualization
*   Connection management
*   Exchange and binding configuration
*   User management

## 9. Future Enhancements

1.  **Message Persistence**: Further configure RabbitMQ for robust message persistence to ensure messages survive broker restarts and hardware failures.
2.  **Dead Letter Queues (DLQs)**: Implement DLQs for handling messages that cannot be processed successfully, preventing them from blocking queues and enabling analysis of failures.
3.  **Circuit Breakers**: Add circuit breakers to message queue communication to prevent cascading failures when a service is overwhelmed or unresponsive.
4.  **Message Schemas**: Define and enforce schemas for messages to ensure data consistency and compatibility between services.
5.  **Message Prioritization**: Implement priority queues for critical messages to ensure they are processed before less urgent ones.
6.  **Message TTL (Time-To-Live)**: Set TTL for messages to prevent queues from building up indefinitely with stale messages.
7.  **Message Batching**: Batch messages for improved performance when sending or consuming large numbers of small messages.
8.  **Message Compression**: Compress large messages to reduce network bandwidth usage and improve throughput.