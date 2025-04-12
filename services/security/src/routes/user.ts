import express from 'express';
import * as userController from '../controllers/userController';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Authentication middleware that actually verifies the token
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify the token using the JWT_SECRET from environment
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);
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
