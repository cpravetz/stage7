import { TokenService } from '../src/services/TokenService';
import { User } from '../src/models/User';
import { Token, TokenType, TokenPayload, DEFAULT_TOKEN_CONFIG } from '../src/models/Token';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Mock external dependencies
jest.mock('jsonwebtoken');
jest.mock('uuid');
jest.mock('fs');
jest.mock('path');

describe('TokenService', () => {
    let service: TokenService;
    let mockTokenRepository: any;
    let mockTokenBlacklistRepository: any;
    let mockUserRepository: any;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let originalProcessEnv: NodeJS.ProcessEnv;

    const MOCK_USER_ID = 'user-123';
    const MOCK_USER: User = { id: MOCK_USER_ID, username: 'testuser', email: 'test@example.com', roles: ['user'], permissions: [] } as User;
    const MOCK_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----';
    const MOCK_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----';
    const MOCK_JWT_TOKEN = 'mock.jwt.token';
    const MOCK_DECODED_PAYLOAD: TokenPayload = { sub: MOCK_USER_ID, jti: 'mock-jti', iat: 123, exp: 456, type: TokenType.ACCESS, roles: ['user'] };

    // Helper to re-import the module to reset its state
    const reimportModule = (config?: any) => {
        jest.resetModules();
        // Mock fs and path before re-importing
        jest.mock('fs', () => ({
            existsSync: jest.fn().mockReturnValue(true),
            readFileSync: jest.fn((p) => {
                if (p.includes('private.key')) return MOCK_PRIVATE_KEY;
                if (p.includes('public.key')) return MOCK_PUBLIC_KEY;
                return '';
            }),
        }));
        jest.mock('path', () => ({
            join: jest.fn((...args) => args.join('/')),
        }));
        // Mock jwt and uuid
        jest.mock('jsonwebtoken', () => ({ ...jest.requireActual('jsonwebtoken'), sign: jest.fn(), verify: jest.fn(), decode: jest.fn() }));
        jest.mock('uuid', () => ({ v4: jest.fn() }));

        // Re-assign mocks after resetModules
        mockFs.existsSync = fs.existsSync as jest.Mock;
        mockFs.readFileSync = fs.readFileSync as jest.Mock;
        mockPath.join = path.join as jest.Mock;
        (jwt.sign as jest.Mock) = jest.fn();
        (jwt.verify as jest.Mock) = jest.fn();
        (jwt.decode as jest.Mock) = jest.fn();
        (uuidv4 as jest.Mock) = jest.fn();

        // Set default mock implementations for jwt and uuid
        (jwt.sign as jest.Mock).mockReturnValue(MOCK_JWT_TOKEN);
        (jwt.verify as jest.Mock).mockReturnValue(MOCK_DECODED_PAYLOAD);
        (jwt.decode as jest.Mock).mockReturnValue(MOCK_DECODED_PAYLOAD);
        (uuidv4 as jest.Mock).mockReturnValue('mock-uuid');

        // Set up console spies again after resetModules
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const { TokenService: NewTokenService } = require('../src/services/TokenService');
        service = new NewTokenService(config, mockTokenRepository, mockTokenBlacklistRepository, mockUserRepository);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Store original process.env and create a writable copy
        originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv };

        // Mock repositories
        mockTokenRepository = {
            save: jest.fn().mockResolvedValue(undefined),
            findById: jest.fn().mockResolvedValue(null),
            findByUserId: jest.fn().mockResolvedValue([]),
        };
        mockTokenBlacklistRepository = {
            add: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
        };
        mockUserRepository = {
            findById: jest.fn().mockResolvedValue(MOCK_USER),
        };

        // Initial re-import to set up the service with default mocks
        reimportModule();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        process.env = originalProcessEnv; // Restore original process.env
    });

    describe('constructor', () => {
        it('should load RSA keys from file system', () => {
            expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('private.key'));
            expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('public.key'));
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('private.key'), 'utf8');
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('public.key'), 'utf8');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('RSA key pair loaded'));
            expect((service as any).privateKey).toBe(MOCK_PRIVATE_KEY);
            expect((service as any).publicKey).toBe(MOCK_PUBLIC_KEY);
        });

        it('should fall back to symmetric key if RSA keys not found', () => {
            mockFs.existsSync.mockReturnValue(false);
            reimportModule();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading RSA keys'), expect.any(Error));
            expect(consoleWarnSpy).toHaveBeenCalledWith('Using symmetric key as fallback - NOT SECURE FOR PRODUCTION');
            expect((service as any).privateKey).toBe(DEFAULT_TOKEN_CONFIG.secret);
            expect((service as any).publicKey).toBe(DEFAULT_TOKEN_CONFIG.secret);
        });

        it('should set algorithm to RS256', () => {
            expect(service['config'].algorithm).toBe('RS256');
        });
    });

    describe('generateToken', () => {
        it('should generate an access token', async () => {
            const token = await service.generateToken(MOCK_USER, TokenType.ACCESS);
            expect(token.type).toBe(TokenType.ACCESS);
            expect(token.token).toBe(MOCK_JWT_TOKEN);
            expect(token.userId).toBe(MOCK_USER_ID);
            expect(token.expiresAt).toBeInstanceOf(Date);
            expect(token.id).toBe('mock-uuid');
            expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({
                sub: MOCK_USER_ID,
                type: TokenType.ACCESS,
            }), MOCK_PRIVATE_KEY, expect.any(Object));
            expect(mockTokenRepository.save).toHaveBeenCalledWith(token);
        });

        it('should generate a refresh token', async () => {
            const token = await service.generateToken(MOCK_USER, TokenType.REFRESH);
            expect(token.type).toBe(TokenType.REFRESH);
            expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({
                type: TokenType.REFRESH,
            }), MOCK_PRIVATE_KEY, expect.any(Object));
        });

        it('should throw error for invalid token type', async () => {
            await expect(service.generateToken(MOCK_USER, 'INVALID' as TokenType)).rejects.toThrow('Invalid token type: INVALID');
        });
    });

    describe('verifyToken', () => {
        it('should verify a token successfully', async () => {
            const payload = await service.verifyToken(MOCK_JWT_TOKEN, TokenType.ACCESS);
            expect(jwt.verify).toHaveBeenCalledWith(MOCK_JWT_TOKEN, MOCK_PUBLIC_KEY, expect.any(Object));
            expect(payload).toEqual(MOCK_DECODED_PAYLOAD);
        });

        it('should throw error if token is blacklisted', async () => {
            mockTokenBlacklistRepository.exists.mockResolvedValueOnce(true);
            await expect(service.verifyToken(MOCK_JWT_TOKEN, TokenType.ACCESS)).rejects.toThrow('Token is blacklisted');
        });

        it('should throw error if token type does not match', async () => {
            (jwt.verify as jest.Mock).mockReturnValueOnce({ ...MOCK_DECODED_PAYLOAD, type: TokenType.REFRESH });
            await expect(service.verifyToken(MOCK_JWT_TOKEN, TokenType.ACCESS)).rejects.toThrow('Invalid token type: expected access, got refresh');
        });

        it('should throw error if token is revoked', async () => {
            mockTokenRepository.findById.mockResolvedValueOnce({ ...MOCK_DECODED_PAYLOAD, isRevoked: true });
            await expect(service.verifyToken(MOCK_JWT_TOKEN, TokenType.ACCESS)).rejects.toThrow('Token is revoked');
        });

        it('should throw error if jwt.verify fails', async () => {
            (jwt.verify as jest.Mock).mockImplementationOnce(() => { throw new Error('JWT error'); });
            await expect(service.verifyToken(MOCK_JWT_TOKEN, TokenType.ACCESS)).rejects.toThrow('JWT error');
        });
    });

    describe('revokeToken', () => {
        const MOCK_TOKEN_ID = 'mock-jti';
        const MOCK_TOKEN_RECORD: Token = { id: MOCK_TOKEN_ID, userId: MOCK_USER_ID, token: MOCK_JWT_TOKEN, type: TokenType.ACCESS, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false };

        it('should revoke a token successfully', async () => {
            mockTokenRepository.findById.mockResolvedValueOnce(MOCK_TOKEN_RECORD);
            await service.revokeToken(MOCK_TOKEN_ID);

            expect(mockTokenRepository.findById).toHaveBeenCalledWith(MOCK_TOKEN_ID);
            expect(mockTokenRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: MOCK_TOKEN_ID, isRevoked: true }));
            expect(mockTokenBlacklistRepository.add).toHaveBeenCalledWith(expect.objectContaining({ tokenId: MOCK_TOKEN_ID }));
        });

        it('should throw error if token repository is not available', async () => {
            service = new TokenService({}, null, mockTokenBlacklistRepository, mockUserRepository);
            await expect(service.revokeToken(MOCK_TOKEN_ID)).rejects.toThrow('Token repository is not available');
        });

        it('should throw error if token not found', async () => {
            mockTokenRepository.findById.mockResolvedValueOnce(null);
            await expect(service.revokeToken(MOCK_TOKEN_ID)).rejects.toThrow(`Token not found: ${MOCK_TOKEN_ID}`);
        });

        it('should handle errors during revocation', async () => {
            mockTokenRepository.findById.mockRejectedValueOnce(new Error('DB error'));
            await expect(service.revokeToken(MOCK_TOKEN_ID)).rejects.toThrow('DB error');
        });
    });

    describe('revokeAllUserTokens', () => {
        const MOCK_TOKENS_FOR_USER: Token[] = [
            { id: 'jti1', userId: MOCK_USER_ID, token: 't1', type: TokenType.ACCESS, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false },
            { id: 'jti2', userId: MOCK_USER_ID, token: 't2', type: TokenType.REFRESH, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false },
        ];

        it('should revoke all tokens for a user', async () => {
            mockTokenRepository.findByUserId.mockResolvedValueOnce(MOCK_TOKENS_FOR_USER);
            jest.spyOn(service, 'revokeToken').mockResolvedValue(undefined);

            await service.revokeAllUserTokens(MOCK_USER_ID);

            expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(service.revokeToken).toHaveBeenCalledWith('jti1', 'User initiated');
            expect(service.revokeToken).toHaveBeenCalledWith('jti2', 'User initiated');
            expect(service.revokeToken).toHaveBeenCalledTimes(2);
        });

        it('should exclude a specific token from revocation', async () => {
            mockTokenRepository.findByUserId.mockResolvedValueOnce(MOCK_TOKENS_FOR_USER);
            jest.spyOn(service, 'revokeToken').mockResolvedValue(undefined);

            await service.revokeAllUserTokens(MOCK_USER_ID, 'User initiated', 'jti1');

            expect(service.revokeToken).toHaveBeenCalledWith('jti2', 'User initiated');
            expect(service.revokeToken).toHaveBeenCalledTimes(1);
        });

        it('should throw error if token repository is not available', async () => {
            service = new TokenService({}, null, mockTokenBlacklistRepository, mockUserRepository);
            await expect(service.revokeAllUserTokens(MOCK_USER_ID)).rejects.toThrow('Token repository is not available');
        });

        it('should handle errors during revocation', async () => {
            mockTokenRepository.findByUserId.mockRejectedValueOnce(new Error('DB error'));
            await expect(service.revokeAllUserTokens(MOCK_USER_ID)).rejects.toThrow('DB error');
        });
    });

    describe('refreshAccessToken', () => {
        it('should refresh access token successfully', async () => {
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, type: TokenType.REFRESH });
            mockUserRepository.findById.mockResolvedValueOnce(MOCK_USER);
            jest.spyOn(service, 'generateToken').mockResolvedValueOnce({ token: 'new-access', type: TokenType.ACCESS } as Token);

            const newAccessToken = await service.refreshAccessToken('old-refresh-token');

            expect(service.verifyToken).toHaveBeenCalledWith('old-refresh-token', TokenType.REFRESH);
            expect(mockUserRepository.findById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(service.generateToken).toHaveBeenCalledWith(MOCK_USER, TokenType.ACCESS, undefined);
            expect(newAccessToken.token).toBe('new-access');
        });

        it('should throw error for invalid or expired refresh token', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('Invalid or expired token'));
            await expect(service.refreshAccessToken('invalid-refresh')).rejects.toThrow('Invalid or expired refresh token');
        });

        it('should throw error if user not found', async () => {
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, type: TokenType.REFRESH });
            mockUserRepository.findById.mockResolvedValueOnce(null);
            await expect(service.refreshAccessToken('valid-refresh')).rejects.toThrow(`User not found: ${MOCK_USER_ID}`);
        });

        it('should handle errors during token generation', async () => {
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, type: TokenType.REFRESH });
            mockUserRepository.findById.mockResolvedValueOnce(MOCK_USER);
            jest.spyOn(service, 'generateToken').mockRejectedValueOnce(new Error('Generate error'));
            await expect(service.refreshAccessToken('valid-refresh')).rejects.toThrow('Generate error');
        });
    });

    describe('getUserById (private)', () => {
        it('should return user if found', async () => {
            mockUserRepository.findById.mockResolvedValueOnce(MOCK_USER);
            const user = await (service as any).getUserById(MOCK_USER_ID);
            expect(user).toEqual(MOCK_USER);
        });

        it('should return null if user not found', async () => {
            mockUserRepository.findById.mockResolvedValueOnce(null);
            const user = await (service as any).getUserById(MOCK_USER_ID);
            expect(user).toBeNull();
        });

        it('should throw error if user repository is not available', async () => {
            service = new TokenService({}, mockTokenRepository, mockTokenBlacklistRepository, null);
            await expect((service as any).getUserById(MOCK_USER_ID)).rejects.toThrow('User repository is not available');
        });

        it('should handle errors', async () => {
            mockUserRepository.findById.mockRejectedValueOnce(new Error('DB error'));
            await expect((service as any).getUserById(MOCK_USER_ID)).rejects.toThrow('DB error');
        });
    });

    describe('decodeToken', () => {
        it('should decode a token successfully', () => {
            (jwt.decode as jest.Mock).mockReturnValueOnce(MOCK_DECODED_PAYLOAD);
            const payload = service.decodeToken(MOCK_JWT_TOKEN);
            expect(payload).toEqual(MOCK_DECODED_PAYLOAD);
        });

        it('should return null if decoding fails', () => {
            (jwt.decode as jest.Mock).mockReturnValueOnce(null);
            const payload = service.decodeToken('invalid-token');
            expect(payload).toBeNull();
        });
    });

    describe('generateTokenPair', () => {
        it('should generate access and refresh token pair', async () => {
            jest.spyOn(service, 'generateToken')
                .mockResolvedValueOnce({ token: 'access', type: TokenType.ACCESS } as Token)
                .mockResolvedValueOnce({ token: 'refresh', type: TokenType.REFRESH } as Token);

            const { accessToken, refreshToken } = await service.generateTokenPair(MOCK_USER);

            expect(service.generateToken).toHaveBeenCalledWith(MOCK_USER, TokenType.ACCESS, undefined);
            expect(service.generateToken).toHaveBeenCalledWith(MOCK_USER, TokenType.REFRESH, undefined);
            expect(accessToken.token).toBe('access');
            expect(refreshToken.token).toBe('refresh');
        });
    });

    describe('generateVerificationToken', () => {
        it('should generate a verification token', async () => {
            jest.spyOn(service, 'generateToken').mockResolvedValueOnce({ token: 'verify', type: TokenType.VERIFICATION } as Token);
            const token = await service.generateVerificationToken(MOCK_USER);
            expect(service.generateToken).toHaveBeenCalledWith(MOCK_USER, TokenType.VERIFICATION);
            expect(token.token).toBe('verify');
        });
    });

    describe('generatePasswordResetToken', () => {
        it('should generate a password reset token', async () => {
            jest.spyOn(service, 'generateToken').mockResolvedValueOnce({ token: 'reset', type: TokenType.PASSWORD_RESET } as Token);
            const token = await service.generatePasswordResetToken(MOCK_USER);
            expect(service.generateToken).toHaveBeenCalledWith(MOCK_USER, TokenType.PASSWORD_RESET);
            expect(token.token).toBe('reset');
        });
    });

    describe('generateApiToken', () => {
        it('should generate an API token', async () => {
            jest.spyOn(service, 'generateToken').mockResolvedValueOnce({ token: 'api', type: TokenType.API } as Token);
            const token = await service.generateApiToken(MOCK_USER);
            expect(service.generateToken).toHaveBeenCalledWith(MOCK_USER, TokenType.API, undefined);
            expect(token.token).toBe('api');
        });
    });
});
