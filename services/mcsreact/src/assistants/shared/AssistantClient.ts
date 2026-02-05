// Generic Assistant Client that can be used by all assistants
import { ConversationMessage } from '@cktmcs/sdk';
import { API_BASE_URL, WS_URL } from '../../config'; // <-- ADD THIS IMPORT

interface StartConversationResponse {
  conversationId: string;
}

interface ApiError {
  message: string;
  code?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AssistantClient {
  private assistantApiBaseUrl: string; // Renamed for clarity
  private assistantWsUrl: string; // Renamed for clarity
  private postOfficeBaseUrl: string; // New: Base URL for PostOffice
  private ws: WebSocket | null = null;
  private eventHandlers = new Map<string, Set<Function>>();
  private readonly tokenKey = 'auth_tokens';

  constructor(assistantApiBaseUrl: string, assistantWsUrl: string) {
    console.log("AssistantClient - Build Version: 54321"); // New log
    this.assistantApiBaseUrl = assistantApiBaseUrl;
    this.assistantWsUrl = assistantWsUrl;
    // PostOffice is always at the root of API_BASE_URL (http://localhost:5020)
    this.postOfficeBaseUrl = API_BASE_URL; // Initialize PostOffice base URL
  }

  protected get apiBaseUrl(): string {
    return this.assistantApiBaseUrl;
  }

  private getTokens(): AuthTokens | null {
    const tokensJson = localStorage.getItem(this.tokenKey);

    if (!tokensJson) {
      console.error(`[AssistantClient] No auth tokens found in localStorage (key: '${this.tokenKey}'). User may not be logged in.`);
      console.error(`[AssistantClient] Available localStorage keys:`, Object.keys(localStorage));
      return null;
    }

    try {
      const tokens = JSON.parse(tokensJson);
      if (!tokens.accessToken) {
        console.error('[AssistantClient] Tokens found but accessToken is missing');
      }
      return tokens;
    } catch (e) {
      console.error('[AssistantClient] Failed to parse stored tokens:', e);
      return null;
    }
  }

  async request<T>(method: string, path: string, data?: any): Promise<T> {
    const tokens = this.getTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Determine the correct base URL based on the path
    // PostOffice endpoints should use the PostOffice base URL
    const postOfficeEndpoints = ['/message', '/submitUserInput', '/createMission', '/loadMission'];
    const isPostOfficeEndpoint = postOfficeEndpoints.some(endpoint => path.startsWith(endpoint));
    const baseUrl = isPostOfficeEndpoint ? this.postOfficeBaseUrl : this.assistantApiBaseUrl;

    const fullUrl = `${baseUrl}${path}`;
    
    // Log routing decision for debugging
    console.log(`[AssistantClient] Routing ${method} ${path} -> ${isPostOfficeEndpoint ? 'PostOffice' : 'Assistant'} endpoint: ${fullUrl}`);

    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
      console.log(`[AssistantClient] ✓ Adding auth token to ${method} ${fullUrl}`);
    } else {
      console.error(`[AssistantClient] ✗ NO AUTH TOKEN for ${method} ${fullUrl}`);
      console.error(`[AssistantClient] localStorage key '${this.tokenKey}':`, localStorage.getItem(this.tokenKey));
      console.error(`[AssistantClient] All localStorage keys:`, Object.keys(localStorage));
    }

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({ message: response.statusText }));
      console.error(`[AssistantClient] Request failed: ${method} ${fullUrl}`);
      console.error(`[AssistantClient] Status: ${response.status} ${response.statusText}`);
      console.error(`[AssistantClient] Error data:`, errorData);
      console.error(`[AssistantClient] Request headers:`, headers);
      throw new Error(errorData.message || `API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  public async startConversation(initialPrompt: string, clientId: string): Promise<string> {
    const tokens = this.getTokens();
    if (!tokens?.accessToken) {
      throw new Error('No authentication token available to start conversation.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.accessToken}`,
    };

    // Route through AssistantAPI's /conversations endpoint for Brain triage
    // The AssistantAPI will determine if the message is simple (direct Brain response)
    // or complex (escalate to MissionControl/Agent)
    console.log(`[AssistantClient] Calling AssistantAPI /conversations for Brain triage`);

