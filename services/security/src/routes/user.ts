import express from 'express';
import {
    getProfile,
    updateProfile,
    getUserById,
    getAllUsers
} from '../controllers/userController';
import { authenticate } from '../middleware/authMiddleware';
import { TokenService } from '../services/TokenService';
import { createRateLimiter } from '../middleware/securityMiddleware';

// Initialize services
const tokenService = new TokenService();

// Create rate limiter
const standardLimiter = createRateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes

const router = express.Router();

// Profile routes
router.get('/profile', authenticate(tokenService), standardLimiter, getProfile);
router.put('/profile', authenticate(tokenService), standardLimiter, updateProfile);

// User management routes
router.get('/users', authenticate(tokenService), standardLimiter, getAllUsers);
router.get('/users/:id', authenticate(tokenService), standardLimiter, getUserById);

export const userRoutes = router;