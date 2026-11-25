export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  inputFormat?: string;
  outputFormat?: string;
}

export type ModelFormat = string | string[];

export interface ProviderModel {
  id: string;
  capabilities: string[];
  maxTokens: number;
  costPer1kTokens: number;
  inputFormat?: ModelFormat;
  outputFormat?: ModelFormat;
}

export interface CompletionResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
  raw?: unknown;
  reasoning?: string;
  thought?: string;
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
  listModels(): Promise<ProviderModel[]>;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  /**
   * Embeds texts, when the provider exposes an embeddings endpoint. Optional:
   * providers without embedding support simply leave it undefined, and callers
   * degrade to their non-semantic path.
   */
  embed?(req: EmbeddingRequest): Promise<EmbeddingResponse>;
}

export interface EmbeddingRequest {
  model: string;
  texts: string[];
}

export interface EmbeddingResponse {
  model: string;
  vectors: number[][];
}
