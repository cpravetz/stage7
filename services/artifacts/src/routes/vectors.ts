import { Router } from 'express';
import { artifactsService as service } from '../services/ArtifactsService';
import { MAX_VECTOR_DIM } from '../services/MongoStore';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { z } from 'zod';

const router: Router = Router();
router.use(asyncHandler(async (_req, _res, next) => {
  await service.ready();
  if (!service.isPersistenceAvailable()) {
    throw new NextGenError('Artifacts persistence is unavailable; refusing volatile storage', 503);
  }
  next();
}));

// Filter values are restricted to primitives: they are compared against
// document fields, and arbitrary nested objects have no meaning here while
// giving clients a free place to stash operator-shaped payloads.
const filterSchema = z.record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean()])).optional();

const UpsertVectorSchema = z.object({
  vector: z.array(z.number().finite()).min(1).max(MAX_VECTOR_DIM),
  model: z.string().max(128).optional(),
  dim: z.number().int().optional(),
  contentHash: z.string().max(256).optional(),
  collection: z.string().max(128).optional(),
  filter: filterSchema,
});

const SearchVectorsSchema = z.object({
  collection: z.string().max(128),
  query: z.array(z.number().finite()).min(1).max(MAX_VECTOR_DIM),
  model: z.string().max(128).optional(),
  limit: z.number().int().positive().max(100).optional(),
  filter: filterSchema,
  minScore: z.number().min(-1).max(1).optional(),
});

/** Stores or replaces a vector and its model/dim/contentHash metadata. */
router.put('/:id', asyncHandler(async (req, res) => {
  const { vector, ...meta } = UpsertVectorSchema.parse(req.body);
  await service.upsertVector(req.params.id as string, vector, meta);
  res.status(204).send();
}));

/** Cosine search over stored vectors; `model` mismatching vectors are excluded. */
router.post('/search', asyncHandler(async (req, res) => {
  const parsed = SearchVectorsSchema.parse(req.body);
  const results = await service.searchVectors(parsed);
  res.json({ results });
}));

/** A stored vector and its metadata, for content-hash skip decisions. */
router.get('/:id', asyncHandler(async (req, res) => {
  const vector = await service.getVector(req.params.id as string);
  if (!vector) {
    throw NextGenError.notFound('Vector not found');
  }
  res.json(vector);
}));

/** Removes a stored vector (e.g. cap eviction or knowledge deletion). */
router.delete('/:id', asyncHandler(async (req, res) => {
  const existed = await service.deleteVector(req.params.id as string);
  if (!existed) {
    throw NextGenError.notFound('Vector not found');
  }
  res.status(204).send();
}));

export default router;
