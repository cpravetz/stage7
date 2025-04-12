import express from 'express';
import * as authController from '../controllers/authController';

const router = express.Router();

// Define routes
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/refresh-token', authController.refreshToken);
router.post('/verify-email', authController.verifyToken);
router.post('/logout', authController.logout);

export const authRoutes = router;
export default router;


