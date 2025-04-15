import express from 'express';
import * as authController from '../controllers/authController';

const router = express.Router();

// Define routes
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/refresh-token', authController.refreshToken);
router.post('/verify-token', authController.verifyToken);
router.post('/verify-email', authController.verifyEmail);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', authController.logout);

export const authRoutes = router;
export default router;


