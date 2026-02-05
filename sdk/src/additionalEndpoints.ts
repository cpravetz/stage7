import express, { Request, Response, NextFunction } from 'express';
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

export function addAdditionalEndpoints(app: express.Application, assistant: Assistant) {
  // Context management endpoints
  app.get('/conversations/:id/context', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const context = await assistant.getConversationContext(normalizeClientId(id));
      res.status(200).json(context);
    } catch (error: any) {
      console.error(`[${assistant.id}] Error getting conversation context:`, error);
      res.status(500).send({ error: 'Failed to get context', details: error.message });
    }
  });

  app.put('/conversations/:id/context', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { context } = req.body;
    
    if (!context || typeof context !== 'object') {
      return res.status(400).send({ error: 'Valid context object is required' });
    }
    
    try {
      await assistant.updateConversationContext(normalizeClientId(id), context);
      res.status(200).json({ status: 'ok', message: 'Context updated successfully' });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error updating conversation context:`, error);
      res.status(500).send({ error: 'Failed to update context', details: error.message });
    }
  });

  // Conversation management endpoints
  app.post('/conversations/:id/end', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await assistant.endConversation(normalizeClientId(id));
      res.status(200).json({ status: 'ok', message: 'Conversation ended successfully' });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error ending conversation:`, error);
      res.status(500).send({ error: 'Failed to end conversation', details: error.message });
    }
  });

  // Human input handling endpoint
  app.post('/conversations/:id/human-input', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { inputStepId, response } = req.body;
    
    if (!inputStepId || !response) {
      return res.status(400).send({ error: 'inputStepId and response are required' });
    }
    
    try {
      const conversation = assistant.getConversation(normalizeClientId(id));
      if (!conversation) {
        return res.status(404).send({ error: 'Conversation not found' });
      }
      
      await conversation.submitHumanInput(response, inputStepId);
      
      // Update context with human input information
      const currentContext = await assistant.getConversationContext(normalizeClientId(id));
      await assistant.updateConversationContext(normalizeClientId(id), {
        ...currentContext,
        lastHumanInput: {
          stepId: inputStepId,
          response,
          timestamp: new Date().toISOString()
        }
      });
      
      res.status(200).json({ status: 'ok', message: 'Human input submitted successfully' });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error submitting human input:`, error);
      res.status(500).send({ error: 'Failed to submit human input', details: error.message });
    }
  });

  // Message receiving endpoint for MissionControl/AgentSet to send user messages
  app.post('/message', async (req: Request, res: Response) => {
    try {
      const { type, content, clientId, missionId } = req.body;
      console.log(`[${assistant.id}] Received /message endpoint call:`, { type, clientId, missionId });

      // Only handle USER_MESSAGE type
      if (type !== 'userMessage' && type !== 'USER_MESSAGE') {
        console.warn(`[${assistant.id}] Ignoring non-userMessage type: ${type}`);
        return res.status(200).json({ status: 'ok', message: 'Message type ignored' });
      }

      // Extract the actual message and mission ID
      const userMessage = content?.message || content;
      const conversationId = missionId || content?.missionId;
      
      if (!conversationId || !userMessage) {
        console.error(`[${assistant.id}] Missing conversationId or message content`);
        return res.status(400).send({ error: 'conversationId (missionId) and message are required' });
      }

      // Store the clientId with the conversation so responses can be sent back
      const conversation = assistant.getConversation(conversationId);
      if (conversation) {
        // Store the clientId in the session so sendMessageToClient can use it
        const session = (assistant as any).activeSessions?.get(conversationId);
        if (session && clientId) {
          session.frontendClientId = normalizeClientId(clientId);
          console.log(`[${assistant.id}] Updated session for conversation ${conversationId} with clientId ${session.frontendClientId}`);
        }
      }

      // Send the message to the assistant
      await assistant.sendMessageToConversation(conversationId, userMessage);
      
      res.status(200).json({ status: 'ok', message: 'Message sent to conversation', conversationId });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error handling message:`, error);
      res.status(500).send({ error: 'Failed to handle message', details: error.message });
    }
  });

  // Enhanced assistant information endpoint
  app.get('/info', (req: Request, res: Response) => {
    try {
      res.status(200).json({
        id: assistant.id,
        name: assistant.name,
        role: assistant.role,
        personality: assistant.personality,
        tools: Array.from(assistant.tools.keys()),
        activeConversations: assistant.getActiveSessions().size
      });
    } catch (error: any) {
      console.error(`[${assistant.id}] Error getting assistant info:`, error);
      res.status(500).send({ error: 'Failed to get info', details: error.message });
    }
  });
}
