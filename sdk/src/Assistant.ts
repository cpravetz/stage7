import { Conversation } from './Conversation';
import { Tool } from './Tool';
import { ICoreEngineClient, JsonSchema, ConversationMessage, ConversationEvent, AssistantEvent, AssistantStateDelta } from './types'; // Assuming types.ts defines these
import { BaseService } from '@cktmcs/shared';
import axios from 'axios';
import { LibrarianClient } from './LibrarianClient';
import { randomUUID } from 'crypto';

export interface AssistantConfig {
  id: string; // Unique identifier for the assistant instance
  name: string;
  role: string;
  personality: string; // A prompt-friendly description of the assistant's persona for the LLM
  tools?: Tool[]; // Optional: Tools available to this assistant at initialization
  coreEngineClient: ICoreEngineClient; // The client to communicate with the Core Engine
  port?: string;
  urlBase?: string; // Optional: The base URL for service registration (e.g., 'sales-assistant-api')
  agentClass?: string; // Optional: agent class identifier for persistence scoping
}

export interface ChatSession {
  conversationId: string;
  conversation: Conversation;
  context: any;
  history: ConversationMessage[];
  frontendClientId: string;
  userId?: string;
  agentClass?: string;
  instanceId?: string;
}

export class Assistant extends BaseService {
  public readonly id: string;
  public readonly name: string;
  public readonly role: string;
  public readonly personality: string;
  public tools: Map<string, Tool>; // Map tool names to Tool instances
  private coreEngineClient: ICoreEngineClient;
  private activeSessions: Map<string, ChatSession>; // Track active chat sessions
  private agentClass: string;
  private globalContext: any; // Global context for the assistant
  private brainUrl: string;
  private librarianClient: LibrarianClient | null = null;
  private librarianUrl: string | null = null;

  constructor(config: AssistantConfig) {
    const serviceName = config.name.replace(/\s+/g, '-').toLowerCase();
    const port = config.port || process.env.PORT || '3000';
    const urlBase = config.urlBase || serviceName;
    super(config.id, 'assistant', urlBase, port);
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.personality = config.personality;
    this.coreEngineClient = config.coreEngineClient;
    this.tools = new Map(config.tools?.map(tool => [tool.name, tool]) || []);
    this.activeSessions = new Map();
    this.agentClass = config.agentClass || config.id;
    this.globalContext = {};
    this.brainUrl = process.env.BRAIN_URL || 'http://brain:5070'; // Store only base URL
  }

  /**
   * Normalizes a client ID to always be a string.
   * @param clientId The client ID which could be a string or string array.
   * @returns A normalized string client ID.
   */
  private normalizeClientId(clientId: string | string[]): string {
    if (Array.isArray(clientId)) {
      // If it's an array, use the first element or generate a fallback
      return clientId.length > 0 ? clientId[0] : `client-${Date.now()}`;
    }
    return clientId;
  }

