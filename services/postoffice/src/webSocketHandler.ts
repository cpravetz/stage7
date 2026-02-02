import WebSocket from 'ws';
import http from 'http';
import { Message, MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/shared';

/**
 * WebSocketHandler class handles WebSocket connections and messages
 */
export class WebSocketHandler {
  private clients: Map<string, WebSocket.WebSocket>;
  private clientMessageQueue: Map<string, Message[]>;
  private clientMissions: Map<string, string>;
  private missionClients: Map<string, Set<string>>;
  private assistantClients: Set<string>;
  private authenticatedApi: any;
  private getComponentUrl: (type: string) => string | undefined;
  private handleWebSocketMessage: (message: any, token: string) => Promise<void>;

  constructor(
    clients: Map<string, WebSocket.WebSocket>,
    clientMessageQueue: Map<string, Message[]>,
    clientMissions: Map<string, string>,
    missionClients: Map<string, Set<string>>,
    assistantClients: Set<string>,
    authenticatedApi: any,
    getComponentUrl: (type: string) => string | undefined,
    handleWebSocketMessage: (message: any, token: string) => Promise<void>
  ) {
    this.clients = clients;
    this.clientMessageQueue = clientMessageQueue;
    this.clientMissions = clientMissions;
    this.missionClients = missionClients;
    this.assistantClients = assistantClients;
    this.authenticatedApi = authenticatedApi;
    this.getComponentUrl = getComponentUrl;
    this.handleWebSocketMessage = handleWebSocketMessage;
  }

  /**
   * Set up WebSocket server
   * @param wss WebSocket server
   */
  setupWebSocket(wss: WebSocket.Server): void {
    wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
      console.log('New WebSocket connection attempt');
      const url = new URL(req.url!, `http://${req.headers.host}`);
      let clientId = url.searchParams.get('clientId');
      const token = url.searchParams.get('token');

      // Remove 'browser-' prefix if present for consistency
      if (clientId && clientId.startsWith('browser-')) {
        clientId = clientId.substring(8);
      }

      console.log(`WebSocket connection attempt - ClientID: ${clientId}, Token: ${token}`);

      if (!clientId) {
        console.log('Client ID missing');
        ws.close(1008, 'Client ID missing');
        return;
      }

      const isValid = true; //await this.validateClientConnection(clientId, token);
      if (!isValid) {
        console.log(`Invalid token for client ${clientId}`);
        ws.close(1008, 'Invalid token');
        return;
      }
      this.clients.set(clientId, ws);
      console.log(`Client ${clientId} connected successfully`);

      // Check if this client has an associated mission
      const missionId = this.clientMissions.get(clientId);
      if (missionId) {
        console.log(`Client ${clientId} is associated with mission ${missionId}`);

        // Make sure the mission is in the missionClients map
        if (!this.missionClients.has(missionId)) {
          this.missionClients.set(missionId, new Set());
        }

        // Add the client to the mission's client set
        this.missionClients.get(missionId)!.add(clientId);
        console.log(`Added client ${clientId} to mission ${missionId} clients`);
      } else {
        console.log(`Client ${clientId} is not associated with any mission yet`);
      }

      // Send any queued messages to the client
      if (this.clientMessageQueue.has(clientId)) {
        const queuedMessages = this.clientMessageQueue.get(clientId)!;
        console.log(`Sending ${queuedMessages.length} queued messages to client ${clientId}`);

        while (queuedMessages.length > 0) {
          const message = queuedMessages.shift()!;
          try {
            ws.send(JSON.stringify(message));
            console.log(`Sent queued message of type ${message.type} to client ${clientId}`);
          } catch (error) {
            console.error(`Error sending queued message to client ${clientId}:`, 
              error instanceof Error ? error.message : error);
            // Put the message back in the queue
            this.clientMessageQueue.get(clientId)!.unshift(message);
            break;
          }
        }

        console.log(`All queued messages sent to client ${clientId}`);
      }

      ws.on('message', async (message: string) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          console.log(`Received WebSocket message from client ${clientId}:`, parsedMessage);

          if (parsedMessage.type === MessageType.CLIENT_CONNECT) {
            console.log(`Client ${parsedMessage.clientId} confirmed connection`);

            // Associate this client with any missions it might have
            if (this.clientMissions.has(clientId!)) {
              const missionId = this.clientMissions.get(clientId!)!;
              console.log(`Associating client ${clientId} with mission ${missionId}`);

              // Make sure the mission is in the missionClients map
              if (!this.missionClients.has(missionId)) {
                this.missionClients.set(missionId, new Set());
              }

              // Add the client to the mission's client set
              this.missionClients.get(missionId)!.add(clientId!);
            }
          } else if (parsedMessage.type === MessageType.RECONNECT_MISSION) {
            const { missionId } = parsedMessage.content;
            if (missionId) {
                console.log(`Reconnecting client ${clientId} to mission ${missionId}`);
                this.clientMissions.set(clientId!, missionId);

                if (!this.missionClients.has(missionId)) {
                    this.missionClients.set(missionId, new Set());
                }
                this.missionClients.get(missionId)!.add(clientId!);

                // Resume the mission since the client has reconnected
                try {
                  const missionControlUrl = this.getComponentUrl('MissionControl');
                  if (missionControlUrl) {
                    await this.authenticatedApi.post(`http://${missionControlUrl}/message`, {
                      type: MessageType.RESUME,
                      sender: 'PostOffice',
                      recipient: 'MissionControl',
                      content: {
                        type: 'resume',
                        action: 'resume',
                        missionId: missionId,
                        reason: 'Client reconnected'
                      },
                      timestamp: new Date().toISOString()
                    });
                    console.log(`Successfully resumed mission ${missionId} due to client ${clientId} reconnection`);
                  } else {
                    console.error(`Could not resume mission ${missionId}: MissionControl not found`);
                  }
                } catch (error) {
                  analyzeError(error as Error);
                  console.error(`Failed to resume mission ${missionId}:`, error instanceof Error ? error.message : error);
                }

                // Send a confirmation to the client
                ws.send(JSON.stringify({ type: 'RECONNECT_SUCCESS', missionId }));
            }
          } else {
            this.handleWebSocketMessage(parsedMessage, token || '');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error instanceof Error ? error.message : error);
          console.log('Raw message:', message);
        }
      });

      ws.on('close', async () => {
        console.log(`Client ${clientId} disconnected`);
        this.clients.delete(clientId!);

        // Check if this client had an active mission
        const missionId = this.clientMissions.get(clientId!);
        if (missionId) {
          console.log(`Client ${clientId} disconnected with active mission ${missionId}. Pausing mission...`);

          try {
            // Send pause message to MissionControl
            const missionControlUrl = this.getComponentUrl('MissionControl');
            if (missionControlUrl) {
              await this.authenticatedApi.post(`http://${missionControlUrl}/message`, {
                type: MessageType.PAUSE,
                sender: 'PostOffice',
                recipient: 'MissionControl',
                content: {
                  type: 'pause',
                  action: 'pause',
                  missionId: missionId,
                  reason: 'Client disconnected'
                },
                timestamp: new Date().toISOString()
              });
              console.log(`Successfully paused mission ${missionId} due to client ${clientId} disconnection`);
            } else {
              console.error(`Could not pause mission ${missionId}: MissionControl not found`);
            }
          } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to pause mission ${missionId}:`, error instanceof Error ? error.message : error);
          }
        }
      });

      // Send a connection confirmation message
      ws.send(JSON.stringify({ type: 'CONNECTION_CONFIRMED', clientId }));
    });
  }

  /**
   * Send a message to a specific client
   * @param clientId Client ID
   * @param message Message to send
   */
  sendToClient(clientId: string, message: any): void {
    if (this.assistantClients.has(clientId) && message.visibility === 'developer') {
        console.log(`[ASSISTANT_FILTER] Dropping developer-only message for client ${clientId} of type ${message.type}`);
        return;
    }
    const messageId = message.id || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    message.id = messageId; // Add unique ID for tracking
    console.log(`[WS_DEBUG] Attempting to send message ${messageId} of type ${message.type} to client ${clientId}`);

    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        const messageJson = JSON.stringify(message);
        client.send(messageJson);
        console.log(`[WS_DEBUG] Message ${messageId} sent to client ${clientId}. Message type: ${message.type}`);

      } catch (error) {
        console.error(`[WS_DEBUG] Error sending message ${messageId} to client ${clientId}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      console.log(`[WS_DEBUG] Client ${clientId} not found or not ready. ReadyState: ${client ? client.readyState : 'Client not found'}. Queueing message ${messageId}`);

      // Queue the message for when the client connects
      if (!this.clientMessageQueue.has(clientId)) {
        this.clientMessageQueue.set(clientId, []);
      }
      this.clientMessageQueue.get(clientId)!.push(message);
      console.log(`[WS_DEBUG] Message ${messageId} queued for client ${clientId}. Queue size: ${this.clientMessageQueue.get(clientId)!.length}`);

      if (client) {
        console.log(`Attempting to reconnect client ${clientId}`);
      }
    }
  }

  /**
   * Broadcast a message to all clients associated with a specific mission
   * @param missionId Mission ID
   * @param message Message to broadcast
   */
  broadcastToMissionClients(missionId: string, message: any): void {
    const messageId = message.id || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    message.id = messageId; // Add unique ID for tracking
    console.log(`[WS_DEBUG] Broadcasting message ${messageId} of type ${message.type} to clients of mission ${missionId}`);
    const clientIds = this.missionClients.get(missionId);

    if (clientIds) {
      console.log(`[WS_DEBUG] Mission ${missionId} has ${clientIds.size} clients:`, Array.from(clientIds));
      clientIds.forEach(clientId => {
        // The sendToClient method already handles queuing if the client is not connected
        console.log(`[WS_DEBUG] Sending broadcast message ${messageId} to client ${clientId}`);
        this.sendToClient(clientId, message);
      });
      console.log(`[WS_DEBUG] Broadcast to mission ${missionId} complete: sent message ${messageId} to ${clientIds.size} clients.`);
    } else {
      console.log(`[WS_DEBUG] No clients found for mission ${missionId} to broadcast message ${messageId}.`);
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param message Message to broadcast
   */
  broadcastToClients(message: any): void {
    const messageId = message.id || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    message.id = messageId; // Add unique ID for tracking
    console.log(`[WS_DEBUG] Broadcasting message ${messageId} of type ${message.type} to all ${this.clients.size} clients`);
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
          console.log(`[WS_DEBUG] Broadcast message ${messageId} sent to client ${clientId}`);
          sentCount++;
        } catch (error) {
          console.error(`[WS_DEBUG] Error broadcasting message ${messageId} to client ${clientId}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      } else {
        console.log(`[WS_DEBUG] Client ${clientId} not ready for broadcast, readyState: ${client.readyState}`);
      }
    });

    console.log(`[WS_DEBUG] Broadcast complete: sent message ${messageId} to ${sentCount} of ${this.clients.size} clients`);
  }
}
