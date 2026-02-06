import express from 'express';
import { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import { Assistant } from './Assistant';

/**
 * Normalizes a client ID to always be a string.
 * @param clientId The client ID which could be a string or string array.
 * @returns A normalized string client ID.
 */
function normalizeClientId(clientId: string | string[]): string {
  if (Array.isArray(clientId)) {
    // If it's an array, use the first element or generate a fallback
    return clientId.length > 0 ? clientId[0] : `client-${Date.now()}`;
  }
  return clientId;
}

export function createAssistantServer(assistant: Assistant) {
  const app = express();
  app.use(express.json());

  // Middleware to log requests and add consistent headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${assistant.id}] ${req.method} ${req.path}`);
    res.setHeader('X-Assistant-Name', assistant.name);
    res.setHeader('X-Assistant-ID', assistant.id);
    next();
  });

  // Conversation Management
  app.post('/conversations', async (req: Request, res: Response) => {
    const { initialPrompt, clientId, userId, agentClass, instanceId, missionContext } = req.body;
    if (!initialPrompt) {
      return res.status(400).send({ error: 'initialPrompt is required' });
    }
    if (!clientId) {
      return res.status(400).send({ error: 'clientId is required' });
    }
    try {
      const conversation = await assistant.startConversation(initialPrompt, normalizeClientId(clientId), {
        userId,
        agentClass,
        instanceId,
        missionContext
      });
      // The startConversation method now handles sending the initial messages.
      // We just need to return the conversation object, or at least its ID.
      res.status(201).json(conversation);
    } catch (error: any) {
      console.error(`[${assistant.id}] Error starting conversation:`, error);
      res.status(500).send({ error: 'Failed to start conversation', details: error.message });
    }
  });

  app.post('/conversations/:id/messages', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { message } = req.body;
    try {
      await assistant.sendMessageToConversation(normalizeClientId(id), message);
      res.status(200).json({ status: 'ok' });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error sending message:`, error);
      res.status(500).send({ error: 'Failed to send message', details: error.message });
    }
  });

  app.post('/conversations/:id/events', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { event, clientId } = req.body;
    if (!event) {
      return res.status(400).send({ error: 'event is required' });
    }
    try {
      const normalizedClientId = clientId ? normalizeClientId(clientId) : undefined;
      const result = await assistant.handleEvent(normalizeClientId(id), event, normalizedClientId);
      res.status(200).json(result);
    } catch (error: any) {
      console.error(`[${assistant.id}] Error handling event:`, error);
      res.status(500).send({ error: 'Failed to handle event', details: error.message });
    }
  });

  app.get('/conversations/:id/state', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { collection, query } = req.query;
    if (!collection || typeof collection !== 'string') {
      return res.status(400).send({ error: 'collection is required' });
    }
    let parsedQuery: any = {};
    if (query && typeof query === 'string') {
      try {
        parsedQuery = JSON.parse(query);
      } catch (error) {
        return res.status(400).send({ error: 'Invalid query JSON' });
      }
    }
    try {
      // Check if conversation exists before attempting to get state
      const normalizedId = normalizeClientId(id);
      const conversation = assistant.getConversation(normalizedId);
      if (!conversation) {
        return res.status(404).send({ error: 'Conversation not found' });
      }
      const state = await assistant.getState(normalizedId, collection, parsedQuery);
      res.status(200).json({ data: state });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error getting state:`, error);
      res.status(500).send({ error: 'Failed to get state', details: error.message });
    }
  });

  app.get('/conversations/:id/history', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const history = await assistant.getConversationHistory(normalizeClientId(id));
      const context = await assistant.getConversationContext(normalizeClientId(id));
      res.status(200).json({
        history,
        context,
        conversationId: id,
        assistantId: assistant.id,
        assistantName: assistant.name,
      });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error getting conversation history:`, error);
      res.status(500).send({ error: 'Failed to get history', details: error.message });
    }
  });

  // Assistant Info
  app.get('/info', (req: Request, res: Response) => {
    try {
      res.status(200).json({
        id: assistant.id,
        name: assistant.name,
        role: assistant.role,
        tools: Array.from(assistant.tools.keys()),
      });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error getting assistant info:`, error);
      res.status(500).send({ error: 'Failed to get info', details: error.message });
    }
  });

  // Health check endpoint for Consul service discovery
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      service: assistant.id,
      name: assistant.name,
      timestamp: new Date().toISOString()
    });
  });

  // Generic Error Handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[${assistant.id}] Unhandled error:`, err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  return app;
}
