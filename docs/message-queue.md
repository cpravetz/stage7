# Message Queue Implementation

This document describes the message queue implementation for asynchronous communication between services in the Stage7 system.

## Overview

The Stage7 system now uses RabbitMQ for asynchronous communication between services. This provides several benefits:

1. **Improved Resilience**: Services can now communicate even if the recipient is temporarily unavailable
2. **Reduced Coupling**: Services don't need to know the exact location of other services
3. **Better Scalability**: Multiple instances of the same service can consume messages from the same queue
4. **Graceful Degradation**: The system falls back to HTTP if the message queue is unavailable

## Architecture

The message queue implementation consists of the following components:

1. **RabbitMQ**: The message broker that handles message routing and delivery
2. **MessageQueueClient**: A shared utility class for interacting with RabbitMQ
3. **BaseEntity**: Enhanced to support both HTTP and message queue communication
4. **Service Handlers**: Each service implements handlers for messages received from the queue

## Message Flow

Messages can flow through the system in two ways:

1. **Synchronous (HTTP)**: For messages that require an immediate response
   - Client sends a message to PostOffice via HTTP
   - PostOffice forwards the message to the recipient via HTTP
   - Recipient processes the message and returns a response
   - PostOffice forwards the response back to the client

2. **Asynchronous (RabbitMQ)**: For messages that don't require an immediate response
   - Client publishes a message to the RabbitMQ exchange with a routing key
   - RabbitMQ routes the message to the appropriate queue(s)
   - Recipient(s) consume the message from their queue
   - If a response is needed, it's sent back via another message

## Exchange and Queue Structure

The system uses a topic exchange named `stage7` with the following routing patterns:

- `message.{serviceId}`: Routes messages to a specific service
- `message.{componentType}`: Routes messages to all services of a specific type
- `message.all`: Routes messages to all services

Each service creates a queue and binds it to the exchange with the appropriate routing patterns.

## Message Types

Messages are classified by their `type` field, which determines how they are processed. The system supports both standard message types (defined in the `MessageType` enum) and service-specific message types.

## Fallback Mechanism

If the message queue is unavailable or if a message requires synchronous processing, the system falls back to HTTP communication. This ensures that the system can continue to function even if the message queue is down.

## AsyncLLM Utility

The `AsyncLLM` utility provides a simple way to make asynchronous LLM requests via the message queue. It handles request/response correlation and timeouts, making it easy to use the Brain service asynchronously.

## Example Usage

### Sending a Message

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

### Using AsyncLLM

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

## Implementation Details

1. **Docker Compose**: RabbitMQ is added as a service in the docker-compose.yaml file
2. **Environment Variables**: RABBITMQ_URL is added to all services
3. **MessageQueueClient**: Handles connection, publishing, and subscribing to queues
4. **BaseEntity**: Enhanced to support both HTTP and message queue communication
5. **Service Handlers**: Each service implements handlers for messages received from the queue

## Future Enhancements

1. **Message Persistence**: Configure RabbitMQ for message persistence to survive broker restarts
2. **Dead Letter Queues**: Implement dead letter queues for handling failed messages
3. **Circuit Breakers**: Add circuit breakers to prevent cascading failures
4. **Message Schemas**: Define schemas for messages to ensure compatibility
5. **Monitoring**: Add monitoring for message queue health and performance
