import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@stage7-nextgen/shared';
import { getBrainInstance } from '../utils/sharedInstance';

const router: Router = Router();

const EmbeddingsSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(64),
});

/**
 * Embeds texts through the provider router. The response is always 200: an
 * `available: false` body (no embedding model configured, provider failure)
 * is a degradation signal callers act on, not an error to retry — so no
 * caller has to special-case HTTP failure codes to keep working.
 */
router.post('/', asyncHandler(async (req, res) => {
  const { texts } = EmbeddingsSchema.parse(req.body);
  const brain = await getBrainInstance();

  const candidate = await brain.embeddingCandidate();
  if (!candidate) {
    res.json({ available: false, reason: 'no embedding model configured' });
    return;
  }

  try {
    const result = await candidate.provider.embed!({ model: candidate.modelId, texts });
    res.json({
      available: true,
      model: result.model,
      dim: result.vectors[0]?.length ?? 0,
      vectors: result.vectors,
    });
  } catch (err) {
    res.json({
      available: false,
      reason: `embedding provider failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}));

export default router;
