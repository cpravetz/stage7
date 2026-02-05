import {
  ICoreEngineClient,
  ConversationEvent,
  ConversationMessage,
  SdkError,
  JsonSchema,
  MissionDetails,
} from './types';
import { MessageType } from '@cktmcs/shared';
import { EventEmitter } from 'events';

/**
 * Production HttpCoreEngineClient for L2 SDK to communicate with L1 Core Engine.
 * This client makes actual HTTP requests to MissionControl and establishes WebSocket
 * connections for real-time event streaming.
 */
export class HttpCoreEngineClient extends EventEmitter implements ICoreEngineClient {
  private eventListeners: Map<string, Map<ConversationEvent, ((event: ConversationEvent, data: any) => void)[]>>; // missionId -> eventType -> handlers
  private baseUrl: string;
  private tokenProvider?: () => Promise<string | undefined>;
  private webSockets: Map<string, WebSocket>; // missionId -> WebSocket connection
  private missionAgentMap: Map<string, string>; // missionId -> primaryAgentId

  constructor(baseUrl: string, tokenProvider?: () => Promise<string | undefined>) {
    super();
    this.baseUrl = baseUrl;
    this.tokenProvider = tokenProvider;
    this.eventListeners = new Map();
    this.webSockets = new Map();
    this.missionAgentMap = new Map();
    console.log(`[HttpCoreEngineClient] Initialized with base URL: ${baseUrl}`);
  }

