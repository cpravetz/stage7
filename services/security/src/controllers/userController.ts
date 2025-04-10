import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { updateUser, findUserById, findUserByEmail } from '../services/userService';
import { AuthorizationService } from '../services/AuthorizationService';
import { analyzeError } from '@cktmcs/errorhandler';

// Initialize services
const authorizationService = new AuthorizationService();

/**
 * Get current user profile
 */
export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Get user ID from token
        const userId = req.user.sub || (req.user as any).id;

        // Get user from repository
        const user = await findUserById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Return user info (excluding sensitive data)
        res.status(200).json({
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles || [user.role], // Support both formats
            isEmailVerified: user.isEmailVerified,
            mfaEnabled: user.mfaEnabled,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin,
            preferences: user.preferences
        });
    } catch (error) {
        analyzeError(error as Error);
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Error retrieving user profile' });
    }
};

/**
 * Update current user profile
 */
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Get user ID from token
        const userId = req.user.sub || (req.user as any).id;

        // Get user from repository
        const user = await findUserById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get updatable fields
        const { firstName, lastName, username, preferences } = req.body;

        // Update user
        const updatedUser = await updateUser(userId, {
            firstName: firstName !== undefined ? firstName : user.firstName,
            lastName: lastName !== undefined ? lastName : user.lastName,
            username: username !== undefined ? username : user.username,
            preferences: preferences !== undefined ? { ...user.preferences, ...preferences } : user.preferences,
            updatedAt: new Date()
        });

        // Return updated user info
        res.status(200).json({
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            roles: updatedUser.roles || [updatedUser.role], // Support both formats
            isEmailVerified: updatedUser.isEmailVerified,
            mfaEnabled: updatedUser.mfaEnabled,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
            lastLogin: updatedUser.lastLogin,
            preferences: updatedUser.preferences
        });
    } catch (error) {
        analyzeError(error as Error);
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Error updating user profile' });
    }
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Get user ID from params
        const userId = req.params.id;

        // Check if user has permission to view other users
        const hasPermission = await authorizationService.hasPermission(
            req.user.sub || (req.user as any).id,
            'users:read',
            { userId }
        );

        // If user is trying to view their own profile, allow it
        const isOwnProfile = (req.user.sub || (req.user as any).id) === userId;
        if (!hasPermission && !isOwnProfile) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        // Get user from repository
        const user = await findUserById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Return user info (excluding sensitive data)
        res.status(200).json({
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles || [user.role], // Support both formats
            isEmailVerified: user.isEmailVerified,
            mfaEnabled: user.mfaEnabled,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin
        });
    } catch (error) {
        analyzeError(error as Error);
        console.error('Get user by ID error:', error);
        res.status(500).json({ message: 'Error retrieving user information' });
    }
};

/**
 * Get all users
 */
export const getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Check if user has permission to view all users
        const hasPermission = await authorizationService.hasPermission(
            req.user.sub || (req.user as any).id,
            'users:read'
        );

        if (!hasPermission) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        // Get pagination parameters
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        // Get users from repository (placeholder - implement in actual service)
        // This is a placeholder - implement actual user retrieval
        const users: User[] = [];
        const total = 0;

        // Return users info (excluding sensitive data)
        res.status(200).json({
            users: users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: user.roles || [user.role], // Support both formats
                isEmailVerified: user.isEmailVerified,
                mfaEnabled: user.mfaEnabled,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        analyzeError(error as Error);
        console.error('Get all users error:', error);
        res.status(500).json({ message: 'Error retrieving users' });
    }
};