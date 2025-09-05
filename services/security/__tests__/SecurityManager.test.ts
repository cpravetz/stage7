import request from 'supertest';
import express from 'express';
import { SecurityManager } from '../src/SecurityManager';
import { BaseEntity } from '@cktmcs/shared';
import { authenticateService, verifyToken } from '../src/models/jwtAuth';
import { refreshToken, register, login, logout } from '../src/controllers/authController';
import { errorHandler } from '../src/middleware/errorHandler';
import { initUserService } from '../src/services/userService';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

// Mock external dependencies
jest.mock('express');
jest.mock('cors');
jest.mock('body-parser');
jest.mock('express-rate-limit');
jest.mock('../src/models/jwtAuth');
jest.mock('../src/controllers/authController');
jest.mock('../src/middleware/errorHandler');
jest.mock('../src/services/userService');
jest.mock('fs');
jest.mock('path');
jest.mock('child_process');

// Cast mocked functions/modules
const mockExpress = express as jest.MockedFunction<typeof express>;
const mockCors = jest.mocked(cors);
const mockBodyParser = jest.mocked(require('body-parser'));
const mockRateLimit = jest.mocked(require('express-rate-limit'));
const mockAuthenticateService = authenticateService as jest.Mock;
const mockVerifyToken = verifyToken as jest.Mock;
const mockRefreshTokenController = refreshToken as jest.Mock;
const mockRegisterController = register as jest.Mock;
const mockLoginController = login as jest.Mock;
const mockLogoutController = logout as jest.Mock;
const mockErrorHandlerMiddleware = errorHandler as jest.Mock;
const mockInitUserService = initUserService as jest.Mock;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockChildProcess = child_process as jest.Mocked<typeof child_process>;