  /**
   * Gets authentication headers for HTTP requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.tokenProvider) {
      const token = await this.tokenProvider();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  /**
   * Starts a new mission in L1 Core Engine.
   * Creates a mission via MissionControl's CREATE_MISSION message type.
   * @param initialGoal The initial goal for the mission.
   * @param assistantId The ID of the assistant starting the mission.
   * @param toolManifest A list of tools the assistant can use, with their schemas.
   * @returns A promise resolving with the generated missionId (conversationId).
   */
  public async startMission(
    initialGoal: string,
    assistantId: string,
    toolManifest: { name: string; description: string; inputSchema: JsonSchema }[],
    frontendClientId: string,
    context?: {
      userId?: string;
      agentClass?: string;
      instanceId?: string;
      missionContext?: string;
    }
  ): Promise<string> {
    console.log(
      `[HttpCoreEngineClient] Starting mission: Assistant ${assistantId} with goal "${initialGoal}" and ${toolManifest.length} tools.`
    );

    try {
      // Call PostOffice's /createMission endpoint to create a new mission
      const response = await fetch(`${this.baseUrl}/createMission`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({
          goal: initialGoal,
          clientId: frontendClientId, // Use the provided frontendClientId
          isAssistant: true,
          userId: context?.userId,
          agentClass: context?.agentClass,
          instanceId: context?.instanceId,
          missionContext: context?.missionContext
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[HttpCoreEngineClient] MissionControl responded with error: ${response.status} ${errorText}`);
        throw new SdkError(`Failed to start mission: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[HttpCoreEngineClient] Raw response from MissionControl:', response);
      console.log('[HttpCoreEngineClient] Parsed JSON result from MissionControl:', result);
      const missionId = result.result?.missionId || result.missionId;

      if (!missionId) {
        throw new SdkError('Mission created but no missionId returned');
      }

      console.log(`[HttpCoreEngineClient] Mission started with ID: ${missionId}`);

      // Establish WebSocket connection for real-time events
      await this.connectMissionWebSocket(missionId);

      return missionId;
    } catch (error) {
      console.error('[HttpCoreEngineClient] Error starting mission:', error);
      throw new SdkError(`Failed to start mission: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sends a message to an ongoing mission in L1.
   * @param missionId The ID of the mission (conversationId).
   * @param message The message content.
   */
  public async sendMessageToMission(missionId: string, message: string): Promise<void> {
    console.log(`[HttpCoreEngineClient] Sending message to mission ${missionId}: "${message}"`);

    try {
      const response = await fetch(`${this.baseUrl}/message`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({
          type: MessageType.USER_MESSAGE,
          sender: 'SDK',
          recipient: 'MissionControl',
          content: {
            missionId: missionId,
            message: message,
          },
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new SdkError(`Failed to send message: ${response.status} ${errorText}`);
      }

      console.log(`[HttpCoreEngineClient] Message sent successfully to mission ${missionId}`);
    } catch (error) {
      console.error('[HttpCoreEngineClient] Error sending message:', error);
      throw new SdkError(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Submits human input for a pending step in L1.
   * @param missionId The ID of the mission.
   * @param requestId The ID of the human input request.
   * @param response The human's response.
   */
  public async submitHumanInputToMission(
    missionId: string,
    requestId: string,
    response: string
  ): Promise<void> {
    console.log(
      `[HttpCoreEngineClient] Submitting human input for mission ${missionId}, request ${requestId}: "${response}"`
    );

    try {
      const httpResponse = await fetch(`${this.baseUrl}/userInputResponse`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({
          requestId: requestId,
          response: response,
        }),
      });

      if (!httpResponse.ok) {
        const errorText = await httpResponse.text();
        throw new SdkError(`Failed to submit human input: ${httpResponse.status} ${errorText}`);
      }

      console.log(`[HttpCoreEngineClient] Human input submitted successfully for request ${requestId}`);
    } catch (error) {
      console.error('[HttpCoreEngineClient] Error submitting human input:', error);
      throw new SdkError(`Failed to submit human input: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieves conversation history from L1.
   * Note: L1 doesn't currently expose a dedicated history endpoint.
   * This is a placeholder that returns empty array. History should be tracked
   * by listening to WebSocket events.
   * @param missionId The ID of the mission.
   * @returns A promise resolving with the list of messages.
   */
  public async getMissionHistory(missionId: string): Promise<ConversationMessage[]> {
    console.log(`[HttpCoreEngineClient] Getting mission history for ${missionId}`);
    // TODO: Implement when L1 provides a history endpoint
    // For now, SDK consumers should track messages via WebSocket events
    console.warn('[HttpCoreEngineClient] getMissionHistory not yet implemented in L1. Track messages via WebSocket events.');
    return [];
  }

  /**
   * Retrieves mission details from L1.
   * Note: L1 doesn't currently expose a dedicated mission details endpoint.
   * This is a placeholder implementation.
   * @param missionId The ID of the mission.
   * @returns A promise resolving with the mission details.
   */
  public async getMissionDetails(missionId: string): Promise<MissionDetails> {
    console.log(`[HttpCoreEngineClient] Getting mission details for ${missionId}`);
    // TODO: Implement when L1 provides a mission details endpoint
    console.warn('[HttpCoreEngineClient] getMissionDetails not yet implemented in L1.');
    return {
      id: missionId,
      name: `Mission ${missionId}`,
      status: 'active',
      startDate: new Date().toISOString(),
      targetDate: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  /**
   * Executes a tool in L1 via HTTP POST request to AgentSet.
   * @param missionId The ID of the mission.
   * @param toolName The name of the tool to execute.
   * @param args The arguments for the tool execution.
   * @returns A promise resolving with the tool execution result.
   */
  public async executeTool(missionId: string, toolName: string, args: any): Promise<any> {
    const endpoint = `/missions/${missionId}/execute-tool`;
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`[L1 Client] Executing tool ${toolName} for mission ${missionId}`);
    
    try {
      // Prepare the request payload
      const requestPayload = {
        toolName,
        args,
        timestamp: new Date().toISOString()
      };
      
      // Make HTTP POST request to AgentSet tool execution endpoint
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...await this.getAuthHeaders()
        },
        body: JSON.stringify(requestPayload)
      });
      
      // Handle different HTTP status codes
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `HTTP error! status: ${response.status}`;
        
        console.error(`[L1 Client] Tool execution failed: ${errorMessage}`);
        
        // Emit error event
        this.emitMissionEvent(missionId, 'error', {
          sender: 'tool',
          type: 'tool_error',
          content: {
            toolName,
            error: errorMessage,
            timestamp: new Date(),
          },
        });
        
        throw new SdkError(errorMessage, response.status.toString());
      }
      
      // Parse the successful response
      const result = await response.json();
      
      console.log(`[L1 Client] Tool execution successful: ${toolName}`);
      
      // Emit tool output event
      this.emitMissionEvent(missionId, 'tool_output', {
        sender: 'tool',
        type: 'tool_output',
        content: {
          toolName,
          result: result.result,
          success: true,
          timestamp: new Date(),
        },
      });
      
      return {
        success: true,
        result: result.result,
        toolName,
      };
      
    } catch (error) {
      console.error(`[L1 Client] Network error executing tool ${toolName}:`, error);
      
      // Emit error event
      this.emitMissionEvent(missionId, 'error', {
        sender: 'tool',
        type: 'network_error',
        content: {
          toolName,
          error: error instanceof Error ? error.message : 'Unknown network error',
          timestamp: new Date(),
        },
      });
      
      throw new SdkError(
        `Failed to execute tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Establishes WebSocket connection to PostOffice for real-time mission events.
   * @param missionId The ID of the mission to connect to.
   */
  private async connectMissionWebSocket(missionId: string): Promise<void> {
    // Extract base URL components
    const url = new URL(this.baseUrl);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const postOfficeWsUrl = `${wsProtocol}//${url.hostname}:5020`; // PostOffice default port

    const clientId = `sdk-mission-${missionId}`;
    const wsUrl = `${postOfficeWsUrl}?clientId=${clientId}`;

    console.log(`[HttpCoreEngineClient] Connecting WebSocket for mission ${missionId} at ${wsUrl}`);

    try {
      // Check if WebSocket is available (Node.js vs Browser)
      const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : require('ws');

      const ws = new WebSocketImpl(wsUrl);

      ws.onopen = () => {
        console.log(`[HttpCoreEngineClient] WebSocket connected for mission ${missionId}`);

        // Send CLIENT_CONNECT message
        ws.send(JSON.stringify({
          type: 'CLIENT_CONNECT',
          clientId: clientId,
        }));

        // Associate this client with the mission
        ws.send(JSON.stringify({
          type: 'RECONNECT_MISSION',
          content: {
            missionId: missionId,
          },
        }));
      };

      ws.onmessage = (event: any) => {
        try {
          const message = JSON.parse(event.data.toString());
          this.handleWebSocketMessage(missionId, message);
        } catch (error) {
          console.error('[HttpCoreEngineClient] Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error: any) => {
        console.error(`[HttpCoreEngineClient] WebSocket error for mission ${missionId}:`, error);
        this.emitMissionEvent(missionId, 'error', {
          message: 'WebSocket connection error',
          error: error,
        });
      };

      ws.onclose = () => {
        console.log(`[HttpCoreEngineClient] WebSocket closed for mission ${missionId}`);
        this.webSockets.delete(missionId);
      };

      this.webSockets.set(missionId, ws);
    } catch (error) {
      console.error(`[HttpCoreEngineClient] Failed to establish WebSocket connection:`, error);
      throw new SdkError(`Failed to connect WebSocket: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles incoming WebSocket messages and emits appropriate events.
   * @param missionId The mission ID this message is for.
   * @param message The WebSocket message.
   */
  private handleWebSocketMessage(missionId: string, message: any): void {
    console.log(`[HttpCoreEngineClient] WebSocket message for mission ${missionId}:`, message.type);

    switch (message.type) {
      case 'STATUS_UPDATE':
        this.emitMissionEvent(missionId, 'message', {
          sender: 'system',
          type: 'text',
          content: message.data?.message || 'Status update',
          timestamp: new Date(),
          metadata: message.data,
        });
        break;

      case 'ANSWER':
      case 'AGENT_MESSAGE':
        this.emitMissionEvent(missionId, 'message', {
          sender: 'assistant',
          type: 'text',
          content: message.content?.message || message.content || '',
          timestamp: new Date(),
          metadata: message,
        });
        break;

      case 'USER_INPUT_REQUEST':
        this.emitMissionEvent(missionId, 'human_input_required', {
          requestId: message.request_id,
          type: message.answerType || 'text',
          prompt: message.question,
          metadata: {
            choices: message.choices,
            missionId: message.missionId,
          },
        });
        break;

      case 'PLUGIN_RESULT':
        this.emitMissionEvent(missionId, 'tool_output', {
          sender: 'tool',
          type: 'tool_output',
          content: message.content,
          timestamp: new Date(),
          metadata: message,
        });
        break;

      case 'PLUGIN_ERROR':
        this.emitMissionEvent(missionId, 'error', {
          message: message.content?.error || 'Plugin execution error',
          metadata: message,
        });
        break;

      case 'STATISTICS':
        // Emit statistics as metadata, not as a conversation message
        this.emitMissionEvent(missionId, 'message', {
          sender: 'system',
          type: 'text',
          content: '',
          timestamp: new Date(),
          metadata: { type: 'statistics', data: message.content },
        });
        break;

      case 'CONNECTION_CONFIRMED':
        console.log(`[HttpCoreEngineClient] Connection confirmed for mission ${missionId}`);
        break;

        case 'log':
          // Handle log messages
          this.emit(`${missionId}:log`, message.data);
          break;
        case 'say':
          // Handle conversational responses
          this.emit(`${missionId}:message`, { sender: 'assistant', type: 'text', content: message.content.message });
          break;
        default:
          console.log(`[HttpCoreEngineClient] Unhandled message type: ${message.type}`);
          // Fallback if message type is not explicitly handled
    }
  }

  /**
   * Requests human input from L1 (e.g., for HumanInTheLoop methods).
   * This triggers an L1 event that the UI listens for via WebSocket.
   * Note: This is typically initiated by L1 agents, not by the SDK directly.
   * @param missionId The ID of the mission.
   * @param inputType The type of input requested (e.g., 'ask', 'getApproval').
   * @param prompt The prompt to display to the user.
   * @param metadata Any additional metadata for the UI (e.g., options for select).
   * @returns A promise resolving with the request ID that is now waiting for human input.
   */
  public async requestHumanInput(
    missionId: string,
    inputType: string,
    prompt: string,
    metadata?: any
  ): Promise<string> {
    console.log(
      `[HttpCoreEngineClient] Requesting human input for ${missionId}. Type: ${inputType}, Prompt: "${prompt}"`
    );

    // TODO: Implement actual L1 API call when endpoint is available
    // For now, this is a placeholder that generates a request ID
    const requestId = `human-input-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    console.warn('[HttpCoreEngineClient] requestHumanInput not yet fully implemented in L1.');

    return requestId;
  }

  /**
   * Registers an event listener for real-time mission events from L1.
   * In a real system, this would involve WebSockets or long-polling.
   * @param missionId The ID of the mission to listen for events.
   * @param handler The callback function for events.
   * @returns An unsubscribe function.
   */
  public onMissionEvent(
    missionId: string,
    handler: (event: ConversationEvent, data: any) => void
  ): () => void {
    if (!this.eventListeners.has(missionId)) {
      this.eventListeners.set(missionId, new Map());
    }
    const missionHandlers = this.eventListeners.get(missionId)!;
    if (!missionHandlers.has('message')) { // Assuming 'message' is a common event for now
        missionHandlers.set('message', []);
    }
    missionHandlers.get('message')!.push(handler as any); // Type assertion for now

    // For other event types, would need to handle them similarly
    missionHandlers.set('human_input_required', [...(missionHandlers.get('human_input_required') || []), handler as any]);
    missionHandlers.set('end', [...(missionHandlers.get('end') || []), handler as any]);
    missionHandlers.set('error', [...(missionHandlers.get('error') || []), handler as any]);


    console.log(`[L1 Client] Registered event listener for mission ${missionId}.`);

    return () => {
      const handlers = this.eventListeners.get(missionId);
      if (handlers) {
        handlers.forEach((eventHandlers, eventType) => {
          handlers.set(eventType, eventHandlers.filter(h => h !== handler));
        });
      }
      console.log(`[L1 Client] Unsubscribed event listener for mission ${missionId}.`);
    };
  }

  // Helper to emit events to registered listeners
  private emitMissionEvent(missionId: string, event: ConversationEvent, data: any): void {
    const missionHandlers = this.eventListeners.get(missionId);
    if (missionHandlers) {
      const handlers = missionHandlers.get(event);
      if (handlers) {
        handlers.forEach(handler => handler(event, data)); // Pass both event and data
      }
    }
  }

  /**
   * Retrieves context for an assistant from L1.
   * Note: L1 doesn't currently expose a context endpoint.
   * @param assistantId The ID of the assistant.
   * @returns A promise resolving with the assistant's context.
   */
  public async getContext(assistantId: string): Promise<any> {
    console.log(`[HttpCoreEngineClient] Getting context for assistant ${assistantId}`);
    // TODO: Implement when L1 provides a context endpoint
    console.warn('[HttpCoreEngineClient] getContext not yet implemented in L1.');
    return {
      assistantId,
      context: {},
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Updates context for an assistant in L1.
   * Note: L1 doesn't currently expose a context update endpoint.
   * @param assistantId The ID of the assistant.
   * @param newContext The new context to store.
   */
  public async updateContext(assistantId: string, newContext: any): Promise<void> {
    console.log(`[HttpCoreEngineClient] Updating context for assistant ${assistantId}`);
    // TODO: Implement when L1 provides a context update endpoint
    console.warn('[HttpCoreEngineClient] updateContext not yet implemented in L1.');
  }

  /**
   * Ends a mission in L1.
   * @param missionId The ID of the mission to end.
   */
  public async endMission(missionId: string): Promise<void> {
    console.log(`[HttpCoreEngineClient] Ending mission ${missionId}`);

    try {
      // Close WebSocket connection
      const ws = this.webSockets.get(missionId);
      if (ws) {
        ws.close();
        this.webSockets.delete(missionId);
      }

      // Send ABORT message to MissionControl
      const response = await fetch(`${this.baseUrl}/message`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({
          type: 'ABORT',
          sender: 'SDK',
          recipient: 'MissionControl',
          content: {
            missionId: missionId,
          },
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.warn(`[HttpCoreEngineClient] Failed to end mission: ${response.status}`);
      }

      // Emit mission end event
      this.emitMissionEvent(missionId, 'end', {
        sender: 'system',
        type: 'mission_end',
        content: `Mission ${missionId} ended`,
        timestamp: new Date(),
      });

      // Clean up event listeners
      this.eventListeners.delete(missionId);
      this.missionAgentMap.delete(missionId);

      console.log(`[HttpCoreEngineClient] Mission ${missionId} ended successfully`);
    } catch (error) {
      console.error('[HttpCoreEngineClient] Error ending mission:', error);
      throw new SdkError(`Failed to end mission: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
