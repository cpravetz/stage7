import { BrainService } from '../services/BrainService';

let brainPromise: Promise<BrainService> | null = null;

export async function getBrainInstance(): Promise<BrainService> {
  if (!brainPromise) {
    brainPromise = (async () => {
      const brain = new BrainService();
      await brain.initialize();
      return brain;
    })();
  }
  return brainPromise;
}

// For backward compatibility - returns uninitialized instance synchronously
export const brainInstance = new BrainService();