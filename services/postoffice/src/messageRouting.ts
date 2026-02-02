import { Message, MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/shared';
import axios from 'axios';
import { WebSocketHandler } from './webSocketHandler'; // Import WebSocketHandler

// Create an axios instance for HTTP communication
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
});

/**
 * MessageRouter class handles routing messages between services
 * It prioritizes RabbitMQ for service-to-service communication
 */
export class MessageRouter {
  private components: Map<string, any>;
  private messageQueue: Map<string, Message[]>;
  private missionClients: Map<string, Set<string>>;
  private mqClient: any;
  private authenticatedApi: any;
  private id: string;
  private webSocketHandler: WebSocketHandler; // Reference to WebSocketHandler

  constructor(
    components: Map<string, any>,
    messageQueue: Map<string, Message[]>,
    missionClients: Map<string, Set<string>>,
    mqClient: any,
    authenticatedApi: any,
    id: string,
    webSocketHandler: WebSocketHandler // Add WebSocketHandler to constructor parameters
  ) {
    this.components = components;
    this.messageQueue = messageQueue;
    this.missionClients = missionClients;
    this.mqClient = mqClient;
    this.authenticatedApi = authenticatedApi;
    this.id = id;
    this.webSocketHandler = webSocketHandler; // Initialize the WebSocketHandler reference
  }

  /**
   * Route a message to its recipient
   * @param message Message to route
   */
  async routeMessage(message: Message): Promise<void> {
    const messageId = (message as any).id || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    (message as any).id = messageId; // Add unique ID for tracking
    console.log(`[ROUTING_DEBUG] Routing message ${messageId} of type ${message.type} to ${message.recipient}`);
    
    // Extract clientId from either top level OR from content (SDK sends it in content)
    let clientId = (message as any).clientId;
    if (!clientId && message.content && typeof message.content === 'object') {
      clientId = (message.content as any).clientId;
    }
    console.log(`[ROUTING_DEBUG] Extracted clientId: ${clientId}, recipient: ${message.recipient}`);

    // Handle statistics messages (always sent directly to clients)
    if (message.type === MessageType.STATISTICS || (message.type as any) === 'agentStatistics') {
      console.log(`[ROUTING_DEBUG] Message ${messageId} is statistics, handling via handleStatisticsMessage`);
      await this.handleStatisticsMessage(message, clientId);
      return;
    }

    // Handle user messages (should be routed to MissionControl, not directly to client)
    if ((message.type as any) === 'userMessage' && message.recipient === 'MissionControl') {
      console.log(`[ROUTING_DEBUG] Message ${messageId} is a userMessage for MissionControl, routing to service not client`);
      await this.handleServiceMessage(message, message.recipient, clientId);
      return;
    }

    // Handle messages addressed to PostOffice with a clientId - forward to the client via WebSocket
    // This handles messages from backend services (SDK assistants) intended for frontend clients
    if (clientId && (message.recipient === 'PostOffice' || message.recipient === this.id)) {
      console.log(`[ROUTING_DEBUG] Message ${messageId} addressed to PostOffice with clientId ${clientId}, forwarding to client via WebSocket`);
      this.webSocketHandler.sendToClient(clientId, message);
      return;
    }

    // Handle messages to users (via WebSocket)
    if (clientId && message.recipient === 'user') {
        console.log(`[ROUTING_DEBUG] Message ${messageId} has clientId ${clientId} and recipient is user, sending directly to client`);
        this.webSocketHandler.sendToClient(clientId, message); // Delegate to WebSocketHandler
        return;
    }

    if (message.recipient === 'user') {
        if (message.missionId) {
            console.log(`[ROUTING_DEBUG] Message ${messageId} is for user with missionId ${message.missionId}, broadcasting to mission clients`);
            this.webSocketHandler.broadcastToMissionClients(message.missionId, message);
        } else {
            console.log(`[ROUTING_DEBUG] Message ${messageId} is for user with no missionId, broadcasting to all clients`);
            this.webSocketHandler.broadcastToClients(message); // Delegate to WebSocketHandler
        }
        return;
    }
    
    // Handle messages to services
    const recipientId = message.recipient;
    if (!recipientId) {
      console.error('No recipient specified for message:', message);
      return;
    }

    await this.handleServiceMessage(message, recipientId, clientId);
  }

  /**
   * Handle statistics messages
   * @param message Statistics message
   * @param clientId Optional client ID
   */
  private async handleStatisticsMessage(message: Message, clientId?: string): Promise<void> {
    console.log('Received statistics message');

    // If clientId is provided, send directly to that client
    if (clientId) {
      this.webSocketHandler.sendToClient(clientId, message);
      return;
    }

    // If no clientId but we have a missionId, send to all clients for that mission
    if (message.content && message.content.missionId) {
      const missionId = message.content.missionId;
      const clientsForMission = this.missionClients.get(missionId);

      if (clientsForMission && clientsForMission.size > 0) {
        clientsForMission.forEach(cId => {
          this.webSocketHandler.sendToClient(cId, message);
        });
        return;
      } else {
        console.log(`No clients found for mission ${missionId}, will try broadcasting`);
      }
    }

    // If we get here, we couldn't find specific clients, so broadcast to all
    console.log('Broadcasting statistics update to all clients');
    this.webSocketHandler.broadcastToClients(message);
  }

