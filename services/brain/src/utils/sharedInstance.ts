import { BrainService } from '../services/BrainService';

let brainPromise: Promise<BrainService> | null = null;
const sharedBrain = new BrainService();

export async function getBrainInstance(): Promise<BrainService> {
  if (!brainPromise) {
    brainPromise = (async () => {
      await sharedBrain.initialize();
      return sharedBrain;
    })();
  }
  return brainPromise;
}

// Shared, initialized instance used by in-process consumers
export const brainInstance = sharedBrain;
void getBrainInstance();