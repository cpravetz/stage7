import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { EnvelopeEncryption } from './src/encryption/envelopeEncryption';

const router: Router = Router();
const encryption = new EnvelopeEncryption();

router.post('/encrypt', asyncHandler(async (req, res) => {
  const { plaintext } = req.body;
  if (!plaintext || typeof plaintext !== 'string') {
    throw NextGenError.badRequest('Missing or invalid plaintext');
  }
  const encrypted = encryption.encrypt(plaintext);
  res.status(200).json(encrypted);
}));
