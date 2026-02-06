// services/mcsreact/src/pm-assistant/PmAssistantClient.ts
import { ConversationMessage } from '@cktmcs/sdk'; // Using types from SDK

interface StartConversationResponse {
  conversationId: string;
}

interface ApiError {
  message: string;
  code?: string;
}

export class PmAssistantClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private eventHandlers = new Map<string, Set<Function>>();

  constructor(baseUrl: string, wsUrl: string) {
    this.baseUrl = baseUrl;
    this.wsUrl = wsUrl;
  }

  private async request<T>(method: string, path: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || 'API request failed');
    }
    return response.json();
  }

  public async startConversation(initialPrompt: string): Promise<string> {
    const { conversationId } = await this.request<StartConversationResponse>(
      'POST',
      '/conversations',
      { initialPrompt }
    );
    this.connectWebSocket(conversationId);
    return conversationId;
  }

  public async sendMessage(conversationId: string, message: string): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/messages`, { message });
  }

  public async submitHumanInput(conversationId: string, response: string, inputStepId: string): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/input`, { response, inputStepId });
  }

  public async getHistory(conversationId: string): Promise<ConversationMessage[]> {
    return this.request<ConversationMessage[]>('GET', `/conversations/${conversationId}/history`);
  }

  public async endConversation(conversationId: string): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    await this.request<void>('DELETE', `/conversations/${conversationId}`);
  }

  public async getSuggestedActions(conversationId: string): Promise<{
    actions: Array<{
      id: string;
      title: string;
      description: string;
      type: string;
    }>;
  }> {
    return this.request<{
      actions: Array<{
        id: string;
        title: string;
        description: string;
        type: string;
      }>;
    }>('GET', `/conversations/${conversationId}/suggested-actions`);
  }

  public async getContext(conversationId: string): Promise<{
    contextItems: Array<{
      id: string;
      type: 'file' | 'ticket' | 'document' | 'meeting';
      title: string;
      preview: string;
      link: string;
      timestamp: string;
    }>;
    mission?: {
      id: string;
      name: string;
      status: string;
      startDate: string;
      targetDate: string;
    };
  }> {
    return this.request<{
      contextItems: Array<{
        id: string;
        type: 'file' | 'ticket' | 'document' | 'meeting';
        title: string;
        preview: string;
        link: string;
        timestamp: string;
      }>;
      mission?: {
        id: string;
        name: string;
        status: string;
        startDate: string;
        targetDate: string;
      };
    }>('GET', `/conversations/${conversationId}/context`);
  }

  public async triggerAction(conversationId: string, actionId: string, params?: any): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/actions`, { actionId, params });
  }

  private connectWebSocket(conversationId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(); // Close existing connection if any
    }
    this.ws = new WebSocket(`${this.wsUrl}/${conversationId}/events`);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      this.emit(data.event, data.data);
    };

    this.ws.onopen = () => {
      console.log(`WebSocket connected for conversation ${conversationId}`);
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
    return () => this.eventHandlers.get(event)?.delete(handler); // Unsubscribe function
  }

  private emit(event: string, data: any) {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }
}

export interface WebSocketEvents {
  'message': ConversationMessage;
  'human_input_required': {
    prompt: string;
    type: 'ask' | 'boolean' | 'select';
    metadata?: any;
    stepId: string;
  };
  'error': any;
  'end': any;
  'connected': any;
  'disconnected': any;
  'suggested_actions': {
    actions: Array<{
      id: string;
      title: string;
      description: string;
      type: string;
    }>;
    conversationId: string;
  };
  'context_update': {
    contextItems: Array<{
      id: string;
      type: 'file' | 'ticket' | 'document';
      title: string;
      preview: string;
      link: string;
      timestamp: string;
    }>;
    mission?: {
      id: string;
      name: string;
      status: string;
      startDate: string;
      targetDate: string;
    };
  };
}

// Example usage:
// const client = new PmAssistantClient('http://localhost:3000/api/pm-assistant', 'ws://localhost:3000/ws/pm-assistant/conversations');
// client.on('message', (msg) => console.log('New message:', msg));
// client.on('human_input_required', (prompt) => console.log('Human input needed:', prompt));
