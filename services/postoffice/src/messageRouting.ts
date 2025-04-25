import { Message, MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';
import WebSocket from 'ws';

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
  private componentsByType: Map<string, Set<string>>;
  private messageQueue: Map<string, Message[]>;
  private clients: Map<string, WebSocket>;
  private missionClients: Map<string, Set<string>>;
  private clientMessageQueue: Map<string, Message[]>;
  private mqClient: any;
  private authenticatedApi: any;
  private id: string;
  private serviceDiscoveryManager: any;

  constructor(
    components: Map<string, any>,
    componentsByType: Map<string, Set<string>>,
    messageQueue: Map<string, Message[]>,
    clients: Map<string, WebSocket>,
    missionClients: Map<string, Set<string>>,
    clientMessageQueue: Map<string, Message[]>,
    mqClient: any,
    authenticatedApi: any,
    id: string,
    serviceDiscoveryManager: any
  ) {
    this.components = components;
    this.componentsByType = componentsByType;
    this.messageQueue = messageQueue;
    this.clients = clients;
    this.missionClients = missionClients;
    this.clientMessageQueue = clientMessageQueue;
    this.mqClient = mqClient;
    this.authenticatedApi = authenticatedApi;
    this.id = id;
    this.serviceDiscoveryManager = serviceDiscoveryManager;
  }

  /**
   * Route a message to its recipient
   * @param message Message to route
   */
  async routeMessage(message: Message): Promise<void> {
    console.log(`Routing message of type ${message.type} to ${message.recipient}`);
    const { clientId } = message;

    // Handle statistics messages (always sent directly to clients)
    if (message.type === MessageType.STATISTICS || (message.type as any) === 'agentStatistics') {
      await this.handleStatisticsMessage(message, clientId);
      return;
    }

    // Handle messages to users (via WebSocket)
    if (message.recipient === 'user') {
      await this.handleUserMessage(message, clientId);
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
      console.log(`Routing statistics update to client: ${clientId}`);
      this.sendToClient(clientId, message);
      return;
    }

    // If no clientId but we have a missionId, send to all clients for that mission
    if (message.content && message.content.missionId) {
      const missionId = message.content.missionId;
      const clientsForMission = this.missionClients.get(missionId);

      if (clientsForMission && clientsForMission.size > 0) {
        console.log(`Routing statistics update for mission ${missionId} to ${clientsForMission.size} clients`);
        clientsForMission.forEach(cId => {
          this.sendToClient(cId, message);
        });
        return;
      } else {
        console.log(`No clients found for mission ${missionId}, will try broadcasting`);
      }
    }

    // If we get here, we couldn't find specific clients, so broadcast to all
    console.log('Broadcasting statistics update to all clients');
    this.broadcastToClients(message);
  }

  /**
   * Handle messages to users
   * @param message User message
   * @param clientId Optional client ID
   */
  private async handleUserMessage(message: Message, clientId?: string): Promise<void> {
    // If clientId is provided, send directly to that client
    if (clientId) {
      console.log(`Routing message to client: ${clientId}`);
      this.sendToClient(clientId, message);
      return;
    }

    // If this is a say message from an agent, try to find the client for the mission
    if (message.type && message.type.toString() === 'say' && message.sender) {
      // Extract the agent ID from the sender (format: "agentId: message")
      const agentId = message.sender.split(':')[0].trim();
      console.log(`Processing say message from agent ${agentId}`);

      // Find the mission for this agent by checking all missions
      let clientsFound = false;
      for (const [missionId, clients] of this.missionClients.entries()) {
        if (clients.size > 0) {
          console.log(`Routing say message from agent ${agentId} to ${clients.size} clients for mission ${missionId}`);
          clients.forEach(cId => {
            console.log(`Sending say message to client ${cId}`);
            this.sendToClient(cId, message);
          });
          clientsFound = true;
        }
      }

      if (!clientsFound) {
        console.log(`No clients found for agent ${agentId}, broadcasting message to all clients`);
        this.broadcastToClients(message);
      }
      return;
    }

    // If no specific client, broadcast to all connected clients
    console.log('Broadcasting message to all clients');
    this.broadcastToClients(message);
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
            this.sendToClient(clientId, response);
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
          this.broadcastToClients(message);
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

  /**
   * Send a message to a specific client
   * @param clientId Client ID
   * @param message Message to send
   */
  sendToClient(clientId: string, message: any): void {
    console.log(`Attempting to send message of type ${message.type} to client ${clientId}`);

    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        const messageJson = JSON.stringify(message);
        client.send(messageJson);
        console.log(`Message sent to client ${clientId}. Message type: ${message.type}`);

        if (message.type === MessageType.STATISTICS) {
          console.log(`Statistics message sent to client ${clientId}:`, JSON.stringify(message, null, 2));
        }
      } catch (error) {
        console.error(`Error sending message to client ${clientId}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      console.log(`Client ${clientId} not found or not ready. ReadyState: ${client ? client.readyState : 'Client not found'}`);

      // Queue the message for when the client connects
      if (!this.clientMessageQueue.has(clientId)) {
        this.clientMessageQueue.set(clientId, []);
      }
      this.clientMessageQueue.get(clientId)!.push(message);
      console.log(`Message queued for client ${clientId}. Queue size: ${this.clientMessageQueue.get(clientId)!.length}`);

      if (client) {
        console.log(`Attempting to reconnect client ${clientId}`);
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param message Message to broadcast
   */
  broadcastToClients(message: any): void {
    console.log(`Broadcasting message of type ${message.type} to all clients`);
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
          console.log(`Broadcast message sent to client ${clientId}`);
          sentCount++;
        } catch (error) {
          console.error(`Error broadcasting message to client ${clientId}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      } else {
        console.log(`Client ${clientId} not ready for broadcast, readyState: ${client.readyState}`);
      }
    });

    console.log(`Broadcast complete: sent to ${sentCount} of ${this.clients.size} clients`);
  }

  /**
   * Handle a message received from the RabbitMQ queue
   * @param message Message received from the queue
   */
  async handleQueueMessage(message: Message): Promise<void> {
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