  /**
   * Generates a direct conversational response for simple queries using the Brain service.
   * @param prompt The user's input.
   * @param frontendClientId The client ID for the frontend.
   * @returns The generated conversational response.
   */
  private async getSimpleResponse(
    prompt: string,
    frontendClientId: string,
    context?: {
      userId?: string;
      agentClass?: string;
      instanceId?: string;
      missionContext?: string;
    }
  ): Promise<Conversation | { escalate: true; reason: string }> {
    const conversationalPrompt = `You are a helpful and ${this.personality} assistant whose role is to ${this.role}.
The user has sent a message: "${prompt}"

Your task is to respond to the user's message.

If you can provide a direct, helpful, and in-character conversational response without needing to use any specialized tools or multi-step planning, provide that response.

If the user's request is complex, requires the use of specialized tools or data analysis specific to your domain, or needs a multi-step planning process, you MUST respond with a JSON object like this:
{
  "escalate": true,
  "reason": "Explain why escalation is needed, e.g., 'Requires analysis using specialized tools.'"
}
Do NOT provide any conversational response if you need to escalate. ONLY return the JSON.

Otherwise, provide your direct conversational response as plain text.`;
    try {
      const authenticatedAxios = this.getAuthenticatedAxios();
      const response = await authenticatedAxios.post(`${this.brainUrl}/generate`, {
        prompt: conversationalPrompt,
        raw: true, // Request raw response to parse it ourselves
      });
      // --- NEW DIAGNOSTIC LOGGING ---
      console.log('[Assistant::getSimpleResponse] Raw Axios Response Status:', response.status);
      console.log('[Assistant::getSimpleResponse] Raw Axios Response Data:', JSON.stringify(response.data, null, 2));
      console.log('[Assistant::getSimpleResponse] Extracted response.data?.result:', response.data?.result);
      // --- END NEW DIAGNOSTIC LOGGING ---

      const brainResponseContent = response.data?.result; // Brain returns content in 'result' field for raw responses

      if (brainResponseContent) {
        try {
          const parsedResponse = JSON.parse(brainResponseContent);
          if (parsedResponse.escalate === true && parsedResponse.reason) {
            console.log('[Brain Escalation] Brain indicated escalation:', parsedResponse.reason);
            return { escalate: true, reason: parsedResponse.reason };
          }
        } catch (jsonError) {
          // Not a JSON escalation response, proceed as simple text
        }
      }

      const messageContent = brainResponseContent || "I'm sorry, I couldn't process that request.";

      // Create a conversation object for simple response
      const conversationId = `simple-${Date.now()}`;
      const conversation = new Conversation(conversationId, this.id, this.coreEngineClient, true, [ // `isSimple` is true
          { sender: 'user', type: 'text', content: prompt, timestamp: new Date() },
          { sender: 'assistant', type: 'text', content: messageContent, timestamp: new Date() }
      ]);
      
      const chatSession: ChatSession = {
        conversationId,
        conversation,
        context: {},
        history: [
            { sender: 'user', type: 'text', content: prompt, timestamp: new Date() },
            { sender: 'assistant', type: 'text', content: messageContent, timestamp: new Date() }
        ],
        frontendClientId: frontendClientId,
        userId: context?.userId,
        agentClass: context?.agentClass || this.agentClass,
        instanceId: context?.instanceId
      };
      this.activeSessions.set(conversationId, chatSession);
      
      return conversation;

    } catch (error) {
      console.error('[Simple Response] Error getting response from Brain:', error);
      throw new Error("Failed to get a simple response from the Brain service.");
    }
  }

  /**
   * Starts a new conversation thread with the assistant.
   * This will initiate a new mission/plan in the Core Engine for complex tasks,
   * or get a direct response for simple queries.
   * @param initialPrompt The user's initial message to start the conversation.
   * @returns A new Conversation instance.
   */
  public async startConversation(
    initialPrompt: string,
    frontendClientId: string | string[] = `client-${Date.now()}`,
    context?: {
      userId?: string;
      agentClass?: string;
      instanceId?: string;
      missionContext?: string;
    }
  ): Promise<Conversation> {
    // Normalize frontendClientId to always be a string
    const normalizedClientId = this.normalizeClientId(frontendClientId);
    const response = await this.getSimpleResponse(initialPrompt, normalizedClientId, context);

    if ('escalate' in response && response.escalate) {
        console.log(`[Triage] Brain indicated escalation: ${response.reason}. Starting agentic workflow.`);
        const toolManifest = Array.from(this.tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }));

        const conversationId = await this.coreEngineClient.startMission(
          initialPrompt,
          this.id,
          toolManifest,
          normalizedClientId,
          {
            userId: context?.userId,
            agentClass: context?.agentClass || this.agentClass,
            instanceId: context?.instanceId,
            missionContext: context?.missionContext
          }
        );
        
        const conversation = new Conversation(conversationId, this.id, this.coreEngineClient);
        