    const response = await fetch(`${this.assistantApiBaseUrl}/conversations`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        initialPrompt: initialPrompt,
        clientId: clientId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to start conversation via AssistantAPI: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('[AssistantClient] Raw response from AssistantAPI /conversations:', result);

    // The AssistantAPI returns a Conversation object with an 'id' property
    const conversationId = result.id || result.conversationId || result.missionId;

    if (!conversationId) {
      throw new Error('Conversation started but no conversationId returned');
    }

    // WebSocket connection is managed centrally by WebSocketContext.
    // Avoid opening a second WebSocket with the same clientId (it overrides the main connection).
    return conversationId;
  }

  public async sendMessage(conversationId: string, message: string, clientId: string): Promise<void> {
    // Route through AssistantAPI's /conversations/:id/messages endpoint
    // The AssistantAPI will handle Brain triage for follow-up messages:
    // - Simple messages get direct Brain response
    // - Complex messages are forwarded to MissionControl/Agents
    const tokens = this.getTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    console.log(`[AssistantClient] Sending message to AssistantAPI /conversations/${conversationId}/messages`);
    
    const response = await fetch(`${this.assistantApiBaseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        message: message,
        clientId: clientId
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send message via AssistantAPI: ${response.status} ${errorText}`);
    }
  }

  public async sendEvent(conversationId: string, event: any, clientId: string): Promise<any> {
    const tokens = this.getTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    const url = `${this.assistantApiBaseUrl}/conversations/${conversationId}/events`;
    console.log('[AssistantClient] sendEvent - URL:', url);
    console.log('[AssistantClient] sendEvent - Event:', event);
    console.log('[AssistantClient] sendEvent - ClientId:', clientId);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, clientId })
    });

    console.log('[AssistantClient] sendEvent - Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AssistantClient] sendEvent - Error:', errorText);
      throw new Error(`Failed to send event via AssistantAPI: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('[AssistantClient] sendEvent - Result:', result);
    return result;
  }

  public async getState(conversationId: string, collection: string, query?: any): Promise<any> {
    const tokens = this.getTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    const queryParam = query ? `&query=${encodeURIComponent(JSON.stringify(query))}` : '';
    const response = await fetch(`${this.assistantApiBaseUrl}/conversations/${conversationId}/state?collection=${encodeURIComponent(collection)}${queryParam}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get state via AssistantAPI: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  public async submitHumanInput(conversationId: string, response: string, inputStepId: string, clientId: string): Promise<void> {
    // This should also go to PostOffice
    await this.request<void>('POST', `/submitUserInput`, { // Target PostOffice /submitUserInput
      requestId: inputStepId, // The PostOffice endpoint expects requestId
      response: response,
      conversationId: conversationId, // Pass conversationId as context
      clientId: clientId // Pass clientId for routing if needed
    });
  }

  public async getHistory(conversationId: string): Promise<ConversationMessage[]> {
    // This should go to MissionControl (via PostOffice)
    const response = await this.request<any>('GET', `/missions/${conversationId}/history`); // Assuming MissionControl has this endpoint
    return response.history || [];
  }

  public async endConversation(conversationId: string, clientId: string): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // This should go to PostOffice to route to MissionControl
    await this.request<void>('POST', `/message`, { // Target PostOffice /message endpoint
        type: "ABORT", // MessageType.ABORT
        sender: 'user', // Or appropriate sender
        recipient: 'MissionControl',
        content: {
            missionId: conversationId,
            action: 'abort', // Control action
        },
        clientId: clientId // Pass clientId
    });
  }

  // ... (getSuggestedActions, getContext, triggerAction methods remain the same, but their URLs might need review later) ...

  private connectWebSocket(conversationId: string, clientId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    const tokens = this.getTokens();
    // WebSocket connection should be to PostOffice, not assistant-specific WS endpoint
    // PostOffice's WS endpoint is at WS_URL (ws://localhost:5020)
    let wsUrl = `${WS_URL}?clientId=${clientId}&conversationId=${conversationId}`; // Pass conversationId
    if (tokens?.accessToken) {
      wsUrl += `&token=${encodeURIComponent(tokens.accessToken)}`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      this.emit(data.event, data.data);
    };

    this.ws.onopen = () => {
      console.log(`WebSocket connected to PostOffice for conversation ${conversationId}`); // Log update
      this.emit('connected', { conversationId });
    };

    this.ws.onclose = () => {
      console.log(`WebSocket disconnected for conversation ${conversationId}`);
      this.emit('disconnected', { conversationId });
    };

    this.ws.onerror = (error) => {
      console.error(`WebSocket error for conversation ${conversationId}:`, error);
      this.emit('error', { conversationId, error });
    };
  }

  public on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: any) {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }
}

