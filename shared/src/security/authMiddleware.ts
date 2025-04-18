/**
 * Authentication Middleware
 *
 * Express middleware for verifying JWT tokens
 * Uses the unified token verification mechanism from ServiceTokenManager
 */

import { Request, Response, NextFunction } from 'express';
import { ServiceTokenManager } from './ServiceTokenManager.js';

// Extend Express Request type to include service info
declare global {
  namespace Express {
    interface Request {
      service?: {
        componentType: string;
        roles: string[];
        issuedAt: number;
      };
    }
  }
}

/**
 * Options for the authentication middleware
 */
export interface AuthMiddlewareOptions {
  /**
   * Paths to exclude from authentication
   * @default ['/health', '/ready']
   */
  excludePaths?: string[];

  /**
   * Whether to log authentication details
   * @default false
   */
  verbose?: boolean;
}

/**
 * Create authentication middleware using ServiceTokenManager
 * This is the preferred method for creating authentication middleware
 * @param tokenManager ServiceTokenManager instance
 * @param requiredRoles Optional array of roles required to access the endpoint
 * @param options Additional options for the middleware
 * @returns Express middleware function
 */
export function createAuthMiddleware(tokenManager: ServiceTokenManager, requiredRoles: string[] = [], options?: AuthMiddlewareOptions) {
  const excludePaths = options?.excludePaths || ['/health', '/ready'];
  const verbose = options?.verbose || false;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip authentication for excluded paths
    if (excludePaths.some(path => req.path === path || req.path.startsWith(path))) {
      if (verbose) console.log(`Skipping authentication for excluded path: ${req.path}`);
      return next();
    }

    // Skip authentication for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      if (verbose) console.log('Skipping authentication for OPTIONS request');
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (verbose) console.log('Authorization header missing or invalid');
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    const token = ServiceTokenManager.extractTokenFromHeader(authHeader);
    if (!token) {
      if (verbose) console.log('Failed to extract token from Authorization header');
      return res.status(401).json({ message: 'Invalid authorization format' });
    }

    try {
      // Verify token using the token manager
      if (verbose) console.log(`Verifying token for request to ${req.path}`);
      const decoded = await tokenManager.verifyToken(token);

      if (!decoded) {
        if (verbose) console.log('Token verification failed');
        return res.status(401).json({ message: 'Invalid token' });
      }

      // Check if the service has required roles
      if (requiredRoles.length > 0) {
        const serviceRoles = decoded.roles || [];
        const hasRequiredRole = requiredRoles.some(role => serviceRoles.includes(role));

        if (!hasRequiredRole) {
          if (verbose) console.log(`Insufficient permissions. Required roles: ${requiredRoles.join(', ')}. Service roles: ${serviceRoles.join(', ')}`);
          return res.status(403).json({ message: 'Insufficient permissions' });
        }
      }

      // Add service info to request
      req.service = decoded;
      if (verbose) console.log(`Authentication successful for ${decoded.componentType}`);
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ message: 'Token verification failed' });
    }
  };
}

/**
 * Create authentication middleware using SecurityManager URL
 * This is a legacy method, prefer using createAuthMiddleware with a ServiceTokenManager instance
 * @param securityManagerUrl URL of the SecurityManager service
 * @param requiredRoles Optional array of roles required to access the endpoint
 * @param options Additional options for the middleware
 * @returns Express middleware function
 */
export function createAuthMiddlewareWithUrl(securityManagerUrl: string, requiredRoles: string[] = [], options?: AuthMiddlewareOptions) {
  // Create a token manager instance
  const serviceId = process.env.SERVICE_ID || 'UnknownService';
  const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
  const tokenManager = ServiceTokenManager.getInstance(securityManagerUrl, serviceId, serviceSecret);

  // Use the token manager to create the middleware
  return createAuthMiddleware(tokenManager, requiredRoles, options);
}
