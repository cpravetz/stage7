import express from 'express';
import {
    login,
    register,
    logout,
    refreshToken,
    verifyToken,
    verifyMfaToken,
    requestPasswordReset,
    resetPassword,
    changePassword,
    enableMfa,
    verifyMfaSetup,
    disableMfa
} from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';
import { TokenService } from '../services/TokenService';
import { createRateLimiter } from '../middleware/securityMiddleware';

// Initialize services
const tokenService = new TokenService();

const router = express.Router();

// Create rate limiters
const standardLimiter = createRateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const loginLimiter = createRateLimiter(15 * 60 * 1000, 10); // 10 login attempts per 15 minutes
const passwordResetLimiter = createRateLimiter(60 * 60 * 1000, 5); // 5 password reset requests per hour

// Public routes
router.post('/register', standardLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh-token', standardLimiter, refreshToken);
router.post('/verify', standardLimiter, verifyToken);
router.post('/verify-mfa', standardLimiter, verifyMfaToken);
router.post('/request-password-reset', passwordResetLimiter, requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Protected routes (require authentication)
router.post('/logout', authenticate(tokenService), logout);
router.post('/change-password', authenticate(tokenService), standardLimiter, changePassword);
router.post('/enable-mfa', authenticate(tokenService), standardLimiter, enableMfa);
router.post('/verify-mfa-setup', authenticate(tokenService), standardLimiter, verifyMfaSetup);
router.post('/disable-mfa', authenticate(tokenService), standardLimiter, disableMfa);

export const authRoutes = router;