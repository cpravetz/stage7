import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Rate limiting middleware
 * @param windowMs Time window in milliseconds
 * @param max Maximum number of requests per window
 * @param message Error message
 * @returns Express middleware
 */
export function createRateLimiter(windowMs: number = 15 * 60 * 1000, max: number = 100, message: string = 'Too many requests, please try again later.') {
    return rateLimit({
        windowMs,
        max,
        message: { message },
        standardHeaders: true,
        legacyHeaders: false
    });
}

/**
 * CSRF protection middleware
 * @returns Express middleware
 */
export function csrfProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
        // Skip for GET, HEAD, OPTIONS requests
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        // Check CSRF token
        const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
        const storedToken = req.cookies['csrf-token'];

        if (!csrfToken || !storedToken || csrfToken !== storedToken) {
            return res.status(403).json({ message: 'CSRF token validation failed' });
        }

        next();
    };
}

/**
 * CSRF token generator middleware
 * @returns Express middleware
 */
export function csrfTokenGenerator() {
    return (req: Request, res: Response, next: NextFunction) => {
        // Generate CSRF token if not exists
        if (!req.cookies['csrf-token']) {
            const token = uuidv4();
            res.cookie('csrf-token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });
        }
        next();
    };
}

/**
 * Security headers middleware
 * @returns Express middleware
 */
export function securityHeaders() {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https:'],
                frameSrc: ["'self'"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: []
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'same-site' },
        dnsPrefetchControl: { allow: false },
        // expectCt is deprecated in newer versions of helmet
        // expectCt: { maxAge: 86400, enforce: true },
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        xssFilter: true
    });
}

/**
 * CORS middleware
 * @param options CORS options
 * @returns Express middleware
 */
export function corsMiddleware(options: cors.CorsOptions = {}) {
    const defaultOptions: cors.CorsOptions = {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
        exposedHeaders: ['Content-Length', 'X-Request-Id'],
        credentials: true,
        maxAge: 86400 // 24 hours
    };

    return cors({ ...defaultOptions, ...options });
}

/**
 * Request ID middleware
 * @returns Express middleware
 */
export function requestId() {
    return (req: Request, res: Response, next: NextFunction) => {
        const id = req.headers['x-request-id'] || uuidv4();
        req.headers['x-request-id'] = id;
        res.setHeader('X-Request-Id', id);
        next();
    };
}

/**
 * Request logger middleware
 * @returns Express middleware
 */
export function requestLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        const requestId = req.headers['x-request-id'];

        // Log request
        console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url}`);

        // Log response
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
        });

        next();
    };
}

/**
 * Error handler middleware
 * @returns Express middleware
 */
export function errorHandler() {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
        try {
            analyzeError(err);

            // Log error
            console.error(`[${new Date().toISOString()}] [${req.headers['x-request-id']}] Error:`, err);

            // Send error response
            res.status(500).json({
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'production' ? undefined : err.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
                requestId: req.headers['x-request-id']
            });
        } catch (error) {
            console.error('Error in error handler:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}

/**
 * Not found handler middleware
 * @returns Express middleware
 */
export function notFoundHandler() {
    return (req: Request, res: Response) => {
        res.status(404).json({
            message: 'Not found',
            path: req.url,
            method: req.method,
            requestId: req.headers['x-request-id']
        });
    };
}

/**
 * Method not allowed handler middleware
 * @param allowedMethods Allowed HTTP methods
 * @returns Express middleware
 */
export function methodNotAllowedHandler(allowedMethods: string[]) {
    return (req: Request, res: Response) => {
        res.setHeader('Allow', allowedMethods.join(', '));
        res.status(405).json({
            message: 'Method not allowed',
            path: req.url,
            method: req.method,
            allowedMethods,
            requestId: req.headers['x-request-id']
        });
    };
}
