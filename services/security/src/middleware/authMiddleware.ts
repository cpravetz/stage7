import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/TokenService';
import { AuthorizationService } from '../services/AuthorizationService';
import { TokenType, TokenPayload } from '../models/Token';
import { analyzeError } from '@cktmcs/errorhandler';

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
            accessToken?: string;
        }
    }
}

/**
 * Authentication middleware
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
                req.user = payload;
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
            const userId = req.user.sub;

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
            const userId = req.user.sub;

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
 * Middleware to check if user is the owner of a resource
 * @param resourceIdParam Parameter name for resource ID
 * @param resourceType Resource type
 * @returns Express middleware
 */
export function isResourceOwner(resourceIdParam: string, resourceType: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            // Get resource ID from params
            const resourceId = req.params[resourceIdParam];
            if (!resourceId) {
                return res.status(400).json({ message: `Resource ID parameter '${resourceIdParam}' is missing` });
            }

            // Get user ID from token
            const userId = req.user.sub;

            // Check if user is the owner of the resource
            // This is a placeholder - implement actual ownership check
            const isOwner = await checkResourceOwnership(userId, resourceId, resourceType);
            if (!isOwner) {
                return res.status(403).json({ message: 'You do not have permission to access this resource' });
            }

            next();
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authorization error' });
        }
    };
}

/**
 * Check if a user is the owner of a resource (placeholder - implement in actual service)
 * @param userId User ID
 * @param resourceId Resource ID
 * @param resourceType Resource type
 * @returns True if user is the owner
 */
async function checkResourceOwnership(userId: string, resourceId: string, resourceType: string): Promise<boolean> {
    // This is a placeholder - implement actual ownership check
    return true;
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
            const userId = req.user.sub;

            // Check if user has verified email
            // This is a placeholder - implement actual email verification check
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
 * Check if a user has verified email (placeholder - implement in actual service)
 * @param userId User ID
 * @returns True if email is verified
 */
async function checkEmailVerification(userId: string): Promise<boolean> {
    // This is a placeholder - implement actual email verification check
    return true;
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
            const userId = req.user.sub;

            // Check if user has MFA enabled
            // This is a placeholder - implement actual MFA check
            const isMfaEnabled = await checkMfaEnabled(userId);
            if (!isMfaEnabled) {
                return res.status(403).json({ message: 'MFA required' });
            }

            // Check if user has completed MFA
            const isMfaCompleted = await checkMfaCompleted(userId, req.accessToken || '');
            if (!isMfaCompleted) {
                return res.status(403).json({ message: 'MFA verification required' });
            }

            next();
        } catch (error) {
            analyzeError(error as Error);
            return res.status(500).json({ message: 'Authorization error' });
        }
    };
}

/**
 * Check if a user has MFA enabled (placeholder - implement in actual service)
 * @param userId User ID
 * @returns True if MFA is enabled
 */
async function checkMfaEnabled(userId: string): Promise<boolean> {
    // This is a placeholder - implement actual MFA check
    return true;
}

/**
 * Check if a user has completed MFA (placeholder - implement in actual service)
 * @param userId User ID
 * @param token Access token
 * @returns True if MFA is completed
 */
async function checkMfaCompleted(userId: string, token: string): Promise<boolean> {
    // This is a placeholder - implement actual MFA completion check
    return true;
}
