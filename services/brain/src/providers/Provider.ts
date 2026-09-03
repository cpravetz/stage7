export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
  raw?: unknown;
}

export interface ProviderInfo {
  id: string;
  name: string;
  apiBase: string;
  hasApiKey: boolean;
  openAICompatible: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly info: ProviderInfo;
  isAvailable(): boolean;
  listModels(): Promise<Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }>>;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
