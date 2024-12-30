import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import bcrypt from 'bcrypt';
import { createUser, findUserByEmail, findUserById } from '../services/userService';
import { User } from '../models/User';
import {v4 as uuidv4} from 'uuid';

const SECRET_KEY = process.env.JWT_SECRET || uuidv4();

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { email, password } = req.body;
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await createUser({ email, password: hashedPassword });
        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '365d' });
        res.status(201).json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user' });
    }
};

export const login = (req: Request, res: Response, next: NextFunction): void => {
    
    const secret = process.env.JWT_SECRET;

    if (!req.body || typeof req.body !== 'object') {
        console.log('Request body is not an object:', req.body);
        res.status(400).json({ message: 'Invalid request body' });
        return;
    }

    if (!req.body.email || !req.body.password) {
        console.log('Missing email or password in request body');
        res.status(400).json({ message: 'Missing email or password' });
        return;
    }

    const user = req.user as User;
    if (!user) {
        console.log('User not authenticated');
        res.status(401).json({ message: 'Authentication failed' });
        return;
    }
    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '365d' });
    console.log('Login successful for user:', user.email);
    res.json({ token, user: { id: user.id, email: user.email } });
};

export const logout = (req: Request, res: Response) => {
    // In a stateless JWT setup, logout is typically handled client-side
    res.status(200).json({ message: 'Logout successful' });
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('jwt', { session: false }, async (err: Error, user: User | false, info: any) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.status(401).json({ message: 'Invalid refresh token', info });
        }

        try {
            // Verify the user still exists and is active
            const currentUser = await findUserById(user.id);
            if (!currentUser) {
                return res.status(401).json({ message: 'User no longer exists' });
            }

            // Generate a new access token
            const newToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: '365d' });

            res.json({ 
                message: 'Token refreshed successfully',
                token: newToken,
                // refreshToken: newRefreshToken, // If you decide to issue a new refresh token
                user: { id: user.id, email: user.email }
            });
        } catch (error) {
            next(error);
        }
    })(req, res, next);
};


export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.log('No Authorization header provided');
        res.status(401).json({ valid: false, message: 'No Authorization header provided' });
        return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        console.log('No token provided in Authorization header');
        res.status(401).json({ valid: false, message: 'No token provided in Authorization header' });
        return;
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY) as any;
        // Attach the user information to the request object
        (req as any).user = { id: decoded.id || decoded.iat };
        
        res.status(200).json({ valid: true, user: decoded });
    } catch (error) {
        console.error('Token verification failed:', error);
        if (error instanceof jwt.JsonWebTokenError) {
            res.status(401).json({ valid: false, message: 'Invalid token: ' + error.message });
            return;
        } else if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ valid: false, message: 'Token expired' });
            return ;
        } else {
            res.status(401).json({ valid: false, message: 'Token verification failed: ' + (error instanceof Error ? error.message : String(error)) });
            return ;
        }
    }
};