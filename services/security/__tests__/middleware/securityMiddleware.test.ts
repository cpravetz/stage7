import { Request, Response, NextFunction } from 'express';
import { createRateLimiter, csrfProtection, csrfTokenGenerator, securityHeaders, corsMiddleware, requestId, requestLogger, errorHandler, notFoundHandler, methodNotAllowedHandler } from '../src/middleware/securityMiddleware';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('express-rate-limit');
jest.mock('helmet');
jest.mock('cors');
jest.mock('uuid');
jest.mock('@cktmcs/errorhandler');

describe('securityMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let originalProcessEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For requestLogger and csrfTokenGenerator

        mockReq = { headers: {}, body: {}, cookies: {} };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            setHeader: jest.fn(),
            cookie: jest.fn(),
            on: jest.fn(),
        };
        mockNext = jest.fn();

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Store original process.env and create a writable copy
        originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv };

        // Mock external middleware libraries
        (rateLimit as jest.Mock).mockImplementation(() => (req: Request, res: Response, next: NextFunction) => next());
        (helmet as jest.Mock).mockImplementation(() => (req: Request, res: Response, next: NextFunction) => next());
        (cors as jest.Mock).mockImplementation(() => (req: Request, res: Response, next: NextFunction) => next());

        // Mock uuidv4
        (uuidv4 as jest.Mock).mockReturnValue('mock-uuid');
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        process.env = originalProcessEnv; // Restore original process.env
    });

    describe('createRateLimiter', () => {
        it('should return a rate limit middleware', () => {
            const middleware = createRateLimiter();
            expect(rateLimit).toHaveBeenCalledTimes(1);
            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                windowMs: 15 * 60 * 1000,
                max: 1000,
                message: { message: 'Too many requests, please try again later.' },
            }));
            expect(typeof middleware).toBe('function');
        });

        it('should apply custom options', () => {
            createRateLimiter(1000, 5, 'Custom message');
            expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({
                windowMs: 1000,
                max: 5,
                message: { message: 'Custom message' },
            }));
        });
    });

    describe('csrfProtection', () => {
        let middleware: (req: Request, res: Response, next: NextFunction) => void;

        beforeEach(() => {
            middleware = csrfProtection();
        });

        it('should call next for GET requests', () => {
            mockReq.method = 'GET';
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should call next for HEAD requests', () => {
            mockReq.method = 'HEAD';
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should call next for OPTIONS requests', () => {
            mockReq.method = 'OPTIONS';
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should call next if CSRF tokens match', () => {
            mockReq.method = 'POST';
            mockReq.headers = { 'x-csrf-token': 'valid-token' };
            mockReq.cookies = { 'csrf-token': 'valid-token' };
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 403 if x-csrf-token is missing', () => {
            mockReq.method = 'POST';
            mockReq.cookies = { 'csrf-token': 'valid-token' };
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'CSRF token validation failed' });
        });

        it('should return 403 if csrf-token cookie is missing', () => {
            mockReq.method = 'POST';
            mockReq.headers = { 'x-csrf-token': 'valid-token' };
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'CSRF token validation failed' });
        });

        it('should return 403 if tokens do not match', () => {
            mockReq.method = 'POST';
            mockReq.headers = { 'x-csrf-token': 'invalid-token' };
            mockReq.cookies = { 'csrf-token': 'valid-token' };
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'CSRF token validation failed' });
        });
    });

    describe('csrfTokenGenerator', () => {
        let middleware: (req: Request, res: Response, next: NextFunction) => void;

        beforeEach(() => {
            middleware = csrfTokenGenerator();
        });

        it('should generate and set a new CSRF token if not present', () => {
            mockReq.cookies = {};
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.cookie).toHaveBeenCalledWith('csrf-token', 'mock-uuid', expect.objectContaining({
                httpOnly: true,
                secure: false, // NODE_ENV is development by default
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
            }));
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should not generate a new CSRF token if already present', () => {
            mockReq.cookies = { 'csrf-token': 'existing-token' };
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.cookie).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should set secure flag in production environment', () => {
            process.env.NODE_ENV = 'production';
            mockReq.cookies = {};
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.cookie).toHaveBeenCalledWith('csrf-token', 'mock-uuid', expect.objectContaining({
                secure: true,
            }));
        });
    });

    describe('securityHeaders', () => {
        it('should return a helmet middleware', () => {
            const middleware = securityHeaders();
            expect(helmet).toHaveBeenCalledTimes(1);
            expect(typeof middleware).toBe('function');
        });

        it('should configure helmet with specific directives', () => {
            securityHeaders();
            expect(helmet).toHaveBeenCalledWith(expect.objectContaining({
                contentSecurityPolicy: expect.any(Object),
                frameguard: { action: 'deny' },
                hidePoweredBy: true,
            }));
        });
    });

    describe('corsMiddleware', () => {
        it('should return a cors middleware with default options', () => {
            const middleware = corsMiddleware();
            expect(cors).toHaveBeenCalledTimes(1);
            expect(cors).toHaveBeenCalledWith(expect.objectContaining({
                origin: '*',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            }));
            expect(typeof middleware).toBe('function');
        });

        it('should apply custom cors options', () => {
            corsMiddleware({ origin: 'http://example.com', methods: ['GET'] });
            expect(cors).toHaveBeenCalledWith(expect.objectContaining({
                origin: 'http://example.com',
                methods: ['GET'],
            }));
        });

        it('should use CORS_ORIGIN from process.env', () => {
            process.env.CORS_ORIGIN = 'http://custom-origin.com';
            corsMiddleware();
            expect(cors).toHaveBeenCalledWith(expect.objectContaining({
                origin: 'http://custom-origin.com',
            }));
        });
    });

    describe('requestId', () => {
        let middleware: (req: Request, res: Response, next: NextFunction) => void;

        beforeEach(() => {
            middleware = requestId();
        });

        it('should add a new X-Request-Id if not present', () => {
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockReq.headers['x-request-id']).toBe('mock-uuid');
            expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', 'mock-uuid');
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should use existing X-Request-Id if present', () => {
            mockReq.headers = { 'x-request-id': 'existing-id' };
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockReq.headers['x-request-id']).toBe('existing-id');
            expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', 'existing-id');
            expect(mockNext).toHaveBeenCalledTimes(1);
        });
    });

    describe('requestLogger', () => {
        let middleware: (req: Request, res: Response, next: NextFunction) => void;

        beforeEach(() => {
            middleware = requestLogger();
            mockReq.headers = { 'x-request-id': 'log-id' };
            mockReq.method = 'GET';
            mockReq.url = '/test-url';
        });

        it('should log request at the start', () => {
            middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[log-id] GET /test-url`));
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should log response on finish event', () => {
            middleware(mockReq as Request, mockRes as Response, mockNext);
            mockRes.statusCode = 200;
            const finishCallback = mockRes.on.mock.calls.find(call => call[0] === 'finish')[1];
            jest.advanceTimersByTime(100);
            finishCallback();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[log-id] GET /test-url 200 100ms`));
        });
    });

    describe('errorHandler', () => {
        let middleware: (err: Error, req: Request, res: Response, next: NextFunction) => void;

        beforeEach(() => {
            middleware = errorHandler();
            mockReq.headers = { 'x-request-id': 'error-id' };
        });

        it('should log error and send 500 response in development', () => {
            process.env.NODE_ENV = 'development';
            const mockError = new Error('Test error');
            mockError.stack = 'Error stack';

            middleware(mockError, mockReq as Request, mockRes as Response, mockNext);

            expect(analyzeError).toHaveBeenCalledWith(mockError);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[error-id] Error:`), mockError);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Internal server error',
                error: 'Test error',
                stack: 'Error stack',
                requestId: 'error-id',
            });
        });

        it('should hide error details in production', () => {
            process.env.NODE_ENV = 'production';
            const mockError = new Error('Test error');
            middleware(mockError, mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Internal server error',
                error: undefined,
                stack: undefined,
                requestId: 'error-id',
            });
        });

        it('should handle errors within the error handler', () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => { throw new Error('Analyze error failed'); });
            const mockError = new Error('Original error');
            middleware(mockError, mockReq as Request, mockRes as Response, mockNext);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in error handler:'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal server error' });
        });
    });

    describe('notFoundHandler', () => {
        let middleware: (req: Request, res: Response) => void;

        beforeEach(() => {
            middleware = notFoundHandler();
            mockReq.url = '/non-existent';
            mockReq.method = 'GET';
            mockReq.headers = { 'x-request-id': '404-id' };
        });

        it('should return 404 Not Found response', () => {
            middleware(mockReq as Request, mockRes as Response);
            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Not found',
                path: '/non-existent',
                method: 'GET',
                requestId: '404-id',
            });
        });
    });

    describe('methodNotAllowedHandler', () => {
        const ALLOWED_METHODS = ['GET', 'POST'];
        let middleware: (req: Request, res: Response) => void;

        beforeEach(() => {
            middleware = methodNotAllowedHandler(ALLOWED_METHODS);
            mockReq.url = '/resource';
            mockReq.method = 'PUT';
            mockReq.headers = { 'x-request-id': '405-id' };
        });

        it('should return 405 Method Not Allowed response', () => {
            middleware(mockReq as Request, mockRes as Response);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST');
            expect(mockRes.status).toHaveBeenCalledWith(405);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Method not allowed',
                path: '/resource',
                method: 'PUT',
                allowedMethods: ALLOWED_METHODS,
                requestId: '405-id',
            });
        });
    });
});
