import express from 'express';
import passport from 'passport';
import { getProfile, updateProfile } from '../controllers/userController';

const router = express.Router();

router.get('/profile', passport.authenticate('jwt', { session: false }), getProfile);
router.put('/profile', passport.authenticate('jwt', { session: false }), updateProfile);

export const userRoutes = router;