        // Create and store chat session
        const chatSession: ChatSession = {
          conversationId,
          conversation,
          context: {},
          history: [],
          frontendClientId: normalizedClientId,
          userId: context?.userId,
          agentClass: context?.agentClass || this.agentClass,
          instanceId: context?.instanceId
        };
        
        this.activeSessions.set(conversationId, chatSession);
        
        // Set up event listeners for context preservation
        this.setupConversationListeners(conversationId, conversation);
        
        return conversation;
    } else {
        
        // If the Brain provided a simple response, create a simple conversation locally
        const conversation = response as Conversation;
        
        const chatSession: ChatSession = {
            conversationId: conversation.id,
            conversation,
            context: {},
            history: conversation.getMutableMessages(), // Now correctly initialized from the Conversation object with a mutable reference
            frontendClientId: normalizedClientId,
            userId: context?.userId,
            agentClass: context?.agentClass || this.agentClass,
            instanceId: context?.instanceId
        };
        this.activeSessions.set(conversation.id, chatSession);
        this.setupConversationListeners(conversation.id, conversation);

        // Explicitly send initial messages to the client
        // The conversation object's initialMessages already contains the user prompt and assistant's first response.
        // We need to send these to the client.
        const initialMessages = conversation.getMutableMessages();
        if (initialMessages.length >= 2) { // Expecting user message and assistant's first response
          await this.sendMessageToClient(conversation.id, initialMessages[0]); // User's message
          await this.sendMessageToClient(conversation.id, initialMessages[1]); // Assistant's response
        }
        
        return conversation;
    }
  }

  /**
   * Sets up event listeners for a conversation to maintain context and history
   * @param conversationId The ID of the conversation
   * @param conversation The Conversation instance
   */
  private setupConversationListeners(conversationId: string, conversation: Conversation): void {
    const session = this.activeSessions.get(conversationId);
    if (!session) return;
    
    // Listen for messages to update history
    // No longer pushing to session.history here as session.history is a mutable reference to conversation.messages,
    // and conversation.addAndEmitMessage already pushes to conversation.messages.
    // This listener still serves to react to messages for other purposes if needed.
    conversation.on('message', (event: ConversationEvent, data: ConversationMessage) => {
      // The message is already in session.history because it's a mutable reference.
      // This block can be used for side effects like event interpretation.
      const candidateEvent = this.tryParseEventFromMessage(data.content, conversationId, session.frontendClientId, data.sender === 'assistant' ? 'brain' : 'user');
      if (candidateEvent) {
        void this.handleEvent(conversationId, candidateEvent, session.frontendClientId);
      }
    });
    
    // Listen for tool calls and outputs
    conversation.on('tool_call', (event: ConversationEvent, data: any) => { // data for tool_call is 'any' as no specific interface is defined in types.ts
      if (data) {
        session.history.push({
          sender: 'tool',
          type: 'tool_call',
          content: data,
          timestamp: new Date()
        });
      }
    });
    
    conversation.on('tool_output', (event: ConversationEvent, data: any) => { // data for tool_output is 'any' as no specific interface is defined in types.ts
      if (data) {
        session.history.push({
          sender: 'tool',
          type: 'tool_output',
          content: data,
          timestamp: new Date()
        });
      }
    });
    
    // Clean up when conversation ends
    conversation.on('end', () => {
      this.activeSessions.delete(conversationId);
    });
  }

  /**
   * Gets an active conversation by ID
   * @param conversationId The ID of the conversation to retrieve
   * @returns The Conversation instance if found, otherwise undefined
   */
  public getConversation(conversationId: string): Conversation | undefined {
    const session = this.activeSessions.get(conversationId);
    return session?.conversation;
  }

  /**
   * Gets the chat history for a specific conversation
   * @param conversationId The ID of the conversation
   * @returns Array of conversation messages
   */
  public async getConversationHistory(conversationId: string): Promise<ConversationMessage[]> {
    const session = this.activeSessions.get(conversationId);
    if (!session) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // For simple, ephemeral conversations, return the locally stored history
    if (session.conversation.isSimple) {
        return session.history;
    }
    
    // For agentic conversations, ensure history is up-to-date from Core Engine
    const fullHistory = await this.coreEngineClient.getMissionHistory(conversationId);
    return fullHistory;
  }

  /**
   * Gets the context for a specific conversation
   * @param conversationId The ID of the conversation
   * @returns The conversation context
   */
  public async getConversationContext(conversationId: string): Promise<any> {
    const session = this.activeSessions.get(conversationId);
    if (!session) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    return session.context;
  }

  /**
   * Updates the context for a specific conversation
   * @param conversationId The ID of the conversation
   * @param newContext The new context to merge with existing context
   */
  public async updateConversationContext(conversationId: string, newContext: any): Promise<void> {
    const session = this.activeSessions.get(conversationId);
    if (!session) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    session.context = { ...session.context, ...newContext };
  }

  /**
   * Gets the global context for the assistant
   * @returns The global context object
   */
  public async getGlobalContext(): Promise<any> {
    return this.globalContext;
  }

  /**
   * Updates the global context for the assistant
   * @param newContext The new context to merge with existing global context
   */
  public async updateGlobalContext(newContext: any): Promise<void> {
    this.globalContext = { ...this.globalContext, ...newContext };
  }

  /**
   * Sends a message to an existing conversation with context-aware processing
   * @param conversationId The ID of the conversation
   * @param message The message to send
   * @param contextOverride Optional context override for this message
   */
  public async sendMessageToConversation(
    conversationId: string,
    message: string,
    contextOverride?: any
  ): Promise<void> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    
    // Get current context and merge with override
    const session = this.activeSessions.get(conversationId);
    const context = contextOverride ?
      { ...session?.context, ...contextOverride } :
      session?.context;
    
    // Build enhanced message with both conversation history and context for the Brain
    const enhancedMessage = await this.buildEnhancedMessageWithHistory(conversationId, message, context);

    const candidateEvent = this.tryParseEventFromMessage(message, conversationId, session?.frontendClientId, 'user');
    if (candidateEvent) {
      await this.handleEvent(conversationId, candidateEvent, session?.frontendClientId);
    }

    if (conversation.isSimple) {
        // For simple conversations, process the message locally using the Brain
        try {
            // Add user's message to the local conversation history and emit it
            conversation.addAndEmitMessage({ sender: 'user', type: 'text', content: message, timestamp: new Date() });
            
            const authenticatedAxios = this.getAuthenticatedAxios();
            const brainResponse = await authenticatedAxios.post(`${this.brainUrl}/generate`, {
                prompt: enhancedMessage,
                raw: true,
            });
            // --- NEW DIAGNOSTIC LOGGING ---
            console.log('[Assistant::sendMessageToConversation] Raw Axios BrainResponse Status:', brainResponse.status);
            console.log('[Assistant::sendMessageToConversation] Raw Axios BrainResponse Data:', JSON.stringify(brainResponse.data, null, 2));
            console.log('[Assistant::sendMessageToConversation] Extracted brainResponse.data?.result:', brainResponse.data?.result);
            // --- END NEW DIAGNOSTIC LOGGING ---

            const brainResponseContent = brainResponse.data?.result;
            const messageContent = brainResponseContent || "I'm sorry, I couldn't process that request.";

            // Extract and process any data blocks from the Brain's response
            await this.extractAndProcessDataFromResponse(conversationId, messageContent, session?.frontendClientId);

            // Add Brain's response to the local conversation history and emit it
            conversation.addAndEmitMessage({ sender: 'assistant', type: 'text', content: messageContent, timestamp: new Date() });
            
            // Explicitly send the assistant's response to the client
            await this.sendMessageToClient(conversationId, { sender: 'assistant', type: 'text', content: messageContent, timestamp: new Date() });

        } catch (error) {
            console.error('[Assistant] Error processing simple conversation message locally:', error);
            const errorMessage = "I'm sorry, I encountered an error trying to respond.";
            conversation.addAndEmitMessage({ sender: 'assistant', type: 'text', content: errorMessage, timestamp: new Date() });
        }
    } else {
        // For agentic missions, send message to MissionControl
        await conversation.sendMessage(enhancedMessage);
    }
  }

  /**
   * Extracts structured data from Brain response and automatically creates domain events
   * Looks for [DATA_BLOCK_START]...[DATA_BLOCK_END] markers in the response
   * @param conversationId The conversation ID
   * @param responseContent The Brain's response text
   * @param clientId Optional client ID for the event
   */
  private async extractAndProcessDataFromResponse(conversationId: string, responseContent: string, clientId?: string): Promise<void> {
    try {
      // Pattern to match [DATA_BLOCK_START]...json...[DATA_BLOCK_END]
      const dataBlockPattern = /\[DATA_BLOCK_START\]([\s\S]*?)\[DATA_BLOCK_END\]/g;
      const matches = responseContent.matchAll(dataBlockPattern);

      for (const match of matches) {
        try {
          const jsonStr = match[1].trim();
          const data = JSON.parse(jsonStr);
          
          console.log('[extractAndProcessDataFromResponse] Found data block:', data);

          // Map data type to domain event type
          if (data.type) {
            const eventType = `domain.${data.type}.create`;
            const event: AssistantEvent = {
              type: eventType,
              payload: data,
              entityId: data.id || data.name,
              schemaVersion: '1.0',
              source: 'brain'
            };

            console.log('[extractAndProcessDataFromResponse] Creating domain event:', event);
            await this.handleEvent(conversationId, event, clientId);
          }
        } catch (parseError) {
          console.warn('[extractAndProcessDataFromResponse] Failed to parse data block:', match[1], parseError);
        }
      }
    } catch (error) {
      console.warn('[extractAndProcessDataFromResponse] Error extracting data from response:', error);
      // Don't fail the conversation on extraction errors - just log and continue
    }
  }

  private async getLibrarianClient(): Promise<LibrarianClient> {
    if (this.librarianClient) return this.librarianClient;
    const baseUrl = this.normalizeUrl(await this.getServiceUrl('Librarian'));
    if (!baseUrl) {
      throw new Error('Librarian service URL not available');
    }
    this.librarianUrl = baseUrl;
    this.librarianClient = new LibrarianClient(
      () => this.getAuthenticatedAxios(),
      async () => this.librarianUrl || (await this.getServiceUrl('Librarian')) || ''
    );
    return this.librarianClient;
  }

  private normalizeEvent(event: AssistantEvent, conversationId: string, clientId?: string): AssistantEvent {
    return {
      conversationId,
      clientId,
      source: event.source || 'ui',
      timestamp: event.timestamp || new Date().toISOString(),
      ...event
    };
  }

  private deriveCollectionFromEvent(eventType: string, fallback: string): string {
    const parts = eventType.split('.');
    if (parts.length >= 3 && parts[0] === 'domain') {
      return parts[1];
    }
    if (parts.length >= 2 && parts[0] === 'state') {
      return parts[1];
    }
    return fallback;
  }

  private deriveOperationFromEvent(event: AssistantEvent): 'create' | 'update' | 'delete' | 'upsert' {
    if (event.operation) return event.operation;
    const parts = event.type.split('.');
    const maybeOp = parts[parts.length - 1];
    if (['create', 'update', 'delete', 'upsert'].includes(maybeOp)) {
      return maybeOp as 'create' | 'update' | 'delete' | 'upsert';
    }
    return 'upsert';
  }

  private tryParseEventFromMessage(message: string | object, conversationId: string, clientId?: string, source?: 'ui' | 'user' | 'brain' | 'system'): AssistantEvent | null {
    if (!message) return null;
    const candidate = typeof message === 'string' ? message.trim() : message;

    let obj: any = null;
    if (typeof candidate === 'string') {
      if (!candidate.startsWith('{') && !candidate.startsWith('[')) return null;
      try {
        obj = JSON.parse(candidate);
      } catch {
        return null;
      }
    } else if (typeof candidate === 'object') {
      obj = candidate;
    }

    if (!obj) return null;

    const eventType = obj.type || obj.eventType || obj.name;
    if (!eventType || !obj.payload) return null;

    return this.normalizeEvent({
      type: eventType,
      payload: obj.payload,
      collection: obj.collection,
      operation: obj.operation,
      entityId: obj.entityId,
      schemaVersion: obj.schemaVersion,
      source: source || obj.source
    }, conversationId, clientId);
  }

  public async handleEvent(conversationId: string, event: AssistantEvent, frontendClientId?: string): Promise<{ delta: AssistantStateDelta; record?: any }> {
    const normalized = this.normalizeEvent(event, conversationId, frontendClientId);
    const collection = normalized.collection || this.deriveCollectionFromEvent(normalized.type, 'events');
    const operation = this.deriveOperationFromEvent(normalized);
    const storageCollection = `assistant_${this.id}_${collection}`;
    const session = this.activeSessions.get(conversationId);

    const librarian = await this.getLibrarianClient();

    if (operation === 'delete') {
      const entityId = normalized.entityId || normalized.payload?.id || normalized.payload?._id;
      if (!entityId) {
        throw new Error('delete operation requires entityId or payload.id');
      }
      await librarian.deleteData(storageCollection, entityId);
      const delta: AssistantStateDelta = {
        type: 'state.delta',
        conversationId,
        collection,
        operation,
        entityId,
        timestamp: new Date().toISOString()
      };
      await this.emitStateDelta(conversationId, delta);
      return { delta };
    }

    const entityId = normalized.entityId || normalized.payload?.id || normalized.payload?._id || randomUUID();
    const now = new Date().toISOString();
    const record = {
      ...normalized.payload,
      id: entityId,
      conversationId,
      userId: session?.userId,
      agentClass: session?.agentClass || this.agentClass,
      instanceId: session?.instanceId,
      updatedAt: now,
      createdAt: normalized.payload?.createdAt || now
    };

    await librarian.storeData({
      id: entityId,
      collection: storageCollection,
      storageType: 'mongo',
      data: record
    });

    const delta: AssistantStateDelta = {
      type: 'state.delta',
      conversationId,
      collection,
      operation,
      data: record,
      entityId,
      timestamp: now
    };

    await this.emitStateDelta(conversationId, delta);
    return { delta, record };
  }

  public async getState(conversationId: string, collection: string, query: any = {}): Promise<any> {
    const librarian = await this.getLibrarianClient();
    const storageCollection = `assistant_${this.id}_${collection}`;
    const session = this.activeSessions.get(conversationId);
    const fullQuery = {
      conversationId,
      userId: session?.userId,
      agentClass: session?.agentClass || this.agentClass,
      instanceId: session?.instanceId,
      ...query
    };
    try {
      const response = await librarian.queryData(storageCollection, fullQuery, 'mongo');
      return response.data;
    } catch (error: any) {
      // If the collection doesn't exist or there's no data, return empty array
      if (error?.response?.status === 404 || error?.message?.includes('not found')) {
        return [];
      }
      throw error;
    }
  }

  private async emitStateDelta(conversationId: string, delta: AssistantStateDelta): Promise<void> {
    const session = this.activeSessions.get(conversationId);
    if (!session || !session.frontendClientId) {
      return;
    }
    const content = {
      delta,
      conversationId,
      clientId: session.frontendClientId
    };
    await this.sendMessage('assistant_state', 'PostOffice', content, false, 'user');
  }

  /**
   * Enhances a message with contextual information for better L3 processing
   * @param message The original message
   * @param context The context to include
   * @returns The enhanced message with context
   */
  private enhanceMessageWithContext(message: string, context?: any): string {
    if (!context || Object.keys(context).length === 0) {
      return message;
    }
    
    // Format context as a structured prompt for the LLM
    const contextString = Object.entries(context)
      .map(([key, value]) => `Context: ${key} = ${JSON.stringify(value)}`)
      .join('\n');
    
    return `${contextString}\n\nUser Message: ${message}`;
  }

  /**
   * Builds an enhanced message that includes conversation history and context
   * This ensures the Brain maintains full conversation context
   * @param conversationId The ID of the conversation
   * @param message The current message
   * @param context The context to include
   * @returns The enhanced message with full conversation history
   */
  private async buildEnhancedMessageWithHistory(conversationId: string, message: string, context?: any): Promise<string> {
    const session = this.activeSessions.get(conversationId);
    
    // Get conversation history
    let historyText = '';
    if (session?.conversation?.isSimple && session?.history && session.history.length > 0) {
      // Format previous messages as conversation history for context
      const recentHistory = session.history.slice(-10); // Keep last 10 messages to avoid token limits
      historyText = recentHistory
        .map((msg: any) => {
          const sender = msg.sender === 'user' ? 'User' : 'Assistant';
          return `${sender}: ${msg.content}`;
        })
        .join('\n');
    }

    // Build the enhanced prompt with system instructions
    let enhancedMessage = '';

    // Add system instructions for data extraction
    enhancedMessage += `[SYSTEM INSTRUCTIONS]
  You are a helpful assistant engaged in a conversation. As you respond to user messages:

  1. REMEMBER CONTEXT: You have access to the full conversation history below. Use it to maintain context and provide coherent responses.
  2. EXTRACT STRUCTURED DATA: When users mention specific entities, ALWAYS extract them into data blocks. Supported types include: character, story, plotPoint, dialogue, scriptInsight, formatting, collaboration, timelineEvent.
  3. DATA FORMAT: For any extracted data, include it in your response in structured JSON blocks marked with [DATA_BLOCK_START] and [DATA_BLOCK_END]. You may include multiple blocks in one response. Example:
     [DATA_BLOCK_START]
     {"type":"character","name":"Avery","description":"Ambitious playwright","id":"char-avery"}
     [DATA_BLOCK_END]
     [DATA_BLOCK_START]
     {"type":"plotPoint","sequenceNumber":1,"description":"Inciting incident at the gala"}
     [DATA_BLOCK_END]
  4. MAINTAIN STATE: Reference previous messages to show you understand the ongoing conversation.
  5. ONLY OMIT DATA BLOCKS IF NOTHING STRUCTURED WAS MENTIONED.

  [END SYSTEM INSTRUCTIONS]\n\n`;

    // Add context if present
    if (context && Object.keys(context).length > 0) {
      const contextString = Object.entries(context)
        .map(([key, value]) => `[${key}]: ${JSON.stringify(value)}`)
        .join('\n');
      enhancedMessage += `Context:\n${contextString}\n\n`;
    }

    // Add conversation history if present
    if (historyText) {
      enhancedMessage += `Conversation History:\n${historyText}\n\n`;
    }

    // Add the current message
    enhancedMessage += `Current User Message: ${message}`;

    console.log('[buildEnhancedMessageWithHistory] Enhanced message for Brain:', {
      hasHistory: historyText.length > 0,
      hasContext: context && Object.keys(context).length > 0,
      historyLength: session?.history?.length || 0,
      messagePreview: enhancedMessage.substring(0, 200)
    });

    return enhancedMessage;
  }

  /**
   * Ends a conversation and cleans up resources
   * @param conversationId The ID of the conversation to end
   */
  public async endConversation(conversationId: string): Promise<void> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    
    await conversation.end();
    this.activeSessions.delete(conversationId);
  }

  /**
   * Gets all active conversation sessions
   * @returns Map of conversation IDs to ChatSession objects
   */
  public getActiveSessions(): Map<string, ChatSession> {
    return new Map(this.activeSessions);
  }

  /**
   * Registers a tool with the assistant, making it available for use by the underlying LLM.
   * @param tool The Tool instance to register.
   */
  public registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool with name '${tool.name}' already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieves a registered tool by its name.
   * @param toolName The name of the tool.
   * @returns The Tool instance if found, otherwise undefined.
   */
  public getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Retrieves the assistant's context from the Core Engine.
   */
  public async getContext(): Promise<any> {
    return this.coreEngineClient.getContext(this.id);
  }

  /**
   * Updates the assistant's context in the Core Engine.
   * @param newContext The new context object.
   */
  public async updateContext(newContext: any): Promise<void> {
    return this.coreEngineClient.updateContext(this.id, newContext);
  }

  /**
   * Gets the core engine client used by this assistant.
   * @returns The ICoreEngineClient instance
   */
  public getCoreEngineClient(): ICoreEngineClient {
    return this.coreEngineClient;
  }

  /**
   * Simplified version of startConversation without Brain integration.
   */
  public async startConversationSimple(
    initialPrompt: string,
    context?: {
      userId?: string;
      agentClass?: string;
      instanceId?: string;
      missionContext?: string;
    }
  ): Promise<Conversation> {
    const toolManifest = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const missionId = await this.coreEngineClient.startMission(
      initialPrompt,
      this.id,
      toolManifest,
      '', // Placeholder for frontendClientId
      {
        userId: context?.userId,
        agentClass: context?.agentClass || this.agentClass,
        instanceId: context?.instanceId,
        missionContext: context?.missionContext
      }
    );

    const conversation = new Conversation(missionId, this.id, this.coreEngineClient);
    return conversation;
  }

  private async sendMessageToClient(conversationId: string, message: ConversationMessage): Promise<void> {
    try {
      const session = this.activeSessions.get(conversationId);
      if (!session || !session.frontendClientId) {
        console.error(`[Assistant] Missing session or frontendClientId for conversation ${conversationId}. Cannot send message to client.`);
        return;
      }
      const clientRecipientId = session.frontendClientId; // Use the stored frontendClientId

      // Extract message text for display - frontend expects 'message' property inside content
      const messageText = typeof message.content === 'string' 
        ? message.content 
        : (message.content as any)?.message || (message.content as any)?.text || JSON.stringify(message.content);

      // Construct the content payload - ONLY data, no metadata (type/sender/timestamp added by sendMessage)
      // Final structure: { type: 'say', content: { message: "...", clientId: "..." }, sender: 'assistant-id', visibility: 'user' }
      const content = {
        message: messageText, // Frontend extracts content.message for display
        persistent: true,
        clientId: clientRecipientId // CRITICAL: PostOffice uses this to route to specific client
      };

      // Route to PostOffice, which will forward to the specific client via WebSocket
      // Using recipient='PostOffice' ensures the message reaches PostOffice's queue
      // PostOffice's handleQueueMessage will then route based on clientId
      // sendMessage() will wrap 'content' in a message envelope with type, sender, recipient, visibility
      await this.sendMessage(
        'say', // Message type
        'PostOffice', // Route to PostOffice's queue (not directly to client)
        content, // Content object (not a full message envelope)
        false, // requiresSync
        'user' // visibility - CRITICAL: must be 'user' for frontend to display
      );
      console.log(`[Assistant] Sent message to PostOffice for client ${clientRecipientId} in conversation ${conversationId}:`, message);
    } catch (error) {
      console.error(`[Assistant] Failed to send message to client for conversation ${conversationId}:`, error);
    }
  }
}
