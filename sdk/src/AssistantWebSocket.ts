import WebSocket from 'ws';
import * as http from 'http';
import { Assistant } from './Assistant';
import { Request } from 'express';

/**
 * Creates and configures a WebSocket server for an assistant.
 * Handles connection lifecycle, conversation binding, and event forwarding.
 * 
 * This eliminates duplicate WebSocket setup code across all 20 assistants.
 * 
 * @param server HTTP server to attach WebSocket to
 * @param assistant Assistant instance
 * @param path WebSocket endpoint path (default: /ws/conversations)
 * @returns WebSocket.Server instance
 */
export function createAssistantWebSocket(
  server: http.Server,
  assistant: Assistant,
  path: string = '/ws/conversations'
): WebSocket.Server {
  const wss = new WebSocket.Server({ server, path });
  const clients = new Map<string, WebSocket>();

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const conversationId = req.url?.split('/').pop();
    
    if (!conversationId || typeof conversationId !== 'string') {
      ws.close(1008, 'Conversation ID required and must be a string');
      return;
    }

    const conversation = assistant.getConversation(conversationId);
    if (!conversation) {
      ws.close(1008, 'Conversation not found');
      return;
    }

    clients.set(conversationId, ws);
    console.log(`[${assistant.id}] WebSocket connected: ${conversationId}`);

    // Send connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'connected',
        data: {
          conversationId,
          assistantId: assistant.id,
          assistantName: assistant.name,
          timestamp: new Date().toISOString()
        }
      }));
    }

    // Wire up conversation events to WebSocket
    const session = assistant.getActiveSessions().get(conversationId);
    if (session) {
      const sendIfOpen = (event: string, data: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event, data }));
        }
      };

      session.conversation.on('message', (event, msg) => sendIfOpen('message', msg));
      session.conversation.on('tool_call', (event, data) => sendIfOpen('tool_call', data));
      session.conversation.on('tool_output', (event, data) => sendIfOpen('tool_output', data));
      session.conversation.on('human_input_required', (event, data) =>
        sendIfOpen('human_input_required', data)
      );
      session.conversation.on('error', (event, error) => {
        console.error(`[${assistant.id}] Conversation error:`, error);
        sendIfOpen('error', {
          message: error.message,
          details: (error as any).details
        });
      });
      session.conversation.on('end', () => sendIfOpen('end', {}));
    }

    // Handle disconnection
    ws.on('close', () => {
      clients.delete(conversationId);
      console.log(`[${assistant.id}] WebSocket disconnected: ${conversationId}`);
    });

    ws.on('error', (error: Error) => {
      console.error(`[${assistant.id}] WebSocket error for ${conversationId}:`, error);
      clients.delete(conversationId);
    });
  });

  return wss;
}
