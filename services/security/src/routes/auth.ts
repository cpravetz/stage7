import express from 'express';
import passport from 'passport';
import { login, register, logout, refreshToken, verifyToken } from '../controllers/authController';
import { User } from '../models/User';

const router = express.Router();

router.post('/register', register);
router.post('/login', (req, res, next) => {
    console.log('Login request body:', req.body);
    passport.authenticate('local', { session: false }, (err: Error | null, user: User | false, info: { message: string }) => {
        if (err) {
            console.log('Error authenticating user in /login:', err);
            return next(err);
        }
        if (!user) {
            console.log('User not found in /login:', info);
            return res.status(401).json({ message: info.message || 'Authentication failed' });
        }
        req.user = user;
        return login(req, res, next);
    })(req, res, next);
});
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);
router.post('/verify', verifyToken);

export const authRoutes = router;