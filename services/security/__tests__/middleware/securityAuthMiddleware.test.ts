import { Request, Response, NextFunction } from 'express';
import { authenticate, authorize, authorizeRoles, isAuthenticated, requireEmailVerification, requireMfa } from '../src/middleware/securityAuthMiddleware';
import { TokenService } from '../src/services/TokenService';
import { AuthorizationService } from '../src/services/AuthorizationService';
import { TokenType } from '../src/models/Token';
import { User } from '../src/models/User';
import { findUserById } from '../src/services/userService';

// Mock external dependencies
jest.mock('../src/services/TokenService');
jest.mock('../src/services/AuthorizationService');
jest.mock('../src/services/userService');
jest.mock('../src/repositories/MongoUserRepository'); // For checkMfaCompleted dynamic import
jest.mock('../src/repositories/MongoTokenRepository'); // For checkMfaCompleted dynamic import
jest.mock('../src/repositories/MongoTokenBlacklistRepository'); // For checkMfaCompleted dynamic import

describe('securityAuthMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let mockTokenService: jest.Mocked<TokenService>;
    let mockAuthorizationService: jest.Mocked<AuthorizationService>;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_USER_ID = 'user-123';
    const MOCK_ACCESS_TOKEN = 'mock-access-token';
    const MOCK_DECODED_PAYLOAD = { sub: MOCK_USER_ID, jti: 'mock-jti', roles: ['user'], permissions: [] };
    const MOCK_USER: User = { id: MOCK_USER_ID, isEmailVerified: true, mfaEnabled: false } as User;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = { headers: {}, user: undefined };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockTokenService = new TokenService() as jest.Mocked<TokenService>;
        mockTokenService.verifyToken.mockResolvedValue(MOCK_DECODED_PAYLOAD);

        mockAuthorizationService = new AuthorizationService() as jest.Mocked<AuthorizationService>;
        mockAuthorizationService.hasPermission.mockResolvedValue(true);
        mockAuthorizationService.hasRole.mockResolvedValue(true);

        (findUserById as jest.Mock).mockResolvedValue(MOCK_USER);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('authenticate', () => {
        it('should authenticate successfully with a valid token', async () => {
            mockReq.headers = { authorization: `Bearer ${MOCK_ACCESS_TOKEN}` };
            const middleware = authenticate(mockTokenService);
            await middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockTokenService.verifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN, TokenType.ACCESS);
            expect(mockReq.user).toEqual(expect.objectContaining({ id: MOCK_USER_ID }));
            expect(mockReq.accessToken).toBe(MOCK_ACCESS_TOKEN);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if no Authorization header', async () => {
            const middleware = authenticate(mockTokenService);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 401 if token is missing from header', async () => {
            mockReq.headers = { authorization: 'Bearer ' };
            const middleware = authenticate(mockTokenService);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 401 if token verification fails', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('Invalid token'));
            mockReq.headers = { authorization: `Bearer ${MOCK_ACCESS_TOKEN}` };
            const middleware = authenticate(mockTokenService);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
        });

        it('should return 500 for unexpected errors', async () => {
            mockTokenService.verifyToken.mockImplementationOnce(() => { throw new Error('Unexpected error'); });
            mockReq.headers = { authorization: `Bearer ${MOCK_ACCESS_TOKEN}` };
            const middleware = authenticate(mockTokenService);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authentication error'), expect.any(Error));
        });
    });

    describe('authorize', () => {
        const REQUIRED_PERMISSION = 'user:read';

        it('should authorize successfully if user has permission', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            mockAuthorizationService.hasPermission.mockResolvedValueOnce(true);
            const middleware = authorize(mockAuthorizationService, REQUIRED_PERMISSION);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockAuthorizationService.hasPermission).toHaveBeenCalledWith(MOCK_USER_ID, REQUIRED_PERMISSION, expect.any(Object));
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if user is not authenticated', async () => {
            const middleware = authorize(mockAuthorizationService, REQUIRED_PERMISSION);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 403 if user does not have permission', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            mockAuthorizationService.hasPermission.mockResolvedValueOnce(false);
            const middleware = authorize(mockAuthorizationService, REQUIRED_PERMISSION);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Insufficient permissions' });
        });

        it('should return 500 for authorization errors', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            mockAuthorizationService.hasPermission.mockRejectedValueOnce(new Error('DB error'));
            const middleware = authorize(mockAuthorizationService, REQUIRED_PERMISSION);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authorization error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authorization error'), expect.any(Error));
        });
    });

    describe('authorizeRoles', () => {
        const REQUIRED_ROLES = ['admin', 'editor'];

        it('should authorize successfully if user has any required role', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            mockAuthorizationService.hasRole.mockResolvedValueOnce(false); // First role not found
            mockAuthorizationService.hasRole.mockResolvedValueOnce(true); // Second role found
            const middleware = authorizeRoles(mockAuthorizationService, REQUIRED_ROLES);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockAuthorizationService.hasRole).toHaveBeenCalledWith(MOCK_USER_ID, 'admin');
            expect(mockAuthorizationService.hasRole).toHaveBeenCalledWith(MOCK_USER_ID, 'editor');
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if user is not authenticated', async () => {
            const middleware = authorizeRoles(mockAuthorizationService, REQUIRED_ROLES);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 403 if user does not have any required role', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            mockAuthorizationService.hasRole.mockResolvedValue(false);
            const middleware = authorizeRoles(mockAuthorizationService, REQUIRED_ROLES);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Insufficient permissions' });
        });

        it('should return 500 for authorization errors', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            mockAuthorizationService.hasRole.mockRejectedValueOnce(new Error('DB error'));
            const middleware = authorizeRoles(mockAuthorizationService, REQUIRED_ROLES);
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authorization error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authorization error'), expect.any(Error));
        });
    });

    describe('isAuthenticated', () => {
        it('should call next if user is authenticated', () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            isAuthenticated(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if user is not authenticated', () => {
            isAuthenticated(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });
    });

    describe('requireEmailVerification', () => {
        it('should call next if email is verified', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            (findUserById as jest.Mock).mockResolvedValueOnce({ ...MOCK_USER, isEmailVerified: true });
            const middleware = requireEmailVerification();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if user is not authenticated', async () => {
            const middleware = requireEmailVerification();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 403 if email is not verified', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            (findUserById as jest.Mock).mockResolvedValueOnce({ ...MOCK_USER, isEmailVerified: false });
            const middleware = requireEmailVerification();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Email verification required' });
        });

        it('should return 500 for errors during email verification check', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            (findUserById as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
            const middleware = requireEmailVerification();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authorization error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authorization error'), expect.any(Error));
        });
    });

    describe('requireMfa', () => {
        it('should call next if MFA is not enabled', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            (findUserById as jest.Mock).mockResolvedValueOnce({ ...MOCK_USER, mfaEnabled: false });
            const middleware = requireMfa();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should call next if MFA is enabled and completed', async () => {
            mockReq.user = { id: MOCK_USER_ID, accessToken: MOCK_ACCESS_TOKEN } as User;
            (findUserById as jest.Mock).mockResolvedValueOnce({ ...MOCK_USER, mfaEnabled: true });
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, type: TokenType.ACCESS });
            const middleware = requireMfa();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
        });

        it('should return 401 if user is not authenticated', async () => {
            const middleware = requireMfa();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 403 if MFA is enabled but not completed', async () => {
            mockReq.user = { id: MOCK_USER_ID, accessToken: MOCK_ACCESS_TOKEN } as User;
            (findUserById as jest.Mock).mockResolvedValueOnce({ ...MOCK_USER, mfaEnabled: true });
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: 'wrong-user', type: TokenType.ACCESS }); // Simulate MFA not completed
            const middleware = requireMfa();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'MFA verification required' });
        });

        it('should return 500 for errors during MFA check', async () => {
            mockReq.user = { id: MOCK_USER_ID } as User;
            (findUserById as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
            const middleware = requireMfa();
            await middleware(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authorization error' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authorization error'), expect.any(Error));
        });
    });
});