  /**
   * Handle messages to services
   * @param message Service message
   * @param recipientId Recipient ID
   * @param clientId Optional client ID
   */
  private async handleServiceMessage(message: Message, recipientId: string, clientId?: string): Promise<void> {
    // Check if this is a synchronous message that requires immediate response
    const requiresSync = message.requiresSync ||
                        message.type === MessageType.REQUEST ||
                        message.type === MessageType.RESPONSE;

    // Always try to use RabbitMQ first for service-to-service communication
    if (this.mqClient && this.mqClient.isConnected()) {
      try {
        const routingKey = `message.${recipientId}`;
        console.log(`Publishing message to RabbitMQ with routing key: ${routingKey}`);

        if (requiresSync && message.sender && (message as any).replyTo) {
          // For synchronous messages with replyTo, just publish with correlation ID
          await this.mqClient.publishMessage('stage7', routingKey, message, {
            correlationId: (message as any).correlationId,
            replyTo: (message as any).replyTo
          });
          console.log(`Published sync message to queue with routing key: ${routingKey}`);
          return;
        } else if (requiresSync) {
          // For synchronous messages without replyTo, use RPC pattern
          // Add replyTo and correlationId to the message
          const correlationId = Math.random().toString() + Date.now().toString();
          const rpcMessage = {
            ...message,
            correlationId,
            replyTo: 'amq.rabbitmq.reply-to'
          };

          // Send the message and wait for response
          console.log(`Sending RPC request to ${recipientId}`);
          const response = await this.mqClient.sendRpcRequest('stage7', routingKey, rpcMessage, 30000);
          console.log(`Received RPC response from ${recipientId}`);

          // If this is a request from a client, send the response back to the client
          if (clientId) {
            this.webSocketHandler.sendToClient(clientId, response); // Delegate to WebSocketHandler
          }

          return;
        } else {
          // For asynchronous messages, just publish
          await this.mqClient.publishMessage('stage7', routingKey, message);
          console.log(`Published async message to queue with routing key: ${routingKey}`);
          return;
        }
      } catch (error) {
        console.error('Failed to publish message to RabbitMQ:', error instanceof Error ? error.message : 'Unknown error');
        // Continue with fallback methods
      }
    } else {
      console.warn('RabbitMQ not connected, falling back to HTTP-based queue');
    }

    // Fallback to traditional HTTP-based queue if RabbitMQ is not available
    if (!this.messageQueue.has(recipientId)) {
      this.messageQueue.set(recipientId, []);
    }
    this.messageQueue.get(recipientId)!.push(message);
    console.log(`Added message to HTTP queue for ${recipientId}`);
  }

  /**
   * Process the message queue for services that don't support RabbitMQ
   * This is a transitional method that will be removed once all services support RabbitMQ
   */
  async processMessageQueue(): Promise<void> {
    // Only process the queue if RabbitMQ is not connected
    if (this.mqClient && this.mqClient.isConnected()) {
      // If RabbitMQ is connected, we don't need to process the HTTP queue
      // Just log a message if there are items in the queue
      let totalQueuedMessages = 0;
      for (const messages of this.messageQueue.values()) {
        totalQueuedMessages += messages.length;
      }

      if (totalQueuedMessages > 0) {
        console.log(`RabbitMQ is connected but there are still ${totalQueuedMessages} messages in the HTTP queue. These will be processed when RabbitMQ is disconnected.`);
      }

      return;
    }

    // Process messages for each recipient
    for (const [recipientId, messages] of this.messageQueue.entries()) {
      if (recipientId === 'user') {
        // Process messages for users
        while (messages.length > 0) {
          const message = messages.shift()!;
          if (message.missionId) {
            this.webSocketHandler.broadcastToMissionClients(message.missionId, message);
          } else {
            this.webSocketHandler.broadcastToClients(message); // Delegate to WebSocketHandler
          }
        }
      } else {
        // Process messages for services
        const component = this.components.get(recipientId);
        if (component && messages.length > 0) {
          const message = messages.shift()!;
          try {
            await this.authenticatedApi.post(`http://${component.url}/message`, message);
          } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to deliver message to ${recipientId}:`,
              error instanceof Error ? error.message : 'Unknown error');
            messages.unshift(message); // Put the message back in the queue
          }
        }
      }
    }
  }

  // Removed sendToClient and broadcastToClients methods to eliminate overlap with WebSocketHandler

  /**
   * Handle a message received from the RabbitMQ queue
   * @param message Message received from the queue
   */
  async handleQueueMessage(message: Message): Promise<void> {
    console.log('[RABBITMQ_DEBUG] ========= RabbitMQ message received =========');
    console.log('[RABBITMQ_DEBUG] Message type:', message.type);
    console.log('[RABBITMQ_DEBUG] Message recipient:', message.recipient);
    console.log('[RABBITMQ_DEBUG] Message sender:', message.sender);
    console.log('[RABBITMQ_DEBUG] Full message:', JSON.stringify(message, null, 2));
    console.log('[RABBITMQ_DEBUG] =============================================');
    console.log('Received message from RabbitMQ queue:', message.type);

    try {
      // Validate the message
      if (!message.type || !message.recipient) {
        console.error('Invalid message format received from queue:', message);
        return;
      }

      // Route the message to its recipient
      await this.routeMessage(message);
    } catch (error) {
      console.error('Error handling queue message:',
        error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
