import { ContextWindowConfig, ContextChunk, DEFAULT_CONTEXT_WINDOW_CONFIG } from '../types/context';

export class ContextManager {
  private config: ContextWindowConfig;

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_WINDOW_CONFIG, ...config };
  }

  countTokens(text: string): number {
    const words = text.split(/\s+/).filter(Boolean);
    return Math.ceil(words.length / 0.75);
  }

  fitInWindow(chunks: ContextChunk[]): ContextChunk[] {
    const available = this.config.maxTokens - this.config.reserveTokens;
    let used = 0;
    const selected: ContextChunk[] = [];
    const sorted = [...chunks].sort((a, b) => b.priority - a.priority);

    for (const chunk of sorted) {
      if (used + chunk.tokens > available) {
        break;
      }
      used += chunk.tokens;
      selected.push(chunk);
    }

    return selected.sort((a, b) => a.id.localeCompare(b.id));
  }
}
