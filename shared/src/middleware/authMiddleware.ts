/**
 * Authentication middleware for Express applications
 * Provides a reusable middleware for token verification and authorization
 */

import { Request, Response, NextFunction } from 'express';
import { BaseEntity } from '../BaseEntity';

/**
 * Standard paths that should bypass authentication
 * Note: /health is kept for backward compatibility but redirects to /ready?detail=full
 * Note: /chat is included to allow the Brain service to be accessed without authentication
 * Note: /admin paths are included for administrative operations
 */
export const HEALTH_CHECK_PATHS = ['/healthy', '/ready', '/health', '/status', '/chat'];

/**
 * Check if a path is a health check endpoint
 * @param path The path to check
 * @returns True if the path is a health check endpoint
 */
export function isHealthCheckEndpoint(path: string): boolean {
  // Check if the path exactly matches a health check path
  if (HEALTH_CHECK_PATHS.includes(path)) {
    return true;
  }

  // Check if the path starts with a health check path followed by a slash
  if (HEALTH_CHECK_PATHS.some(healthPath => path.startsWith(`${healthPath}/`))) {
    return true;
  }

  // Check if the path is /ready with query parameters
  if (path.startsWith('/ready?')) {
    return true;
  }

  // Check if the path starts with /admin/ (administrative endpoints)
  if (path.startsWith('/admin/')) {
    return true;
  }

  return false;
}

/**
 * Create an authentication middleware using the BaseEntity's verifyToken method
 * This is the recommended way to add authentication to Express routes
 * @param entity BaseEntity instance to use for token verification
 * @returns Express middleware function
 */
export function createAuthMiddleware(entity: BaseEntity) {
  return async (req: Request, res: Response, next: NextFunction) => {
    return entity.verifyToken(req, res, next);
  };
}

/**
 * Create a role-based authorization middleware
 * @param requiredRoles Array of roles required to access the route
 * @returns Express middleware function
 */
export function requireRoles(requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The user object should be added by the verifyToken middleware
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if the user has any of the required roles
    const userRoles = user.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Create a permission-based authorization middleware
 * @param requiredPermissions Array of permissions required to access the route
 * @returns Express middleware function
 */
export function requirePermissions(requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The user object should be added by the verifyToken middleware
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if the user has any of the required permissions
    const userPermissions = user.permissions || [];

    // Special case: if user has '*' permission, they have all permissions
    if (userPermissions.includes('*')) {
      return next();
    }

    const hasRequiredPermission = requiredPermissions.some(permission =>
      userPermissions.includes(permission)
    );

    if (!hasRequiredPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
