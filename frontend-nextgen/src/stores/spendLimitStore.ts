import { create } from 'zustand';
import { parseSpendLimitRefusal, type SpendLimitRefusal } from '../utils/spendLimits';

interface SpendLimitState {
  /** Present while the current period's cap has refused a completion. */
  refusal: SpendLimitRefusal | null;
  /** Records a refusal only when the thrown error is the 429 contract. */
  recordRefusalFromError: (err: unknown) => void;
  clearRefusal: () => void;
}

/**
 * Tracks whether the user's LLM spending limit has paused activity. The flag
 * is set from any brain-completion call that fails with the 429
 * `SPEND_LIMIT_REACHED` payload and cleared by the next successful
 * completion (after rollover), so the notice survives navigation.
 */
export const useSpendLimitStore = create<SpendLimitState>((set) => ({
  refusal: null,
  recordRefusalFromError: (err) => {
    const refusal = parseSpendLimitRefusal(err);
    if (refusal) set({ refusal });
  },
  clearRefusal: () => set({ refusal: null }),
}));
