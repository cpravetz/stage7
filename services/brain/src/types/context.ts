export interface ContextWindowConfig {
  maxTokens: number;
  reserveTokens: number;
  overlapTokens: number;
}

export interface ContextChunk {
  id: string;
  content: string;
  tokens: number;
  priority: number;
}

export const DEFAULT_CONTEXT_WINDOW_CONFIG: ContextWindowConfig = {
  maxTokens: 8192,
  reserveTokens: 512,
  overlapTokens: 128,
};
