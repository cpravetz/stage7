import { Router } from 'express';
import { ArtifactsService } from '../services/ArtifactsService';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { z } from 'zod';

const router: Router = Router();
const service = new ArtifactsService();

const CreateDocumentSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  collection: z.string(),
  data: z.record(z.unknown()),
});

const UpdateDocumentSchema = z.object({
  data: z.record(z.unknown()).optional(),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = CreateDocumentSchema.parse(req.body);
  const doc = await service.createDocument({
    ...parsed,
    id: parsed.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  });
  res.status(201).json(doc);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const doc = await service.getDocument(req.params.id as string);
  if (!doc) {
    throw NextGenError.notFound('Document not found');
  }
  res.json(doc);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const parsed = UpdateDocumentSchema.parse(req.body);
  const doc = await service.updateDocument(req.params.id as string, parsed);
  if (!doc) {
    throw NextGenError.notFound('Document not found');
  }
  res.json(doc);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const existed = await service.deleteDocument(req.params.id as string);
  if (!existed) {
    throw NextGenError.notFound('Document not found');
  }
  res.status(204).send();
}));

router.post('/search', asyncHandler(async (req, res) => {
  const result = await service.queryDocuments(req.body);
  res.json(result);
}));

export default router;
