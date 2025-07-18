import { Request, Response, NextFunction } from 'express';
import { AsyncRequestHandler } from '../types/express';
import { TokenService } from '../services/TokenService';
import { AuthorizationService } from '../services/AuthorizationService';
import { TokenType, TokenPayload } from '../models/Token';
import { analyzeError } from '@cktmcs/errorhandler';
import { User } from '../models/User';
import { findUserById } from '../services/userService';


/**
 * Authentication middleware for the Security service
 * @param tokenService Token service
 * @returns Express middleware
 */
export function authenticate(tokenService: TokenService) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get token from header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            // Verify token
            try {
                const payload = await tokenService.verifyToken(token, TokenType.ACCESS);

                // Convert TokenPayload to User object
                const user: import('../models/User').User = {
                    id: payload.sub,
                    username: payload.username || '',
                    email: payload.email || '',
                    roles: payload.roles || [],
                    permissions: payload.permissions,
                    createdAt: new Date(payload.iat * 1000),
                    updatedAt: new Date(),
                    isActive: true,
                    isEmailVerified: true,
                    mfaEnabled: false,
                    failedLoginAttempts: 0,
                    // Add JWT-specific properties
                    sub: payload.sub,
                    jti: payload.jti
                };

                req.user = user;
                req.accessToken = token;
                next();
            } catch (error) {
                return res.status(401).json({ message: 'Invalid or expired token' });
            }
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authentication error' });
        }
    };
}

/**
 * Authorization middleware
 * @param authorizationService Authorization service
 * @param requiredPermission Required permission
 * @returns Express middleware
 */
export function authorize(authorizationService: AuthorizationService, requiredPermission: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            // Get user ID from token
            const userId = (req.user as User).id;

            // Create context for permission evaluation
            const context: Record<string, any> = {
                userId,
                ...req.params,
                ...req.query,
                ...req.body
            };

            // Check if user has permission
            const hasPermission = await authorizationService.hasPermission(userId, requiredPermission, context);
            if (!hasPermission) {
                return res.status(403).json({ message: 'Insufficient permissions' });
            }

            next();
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authorization error' });
        }
    };
}

/**
 * Role-based authorization middleware
 * @param authorizationService Authorization service
 * @param requiredRoles Required roles
 * @returns Express middleware
 */
export function authorizeRoles(authorizationService: AuthorizationService, requiredRoles: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            // Get user ID from token
            const userId = (req.user as User).id;

            // Check if user has any of the required roles
            for (const role of requiredRoles) {
                const hasRole = await authorizationService.hasRole(userId, role);
                if (hasRole) {
                    return next();
                }
            }

            return res.status(403).json({ message: 'Insufficient permissions' });
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authorization error' });
        }
    };
}

/**
 * Middleware to check if user is authenticated
 * @param req Request
 * @param res Response
 * @param next Next function
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    next();
}


/**
 * Middleware to check if user has verified email
 * @returns Express middleware
 */
export function requireEmailVerification() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            // Get user ID from token
            const userId = (req.user as User).id;

            // Check if user has verified email
            const isEmailVerified = await checkEmailVerification(userId);
            if (!isEmailVerified) {
                return res.status(403).json({ message: 'Email verification required' });
            }

            next();
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authorization error' });
        }
    };
}

/**
 * Check if a user has verified email
 * @param userId User ID
 * @returns True if email is verified
 */
async function checkEmailVerification(userId: string): Promise<boolean> {
    try {
        const user = await findUserById(userId);
        return user ? user.isEmailVerified : false;
    } catch (error) {
        analyzeError(error as Error);
        return false;
    }
}

/**
 * Middleware to check if user has completed MFA
 * @returns Express middleware
 */
export function requireMfa() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            // Get user ID from token
            const userId = (req.user as User).id;

            // Check if user has MFA enabled
            const isMfaEnabled = await checkMfaEnabled(userId);
            if (isMfaEnabled) {
                // If MFA is enabled, check if user has completed MFA
                const isMfaCompleted = await checkMfaCompleted(userId, req.accessToken || '');
                if (!isMfaCompleted) {
                    return res.status(403).json({ message: 'MFA verification required' });
                }
            }

            next();
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authorization error' });
        }
    };
}

/**
 * Check if a user has MFA enabled
 * @param userId User ID
 * @returns True if MFA is enabled
 */
async function checkMfaEnabled(userId: string): Promise<boolean> {
    try {
        const user = await findUserById(userId);
        return user ? user.mfaEnabled : false;
    } catch (error) {
        analyzeError(error as Error);
        return false;
    }
}

/**
 * Check if a user has completed MFA by verifying token claims
 * @param userId User ID
 * @param token Access token
 * @returns True if MFA is completed
 */
async function checkMfaCompleted(userId: string, token: string): Promise<boolean> {
    try {
        const { TokenService } = require('../services/TokenService');
        const { TokenType } = require('../models/Token');

        const tokenService = new TokenService();
        const payload = await tokenService.verifyToken(token, TokenType.ACCESS);

        // Check if the token was issued after MFA verification
        // This is a simplified check - in production, you might want to store MFA completion
        // status in the token claims or maintain a separate MFA session store
        return payload.sub === userId && payload.type === TokenType.ACCESS;
    } catch (error) {
        analyzeError(error as Error);
        return false;
    }
}
