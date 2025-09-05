import { ServiceTokenManager } from '../src/security/ServiceTokenManager';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

// Mock external dependencies
jest.mock('axios');
jest.mock('jsonwebtoken');
jest.mock('fs');
jest.mock('path');

// Cast mocked functions/modules
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('ServiceTokenManager', () => {
    let manager: ServiceTokenManager;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_AUTH_URL = 'http://mock-security-manager';
    const MOCK_SERVICE_ID = 'TestService';
    const MOCK_SERVICE_SECRET = 'test-secret';
    const MOCK_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nTEST_PUBLIC_KEY\n-----END PUBLIC KEY-----';
    const MOCK_JWT_TOKEN = 'header.payload.signature';
    const MOCK_DECODED_PAYLOAD = { userId: '123', exp: Math.floor(Date.now() / 1000) + 3600 }; // Expires in 1 hour

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Reset the singleton instance before each test
        (ServiceTokenManager as any).instance = null;

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Default mocks for fs
        mockFs.existsSync.mockReturnValue(false); // Default: no public key file exists
        mockFs.readFileSync.mockReturnValue('');
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);

        // Default mocks for path
        mockPath.join.mockImplementation((...args) => args.join('/'));

        // Default mocks for jwt
        mockJwt.verify.mockReturnValue(MOCK_DECODED_PAYLOAD);

        // Default mocks for axios
        mockAxios.get.mockResolvedValue({ data: MOCK_PUBLIC_KEY }); // Public key fetch
        mockAxios.post.mockResolvedValue({ data: { authenticated: true, token: MOCK_JWT_TOKEN } }); // Token acquisition

        // Mock process.cwd
        jest.spyOn(process, 'cwd').mockReturnValue('/app');

        manager = ServiceTokenManager.getInstance(MOCK_AUTH_URL, MOCK_SERVICE_ID, MOCK_SERVICE_SECRET);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor and getInstance', () => {
        it('should create a new instance and fetch public key', async () => {
            expect((manager as any).authUrl).toBe(MOCK_AUTH_URL);
            expect((manager as any).serviceId).toBe(MOCK_SERVICE_ID);
            expect((manager as any).serviceSecret).toBe(MOCK_SERVICE_SECRET);
            expect(mockAxios.get).toHaveBeenCalledWith(`${MOCK_AUTH_URL}/public-key`, expect.any(Object));
            expect(consoleWarnSpy).not.toHaveBeenCalled(); // No warning if fetch succeeds
        });

        it('should return the same instance on subsequent calls', () => {
            const secondManager = ServiceTokenManager.getInstance(MOCK_AUTH_URL, MOCK_SERVICE_ID, MOCK_SERVICE_SECRET);
            expect(secondManager).toBe(manager);
            expect(mockAxios.get).toHaveBeenCalledTimes(1); // Public key fetched only once
        });

        it('should log warning if public key fetch fails during construction', async () => {
            (ServiceTokenManager as any).instance = null; // Reset for this test
            mockAxios.get.mockRejectedValueOnce(new Error('Fetch failed'));
            manager = ServiceTokenManager.getInstance(MOCK_AUTH_URL, MOCK_SERVICE_ID, MOCK_SERVICE_SECRET);
            jest.runAllTimers(); // Allow async fetch to complete
            await Promise.resolve();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch public key'));
        });

        it('should set up proactive token refresh interval', () => {
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60 * 1000);
        });
    });

    describe('fetchPublicKey', () => {
        it('should load public key from file system if exists', async () => {
            mockFs.existsSync.mockReturnValueOnce(true); // Simulate file exists
            mockFs.readFileSync.mockReturnValueOnce(MOCK_PUBLIC_KEY);

            await (manager as any).fetchPublicKey();

            expect((manager as any).publicKey).toBe(MOCK_PUBLIC_KEY);
            expect(mockFs.existsSync).toHaveBeenCalled();
            expect(mockFs.readFileSync).toHaveBeenCalled();
            expect(mockAxios.get).not.toHaveBeenCalled(); // Should not call API if found locally
        });

        it('should fetch public key from server if not found locally', async () => {
            await (manager as any).fetchPublicKey();

            expect(mockAxios.get).toHaveBeenCalledWith(`${MOCK_AUTH_URL}/public-key`, expect.any(Object));
            expect((manager as any).publicKey).toBe(MOCK_PUBLIC_KEY);
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('public.key'), MOCK_PUBLIC_KEY);
        });

        it('should retry fetching public key on failure', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('First attempt failed'));
            mockAxios.get.mockResolvedValueOnce({ data: MOCK_PUBLIC_KEY });

            await (manager as any).fetchPublicKey();

            expect(mockAxios.get).toHaveBeenCalledTimes(2);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch public key'));
            expect((manager as any).publicKey).toBe(MOCK_PUBLIC_KEY);
        });

        it('should throw error if public key fetch fails after all retries', async () => {
            mockAxios.get.mockRejectedValue(new Error('Persistent failure'));

            await expect((manager as any).fetchPublicKey()).rejects.toThrow('Failed to fetch public key after multiple attempts');
            expect(mockAxios.get).toHaveBeenCalledTimes(3); // 3 retries
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch public key'));
        });
    });

    describe('getToken', () => {
        it('should return cached token if valid', async () => {
            (manager as any).token = MOCK_JWT_TOKEN;
            (manager as any).tokenExpiry = Date.now() + 10000; // Valid for 10 seconds

            const token = await manager.getToken();
            expect(token).toBe(MOCK_JWT_TOKEN);
            expect(mockAxios.post).not.toHaveBeenCalled(); // No new auth request
        });

        it('should fetch new token if cached token is expired', async () => {
            (manager as any).token = 'expired-token';
            (manager as any).tokenExpiry = Date.now() - 1000; // Expired

            mockAxios.post.mockResolvedValueOnce({ data: { authenticated: true, token: 'new-token' } });

            const token = await manager.getToken();
            expect(token).toBe('new-token');
            expect(mockAxios.post).toHaveBeenCalledWith(`${MOCK_AUTH_URL}/auth/service`, expect.any(Object), expect.any(Object));
        });

        it('should fetch new token if no token is cached', async () => {
            const token = await manager.getToken();
            expect(token).toBe(MOCK_JWT_TOKEN);
            expect(mockAxios.post).toHaveBeenCalledTimes(1);
        });

        it('should prevent multiple concurrent auth attempts', async () => {
            mockAxios.post.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ data: { authenticated: true, token: 'token1' } }), 500)));

            const promise1 = manager.getToken();
            const promise2 = manager.getToken();

            jest.advanceTimersByTime(500);
            const [token1, token2] = await Promise.all([promise1, promise2]);

            expect(token1).toBe('token1');
            expect(token2).toBe('token1');
            expect(mockAxios.post).toHaveBeenCalledTimes(1); // Only one auth request
        });

        it('should use existing token if auth fails but token is present', async () => {
            (manager as any).token = 'existing-but-expired-token';
            (manager as any).tokenExpiry = Date.now() - 1000; // Expired
            mockAxios.post.mockRejectedValueOnce(new Error('Auth failed'));

            const token = await manager.getToken();
            expect(token).toBe('existing-but-expired-token');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Using existing token'));
        });

        it('should throw error if auth fails and no existing token', async () => {
            (manager as any).token = '';
            (manager as any).tokenExpiry = 0;
            mockAxios.post.mockRejectedValueOnce(new Error('Auth failed'));

            await expect(manager.getToken()).rejects.toThrow('Authentication service unavailable: Auth failed');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to get auth token'));
        });
    });

    describe('getAuthHeader', () => {
        it('should return Authorization header with token', async () => {
            jest.spyOn(manager, 'getToken').mockResolvedValueOnce('my-custom-token');
            const header = await manager.getAuthHeader();
            expect(header).toEqual({ Authorization: 'Bearer my-custom-token' });
        });
    });

    describe('clearToken', () => {
        it('should clear the token and expiry', () => {
            (manager as any).token = MOCK_JWT_TOKEN;
            (manager as any).tokenExpiry = Date.now() + 10000;
            manager.clearToken();
            expect((manager as any).token).toBe('');
            expect((manager as any).tokenExpiry).toBe(0);
        });
    });

    describe('verifyTokenWithSecurityManager', () => {
        it('should verify token with SecurityManager successfully', async () => {
            mockAxios.post.mockResolvedValueOnce({ data: { valid: true, user: { id: 'user1' } } });
            const decoded = await manager.verifyTokenWithSecurityManager(MOCK_JWT_TOKEN);
            expect(decoded).toEqual({ id: 'user1' });
            expect(mockAxios.post).toHaveBeenCalledWith(`${MOCK_AUTH_URL}/verify`, {}, expect.objectContaining({
                headers: { Authorization: `Bearer ${MOCK_JWT_TOKEN}`, 'Content-Type': 'application/json' }
            }));
        });

        it('should return null if SecurityManager rejects token', async () => {
            mockAxios.post.mockResolvedValueOnce({ data: { valid: false, error: 'Invalid token' } });
            const decoded = await manager.verifyTokenWithSecurityManager(MOCK_JWT_TOKEN);
            expect(decoded).toBeNull();
        });

        it('should return null if SecurityManager call fails', async () => {
            mockAxios.post.mockRejectedValueOnce(new Error('Network error'));
            const decoded = await manager.verifyTokenWithSecurityManager(MOCK_JWT_TOKEN);
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('SecurityManager verification failed'), expect.any(Error));
        });
    });

    describe('verifyTokenLocally', () => {
        it('should verify token locally successfully', async () => {
            (manager as any).publicKey = MOCK_PUBLIC_KEY;
            mockJwt.verify.mockReturnValueOnce(MOCK_DECODED_PAYLOAD);

            const decoded = await manager.verifyTokenLocally(MOCK_JWT_TOKEN);
            expect(decoded).toEqual(MOCK_DECODED_PAYLOAD);
            expect(mockJwt.verify).toHaveBeenCalledWith(MOCK_JWT_TOKEN, MOCK_PUBLIC_KEY, { algorithms: ['RS256'] });
        });

        it('should fetch public key if not available', async () => {
            (manager as any).publicKey = '';
            jest.spyOn(manager as any, 'fetchPublicKey').mockResolvedValue(undefined);
            mockJwt.verify.mockReturnValueOnce(MOCK_DECODED_PAYLOAD);

            await manager.verifyTokenLocally(MOCK_JWT_TOKEN);
            expect((manager as any).fetchPublicKey).toHaveBeenCalledTimes(1);
        });

        it('should return null if public key fetch fails', async () => {
            (manager as any).publicKey = '';
            jest.spyOn(manager as any, 'fetchPublicKey').mockRejectedValueOnce(new Error('Fetch key failed'));

            const decoded = await manager.verifyTokenLocally(MOCK_JWT_TOKEN);
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch public key'));
        });

        it('should return null for invalid token format', async () => {
            const decoded = await manager.verifyTokenLocally('invalid-format');
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid token format'));
        });

        it('should return null for unsupported algorithm', async () => {
            mockJwt.verify.mockImplementationOnce(() => { throw new Error('Algorithm not supported'); });
            const decoded = await manager.verifyTokenLocally('header.eyJhbGciOiJIUzI1NiJ9.payload.signature');
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('RS256 verification failed'));
        });

        it('should return null if jwt.verify throws error', async () => {
            mockJwt.verify.mockImplementationOnce(() => { throw new Error('Verification failed'); });
            const decoded = await manager.verifyTokenLocally(MOCK_JWT_TOKEN);
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('RS256 verification failed'), expect.any(Error));
        });
    });

    describe('verifyToken (unified)', () => {
        it('should use cached token if valid', async () => {
            (manager as any).verifiedTokens.set(MOCK_JWT_TOKEN, { payload: MOCK_DECODED_PAYLOAD, expiry: Date.now() + 10000 });
            const decoded = await manager.verifyToken(MOCK_JWT_TOKEN);
            expect(decoded).toEqual(MOCK_DECODED_PAYLOAD);
            expect(manager.verifyTokenLocally).not.toHaveBeenCalled();
            expect(manager.verifyTokenWithSecurityManager).not.toHaveBeenCalled();
        });

        it('should verify locally first if not in cache or expired', async () => {
            jest.spyOn(manager, 'verifyTokenLocally').mockResolvedValueOnce(MOCK_DECODED_PAYLOAD);
            jest.spyOn(manager, 'verifyTokenWithSecurityManager');

            const decoded = await manager.verifyToken(MOCK_JWT_TOKEN);
            expect(decoded).toEqual(MOCK_DECODED_PAYLOAD);
            expect(manager.verifyTokenLocally).toHaveBeenCalledTimes(1);
            expect(manager.verifyTokenWithSecurityManager).not.toHaveBeenCalled();
        });

        it('should verify with SecurityManager if local verification fails', async () => {
            jest.spyOn(manager, 'verifyTokenLocally').mockResolvedValueOnce(null);
            jest.spyOn(manager, 'verifyTokenWithSecurityManager').mockResolvedValueOnce(MOCK_DECODED_PAYLOAD);

            const decoded = await manager.verifyToken(MOCK_JWT_TOKEN);
            expect(decoded).toEqual(MOCK_DECODED_PAYLOAD);
            expect(manager.verifyTokenLocally).toHaveBeenCalledTimes(1);
            expect(manager.verifyTokenWithSecurityManager).toHaveBeenCalledTimes(1);
        });

        it('should return null if both local and remote verification fail', async () => {
            jest.spyOn(manager, 'verifyTokenLocally').mockResolvedValueOnce(null);
            jest.spyOn(manager, 'verifyTokenWithSecurityManager').mockResolvedValueOnce(null);

            const decoded = await manager.verifyToken(MOCK_JWT_TOKEN);
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error during token verification'));
        });

        it('should prune cache when MAX_CACHE_SIZE is reached', async () => {
            // Fill cache to MAX_CACHE_SIZE
            for (let i = 0; i < 1000; i++) {
                (manager as any).verifiedTokens.set(`token-${i}`, { payload: { id: i }, expiry: Date.now() + 10000 });
            }
            // Add one more to trigger prune
            jest.spyOn(manager, 'verifyTokenLocally').mockResolvedValueOnce(MOCK_DECODED_PAYLOAD);
            jest.spyOn(manager, 'verifyTokenWithSecurityManager');

            await manager.verifyToken('new-token');

            expect((manager as any).verifiedTokens.size).toBeLessThan(1000);
        });

        it('should return null if no token provided', async () => {
            const decoded = await manager.verifyToken('');
            expect(decoded).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith('No token provided for verification');
        });
    });

    describe('extractTokenFromHeader', () => {
        it('should extract token from Bearer header', () => {
            const token = ServiceTokenManager.extractTokenFromHeader('Bearer my-token');
            expect(token).toBe('my-token');
        });

        it('should return null for invalid header format', () => {
            expect(ServiceTokenManager.extractTokenFromHeader('my-token')).toBeNull();
            expect(ServiceTokenManager.extractTokenFromHeader('Basic my-token')).toBeNull();
        });

        it('should return null for undefined header', () => {
            expect(ServiceTokenManager.extractTokenFromHeader(undefined)).toBeNull();
        });
    });
});