describe('SecurityManager', () => {
    let securityManager: SecurityManager;
    let mockApp: jest.Mocked<express.Application>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let originalProcessEnv: NodeJS.ProcessEnv;

    // Mock the actual express app instance that SecurityManager will use
    const realExpress = jest.requireActual('express');

    beforeAll(() => {
        // Mock express() to return a controllable app instance
        mockExpress.mockImplementation(() => {
            const app = realExpress();
            // Spy on app.use to capture middleware
            jest.spyOn(app, 'use');
            jest.spyOn(app, 'post');
            jest.spyOn(app, 'get');
            jest.spyOn(app, 'listen');
            return app;
        });

        // Mock bodyParser.json and urlencoded to return simple middleware
        mockBodyParser.json.mockReturnValue((req: any, res: any, next: any) => { req.body = req.body || {}; next(); });
        mockBodyParser.urlencoded.mockReturnValue((req: any, res: any, next: any) => { req.body = req.body || {}; next(); });

        // Mock rateLimit to return a simple middleware
        mockRateLimit.mockImplementation(() => (req: any, res: any, next: any) => next());

        // Mock cors to return a simple middleware
        mockCors.mockImplementation(() => (req: any, res: any, next: any) => next());

        // Mock errorHandler to return a simple middleware
        mockErrorHandlerMiddleware.mockImplementation(() => (err: any, req: any, res: any, next: any) => { res.status(500).json({ message: 'Mocked Error' }); });
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Store original process.env and create a writable copy
        originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv };

        // Set default env vars
        process.env.PORT = '5010';
        process.env.HOST = 'securitymanager';

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Re-import SecurityManager to get a fresh instance with mocked dependencies
        jest.resetModules();
        const { SecurityManager: NewSecurityManager } = require('../src/SecurityManager');
        securityManager = new NewSecurityManager();

        // Get the mocked app instance that SecurityManager is using
        mockApp = (securityManager as any).app; // Access the private app property

        // Mock fs and path for public-key endpoint
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readFileSync.mockReturnValue('');
        mockPath.join.mockImplementation((...args) => args.join('/'));

        // Mock child_process.execSync
        mockChildProcess.execSync.mockReturnValue('');
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        process.env = originalProcessEnv; // Restore original process.env
    });

    it('should initialize BaseEntity and configure middleware and routes', () => {
        expect(BaseEntity).toHaveBeenCalledTimes(1);
        expect(BaseEntity).toHaveBeenCalledWith('SecurityManager', 'SecurityManager', 'securitymanager', '5010');
        expect(mockInitUserService).toHaveBeenCalledTimes(1);

        // Check middleware application
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // rateLimit
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // cors
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // bodyParser.json
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // bodyParser.urlencoded

        // Check route setup
        expect(mockApp.post).toHaveBeenCalledWith('/auth/service', expect.any(Function), expect.any(Function));
        expect(mockApp.post).toHaveBeenCalledWith('/verify', expect.any(Function));
        expect(mockApp.get).toHaveBeenCalledWith('/public-key', expect.any(Function));
        expect(mockApp.post).toHaveBeenCalledWith('/auth/refresh-token', mockRefreshTokenController);
        expect(mockApp.post).toHaveBeenCalledWith('/register', mockRegisterController);
        expect(mockApp.post).toHaveBeenCalledWith('/login', mockLoginController);
        expect(mockApp.post).toHaveBeenCalledWith('/logout', mockLogoutController);
        expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));
        expect(mockApp.use).toHaveBeenCalledWith(mockErrorHandlerMiddleware); // Global error handler

        // Check global token verification middleware
        expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should start the server on the configured port', () => {
        securityManager.start();
        expect(mockApp.listen).toHaveBeenCalledWith('5010', expect.any(Function));
        expect(consoleLogSpy).toHaveBeenCalledWith('SecurityManager listening on port 5010');
    });

    describe('POST /auth/service', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/auth/service')[2];
        });

        it('should authenticate service successfully', async () => {
            mockAuthenticateService.mockResolvedValueOnce('mock-service-token');
            const res = await request(mockApp).post('/auth/service').send({ componentType: 'TestComp', clientSecret: 'secret' });

            expect(mockAuthenticateService).toHaveBeenCalledWith('TestComp', 'secret');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ authenticated: true, token: 'mock-service-token' });
        });

        it('should return 401 if authentication fails', async () => {
            mockAuthenticateService.mockResolvedValueOnce(null);
            const res = await request(mockApp).post('/auth/service').send({ componentType: 'TestComp', clientSecret: 'wrong-secret' });

            expect(res.statusCode).toBe(401);
            expect(res.body).toEqual({ error: 'Authentication failed' });
        });

        it('should return 500 for internal errors', async () => {
            mockAuthenticateService.mockRejectedValueOnce(new Error('DB error'));
            const res = await request(mockApp).post('/auth/service').send({ componentType: 'TestComp', clientSecret: 'secret' });

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Internal server error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error authenticating service'), expect.any(Error));
        });
    });

    describe('POST /verify', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/verify')[1];
        });

        it('should verify token successfully from Authorization header', async () => {
            mockVerifyToken.mockReturnValueOnce({ sub: 'user1', roles: ['user'] });
            const res = await request(mockApp).post('/verify').set('Authorization', 'Bearer valid-token');

            expect(mockVerifyToken).toHaveBeenCalledWith('valid-token');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ valid: true, user: { sub: 'user1', roles: ['user'] } });
        });

        it('should verify token successfully from request body', async () => {
            mockVerifyToken.mockReturnValueOnce({ sub: 'user2', roles: ['admin'] });
            const res = await request(mockApp).post('/verify').send({ token: 'valid-body-token' });

            expect(mockVerifyToken).toHaveBeenCalledWith('valid-body-token');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ valid: true, user: { sub: 'user2', roles: ['admin'] } });
        });

        it('should return 400 if no token provided', async () => {
            const res = await request(mockApp).post('/verify');
            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ valid: false, error: '[SM] No authorization token provided' });
        });

        it('should return 400 for invalid Authorization header format', async () => {
            const res = await request(mockApp).post('/verify').set('Authorization', 'InvalidFormat');
            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ valid: false, error: 'Invalid authorization header format' });
        });

        it('should return 401 if token is invalid or expired', async () => {
            mockVerifyToken.mockReturnValueOnce(null);
            const res = await request(mockApp).post('/verify').set('Authorization', 'Bearer invalid-token');

            expect(res.statusCode).toBe(401);
            expect(res.body).toEqual({ valid: false, error: 'Invalid token' });
        });

        it('should return 500 for internal errors', async () => {
            mockVerifyToken.mockImplementationOnce(() => { throw new Error('Verification error'); });
            const res = await request(mockApp).post('/verify').set('Authorization', 'Bearer token');

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ valid: false, error: 'Internal server error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error verifying token'), expect.any(Error));
        });
    });

    describe('GET /public-key', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/public-key')[1];
        });

        it('should serve public key from file system', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(MOCK_PUBLIC_KEY);

            const res = await request(mockApp).get('/public-key');

            expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('public.key'));
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('public.key'), 'utf8');
            expect(res.statusCode).toBe(200);
            expect(res.text).toBe(MOCK_PUBLIC_KEY);
            expect(res.headers['content-type']).toBe('text/plain');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Serving public key from file'));
        });

        it('should generate new key pair if not found and serve it', async () => {
            mockFs.existsSync.mockReturnValue(false); // Simulate no key found
            mockFs.existsSync.mockImplementationOnce((p) => p.includes('public.key') ? true : false); // New key exists after generation
            mockFs.readFileSync.mockReturnValueOnce(MOCK_PUBLIC_KEY); // Read new key

            const res = await request(mockApp).get('/public-key');

            expect(mockChildProcess.execSync).toHaveBeenCalledWith('node scripts/fix-auth-keys.js', { stdio: 'inherit' });
            expect(res.statusCode).toBe(200);
            expect(res.text).toBe(MOCK_PUBLIC_KEY);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Attempting to generate new key pair'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Serving newly generated public key'));
        });

        it('should return 500 if public key not available and generation fails', async () => {
            mockFs.existsSync.mockReturnValue(false);
            mockChildProcess.execSync.mockImplementationOnce(() => { throw new Error('Generation failed'); });

            const res = await request(mockApp).get('/public-key');

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Public key not available' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to generate new key pair'), expect.any(Error));
        });

        it('should return 500 for other errors serving public key', async () => {
            mockFs.existsSync.mockImplementationOnce(() => { throw new Error('FS error'); });
            const res = await request(mockApp).get('/public-key');

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to serve public key' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error serving public key'), expect.any(Error));
        });
    });

    describe('GET /health', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/health')[1];
        });

        it('should return health status', async () => {
            const res = await request(mockApp).get('/health');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ status: 'ok', message: 'Security service is running' });
        });
    });

    describe('Global Token Verification Middleware', () => {
        let middleware: Function;

        beforeEach(() => {
            // Extract the global middleware (it's the last app.use call)
            middleware = mockApp.use.mock.calls[mockApp.use.mock.calls.length - 1][0];
        });

        it('should skip token verification for exempt paths', async () => {
            const mockReq = { path: '/auth/login', headers: {} } as Request;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as Response;
            const mockNext = jest.fn();

            await middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockVerifyToken).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping token verification for exempt path'));
        });

        it('should return 401 if no authorization header for non-exempt path', async () => {
            const mockReq = { path: '/secure-endpoint', headers: {} } as Request;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as Response;
            const mockNext = jest.fn();

            await middleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authorization header is required' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No authorization header provided'));
        });

        it('should return 401 for invalid authorization header format', async () => {
            const mockReq = { path: '/secure-endpoint', headers: { authorization: 'InvalidFormat' } } as Request;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as Response;
            const mockNext = jest.fn();

            await middleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid authorization header format' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid authorization header format'));
        });

        it('should return 401 if token verification fails', async () => {
            mockVerifyToken.mockReturnValueOnce(null);
            const mockReq = { path: '/secure-endpoint', headers: { authorization: 'Bearer invalid-token' } } as Request;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as Response;
            const mockNext = jest.fn();

            await middleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid or expired token'));
        });

        it('should attach decoded user to req.user and call next on successful verification', async () => {
            const decodedUser = { sub: 'verified-user', roles: ['user'] };
            mockVerifyToken.mockReturnValueOnce(decodedUser);
            const mockReq = { path: '/secure-endpoint', headers: { authorization: 'Bearer valid-token' } } as Request;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as Response;
            const mockNext = jest.fn();

            await middleware(mockReq, mockRes, mockNext);

            expect(mockReq.user).toEqual(decodedUser);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });
    });
});
