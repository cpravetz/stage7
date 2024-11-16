import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import bcrypt from 'bcrypt';
import { createUser, findUserByEmail, findUserById } from '../services/userService';
import { User } from '../models/User';


export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        console.log('Registering user:', req.body);
        const { email, password } = req.body;
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await createUser({ email, password: hashedPassword });
        console.log('Registerd User registered successfully:', user);
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
        res.status(201).json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user' });
    }
};

export const login = (req: Request, res: Response, next: NextFunction): void => {
    console.log('Login request received');
    console.log('Login Body:', JSON.stringify(req.body, null, 2));

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
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
    console.log('Login successful for user:', user.email);
    res.json({ token, user: { id: user.id, email: user.email } });
};

export const logout = (req: Request, res: Response) => {
    console.log('Logging out user:');

    // In a stateless JWT setup, logout is typically handled client-side
    res.json({ message: 'Logout successful' });
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    console.log('Refreshing token:', req.body);
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
            const newToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

            // Optionally, you could also generate a new refresh token here
            // const newRefreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '7d' });

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
    console.log('Verifying token');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    
    const token = req.headers.authorization?.split(' ')[1] || req.body.token;
    
    if (!token) {
        console.log('No token provided to verufyToken');
        res.status(401).json({ message: 'No token provided' });
        return;
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        console.log('Token verified successfully');
        res.json({ valid: true, user: decoded });
    } catch (error) {
        console.error('Token verification failed:', error);
        res.status(401).json({ valid: false, message: 'Invalid token' });
    }
};