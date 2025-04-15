/**
 * Authentication Middleware
 *
 * Express middleware for verifying JWT tokens
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
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

// Try to load the public key
let PUBLIC_KEY: string | null = null;
try {
  PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../../keys/public.key'), 'utf8');
  console.log('Loaded RSA public key for JWT verification');
} catch (error) {
  console.error('Failed to load RSA public key:', error);
  console.warn('Will use SecurityManager for token verification');
}

/**
 * Create authentication middleware using SecurityManager URL
 * @param securityManagerUrl URL of the SecurityManager service
 * @param requiredRoles Optional array of roles required to access the endpoint
 * @returns Express middleware function
 */
export function createAuthMiddleware(securityManagerUrl: string, requiredRoles: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    try {
      let decoded: any;

      // If we have the public key, verify locally
      if (PUBLIC_KEY) {
        try {
          decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
        } catch (error) {
          console.error('Local token verification failed:', error);
          // Fall back to SecurityManager verification
          decoded = await verifyWithSecurityManager(token, securityManagerUrl);
        }
      } else {
        // No public key, use SecurityManager
        decoded = await verifyWithSecurityManager(token, securityManagerUrl);
      }

      if (!decoded) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      // Check if the service has required roles
      if (requiredRoles.length > 0) {
        const serviceRoles = decoded.roles || [];
        const hasRequiredRole = requiredRoles.some(role => serviceRoles.includes(role));

        if (!hasRequiredRole) {
          return res.status(403).json({ message: 'Insufficient permissions' });
        }
      }

      // Add service info to request
      req.service = decoded;
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ message: 'Token verification failed' });
    }
  };
}

/**
 * Verify token with SecurityManager
 * @param token JWT token to verify
 * @param securityManagerUrl URL of the SecurityManager service
 * @returns Decoded token payload or null if invalid
 */
async function verifyWithSecurityManager(token: string, securityManagerUrl: string): Promise<any> {
  try {
    const response = await axios.post(`http://${securityManagerUrl}/verify`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.valid) {
      return response.data.user;
    }

    return null;
  } catch (error) {
    console.error('SecurityManager verification failed:', error);
    return null;
  }
}

/**
 * Create authentication middleware using ServiceTokenManager
 * @param tokenManager ServiceTokenManager instance
 * @param requiredRoles Optional array of roles required to access the endpoint
 * @returns Express middleware function
 */
export function createAuthMiddlewareWithTokenManager(tokenManager: ServiceTokenManager, requiredRoles: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    try {
      // Verify token using the token manager
      const decoded = await tokenManager.verifyToken(token);

      if (!decoded) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      // Check if the service has required roles
      if (requiredRoles.length > 0) {
        const serviceRoles = decoded.roles || [];
        const hasRequiredRole = requiredRoles.some(role => serviceRoles.includes(role));

        if (!hasRequiredRole) {
          return res.status(403).json({ message: 'Insufficient permissions' });
        }
      }

      // Add service info to request
      req.service = decoded;
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ message: 'Token verification failed' });
    }
  };
}
