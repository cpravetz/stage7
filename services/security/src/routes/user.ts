import express from 'express';
import * as userController from '../controllers/userController';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Try to load the public key for RS256 verification
let PUBLIC_KEY: string;
let isUsingAsymmetricKeys = false;

try {
  PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../../keys/public.pem'), 'utf8');
  isUsingAsymmetricKeys = true;
  console.log('Loaded RSA public key for JWT verification in user routes');
} catch (error) {
  console.error('Failed to load RSA public key for user routes:', error);
  console.warn('Using fallback secret key for JWT verification in user routes');
  PUBLIC_KEY = process.env.JWT_SECRET || 'your-secret-key';
}

// Authentication middleware that actually verifies the token
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    let decoded;

    if (isUsingAsymmetricKeys) {
      try {
        // First try to verify with RS256
        decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
      } catch (rsaError) {
        // If that fails, try with the legacy HS256 method
        console.log('RS256 verification failed, trying legacy HS256 verification');
        const legacySecret = process.env.JWT_SECRET || 'your-secret-key';
        decoded = jwt.verify(token, legacySecret);
      }
    } else {
      // Verify the token using the JWT_SECRET from environment
      decoded = jwt.verify(token, PUBLIC_KEY);
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Apply authentication to all routes
router.use(requireAuth);

// User routes
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
//router.delete('/account', userController.deleteAccount || ((req, res) => res.status(501).json({ message: 'Not implemented' })));
router.get('/:id', userController.getUserById);
router.get('/', userController.getAllUsers);

export const userRoutes = router;
export default router;
