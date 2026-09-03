import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { VaultError } from '../utils/errors';
import { EnvelopeEncryption } from '../encryption/envelopeEncryption';

const router: Router = Router();
const encryption = new EnvelopeEncryption();

router.post('/encrypt', asyncHandler(async (req, res) => {
  const { plaintext } = req.body;
  if (!plaintext || typeof plaintext !== 'string') {
    throw VaultError.badRequest('Missing or invalid plaintext');
  }
  const encrypted = encryption.encrypt(plaintext);
  res.status(200).json(encrypted);
}));
