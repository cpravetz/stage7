import axios from 'axios';
import express, { Request, Response, NextFunction } from 'express';

const securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const response = await axios.get(`http://${securityManagerUrl}/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.valid) {
            (req as any).user = response.data.user;
            next();
        } else {
            res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) { 
        console.error('Error verifying token:', error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Failed to authenticate token' });
    }
};