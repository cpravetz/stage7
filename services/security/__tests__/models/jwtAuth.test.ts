import { verifyComponentCredentials, generateServiceToken, verifyToken, authenticateService } from '../../src/models/jwtAuth';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';

// Mock external dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('jsonwebtoken');

// Cast mocked functions/modules
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('jwtAuth', () => {
    let consoleErrorSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;
    let originalProcessEnv: NodeJS.ProcessEnv;

    const MOCK_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----';
    const MOCK_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----';

    // Helper to reset the module and re-import it to clear global state
    const reimportModule = () => {
        jest.resetModules();
        const newModule = require('../src/models/jwtAuth');
        // Manually re-assign the exported functions to the outer scope variables
        Object.assign(exports, newModule);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now()

        // Store original process.env and create a writable copy
        originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv };

        // Default mocks for fs (keys exist)
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockImplementation((p) => {
            if (p.includes('private')) return MOCK_PRIVATE_KEY;
            if (p.includes('public')) return MOCK_PUBLIC_KEY;
            return '';
        });

        // Default mocks for path
        mockPath.join.mockImplementation((...args) => args.join('/'));

        // Default mocks for jwt
        mockJwt.sign.mockReturnValue('mock-jwt-token');
        mockJwt.verify.mockReturnValue({ sub: 'test-sub', componentType: 'TestComponent', roles: ['test-role'] });

        // Suppress console logs
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Re-import the module to ensure keys are loaded and global state is reset
        reimportModule();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        process.env = originalProcessEnv; // Restore original process.env
    });

    describe('Key Loading', () => {
        it('should load private and public keys from file system', () => {
            expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('private.pem'));
            expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('public.pem'));
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('private.pem'), 'utf8');
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('public.pem'), 'utf8');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Loaded RSA private key'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Loaded RSA public key'));
            expect(consoleLogSpy).toHaveBeenCalledWith('Successfully loaded RSA keys for JWT signing and verification');
        });

        it('should throw error if no private key is available', () => {
            mockFs.existsSync.mockImplementation((p) => !p.includes('private')); // Only public key exists
            expect(() => reimportModule()).toThrow('Cannot start security service without RSA keys');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load RSA keys'), expect.any(Error));
        });

        it('should throw error if no public key is available', () => {
            mockFs.existsSync.mockImplementation((p) => !p.includes('public')); // Only private key exists
            expect(() => reimportModule()).toThrow('Cannot start security service without RSA keys');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load RSA keys'), expect.any(Error));
        });
    });

    describe('verifyComponentCredentials', () => {
        it('should return true for valid component credentials', async () => {
            process.env.POSTOFFICE_SECRET = 'postoffice-secret';
            reimportModule(); // Re-import to pick up new env var

            const isValid = await verifyComponentCredentials('PostOffice', 'postoffice-secret');
            expect(isValid).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Verifying credentials for componentType: PostOffice'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client verified for componentType: PostOffice using service registry'));
        });

        it('should return true for valid shared secret', async () => {
            reimportModule();

            const isValid = await verifyComponentCredentials('NonExistentService', 'shared-secret');
            expect(isValid).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Client verified for componentType: NonExistentService using shared secret'));
        });

        it('should return false for unknown service type', async () => {
            const isValid = await verifyComponentCredentials('UnknownService', 'any-secret');
            expect(isValid).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown service type: UnknownService'));
        });

        it('should return false for invalid secret', async () => {
            process.env.POSTOFFICE_SECRET = 'postoffice-secret';
            reimportModule();

            const isValid = await verifyComponentCredentials('PostOffice', 'wrong-secret');
            expect(isValid).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authentication failed for componentType: PostOffice'));
        });
    });

    describe('generateServiceToken', () => {
        it('should generate a JWT token for a service', () => {
            const token = generateServiceToken('Brain');
            expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({
                iss: 'SecurityManager',
                sub: 'Brain',
                componentType: 'Brain',
                roles: ['llm:invoke'],
            }), MOCK_PRIVATE_KEY, { algorithm: 'RS256' });
            expect(token).toBe('mock-jwt-token');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Token generated for Brain'));
        });

        it('should generate token for unknown service with default roles', () => {
            const token = generateServiceToken('NewService');
            expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({
                sub: 'NewService',
                componentType: 'NewService',
                roles: ['service:basic'],
            }), MOCK_PRIVATE_KEY, { algorithm: 'RS256' });
            expect(token).toBe('mock-jwt-token');
        });

        it('should throw error if token signing fails', () => {
            mockJwt.sign.mockImplementationOnce(() => { throw new Error('Signing error'); });
            expect(() => generateServiceToken('Brain')).toThrow('Signing error');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error generating token for Brain'), expect.any(Error));
        });
    });

    describe('verifyToken', () => {
        it('should verify a valid JWT token', () => {
            const decoded = verifyToken('valid-jwt-token');
            expect(mockJwt.verify).toHaveBeenCalledWith('valid-jwt-token', MOCK_PUBLIC_KEY, { algorithms: ['RS256'], complete: false });
            expect(decoded).toEqual({ sub: 'test-sub', componentType: 'TestComponent', roles: ['test-role'] });
        });

        it('should return null for no token provided', () => {
            const decoded = verifyToken('');
            expect(decoded).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith('No token provided for verification');
        });

        it('should return null for invalid token format', () => {
            const decoded = verifyToken('invalid.format');
            expect(decoded).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith('Invalid token format - not a valid JWT');
        });

        it('should return null for unsupported algorithm', () => {
            mockJwt.verify.mockImplementationOnce(() => { throw new Error('Algorithm not supported'); });
            const decoded = verifyToken('header.eyJhbGciOiJIUzI1NiJ9.payload.signature'); // HS256
            expect(decoded).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Token uses unsupported algorithm'));
        });

        it('should return null for expired token', () => {
            const expiredPayload = { sub: 'test-sub', exp: Math.floor(Date.now() / 1000) - 3600 }; // 1 hour ago
            mockJwt.verify.mockReturnValueOnce(expiredPayload);
            const decoded = verifyToken('expired-token');
            expect(decoded).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith('Token has expired');
        });

        it('should return null if jwt.verify throws other errors', () => {
            mockJwt.verify.mockImplementationOnce(() => { throw new Error('Verification failed'); });
            const decoded = verifyToken('invalid-signature-token');
            expect(decoded).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Token verification failed'), expect.any(Error));
        });

        it('should use in-memory cache for verification', () => {
            const tokenData = { accessTokenExpiresAt: new Date(Date.now() + 3600000), clientId: 'cached-client' };
            // Manually populate the in-memory store (hacky, but necessary for testing module-level state)
            const jwtAuthModule = jest.requireActual('../src/models/jwtAuth');
            jwtAuthModule.inMemoryTokenStore['cached-token'] = tokenData;

            const decoded = verifyToken('cached-token');
            expect(decoded).toEqual(expect.objectContaining({ clientId: 'cached-client' }));
            expect(mockJwt.verify).not.toHaveBeenCalled(); // Should use cache
        });
    });

    describe('authenticateService', () => {
        it('should authenticate service and return token', async () => {
            process.env.POSTOFFICE_SECRET = 'postoffice-secret';
            reimportModule();

            const token = await authenticateService('PostOffice', 'postoffice-secret');
            expect(token).toBe('mock-jwt-token');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Token for PostOffice saved in memory'));
        });

        it('should return null if credentials are invalid', async () => {
            process.env.POSTOFFICE_SECRET = 'postoffice-secret';
            reimportModule();

            const token = await authenticateService('PostOffice', 'wrong-secret');
            expect(token).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authentication failed for componentType: PostOffice'));
        });

        it('should return null if token generation fails', async () => {
            mockJwt.sign.mockImplementationOnce(() => { throw new Error('Signing error'); });
            process.env.POSTOFFICE_SECRET = 'postoffice-secret';
            reimportModule();

            const token = await authenticateService('PostOffice', 'postoffice-secret');
            expect(token).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Service authentication failed'), expect.any(Error));
        });
    });
});
