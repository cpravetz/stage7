import { Request, Response, NextFunction } from 'express';
import { register, login, logout, refreshToken, verifyToken, verifyMfaToken, verifyEmail, requestPasswordReset, resetPassword, changePassword, enableMfa, verifyMfaSetup, disableMfa } from '../src/controllers/authController';
import { AuthenticationService } from '../src/services/AuthenticationService';
import { TokenService } from '../src/services/TokenService';
import { User } from '../src/models/User';
import { Token, TokenType } from '../src/models/Token';
import { SystemRoles } from '../src/models/Role';

// Mock services and repositories that authController depends on
jest.mock('../src/services/AuthenticationService');
jest.mock('../src/services/TokenService');
jest.mock('../src/repositories/MongoUserRepository');
jest.mock('../src/repositories/MongoTokenRepository');
jest.mock('../src/repositories/MongoTokenBlacklistRepository');

describe('authController', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let consoleErrorSpy: jest.SpyInstance;

    // Mock instances of the services
    const mockAuthenticationService = new AuthenticationService(new TokenService()) as jest.Mocked<AuthenticationService>;
    const mockTokenService = new TokenService() as jest.Mocked<TokenService>;

    const MOCK_USER_ID = 'user-123';
    const MOCK_USER_EMAIL = 'test@example.com';
    const MOCK_USERNAME = 'testuser';
    const MOCK_PASSWORD = 'password123';
    const MOCK_ACCESS_TOKEN: Token = { token: 'access-token', type: TokenType.ACCESS, expiresAt: new Date(), jti: 'jti-access', sub: MOCK_USER_ID } as Token;
    const MOCK_REFRESH_TOKEN: Token = { token: 'refresh-token', type: TokenType.REFRESH, expiresAt: new Date(), jti: 'jti-refresh', sub: MOCK_USER_ID } as Token;
    const MOCK_VERIFICATION_TOKEN: Token = { token: 'verify-token', type: TokenType.VERIFICATION, expiresAt: new Date(), jti: 'jti-verify', sub: MOCK_USER_ID } as Token;
    const MOCK_RESET_TOKEN: Token = { token: 'reset-token', type: TokenType.PASSWORD_RESET, expiresAt: new Date(), jti: 'jti-reset', sub: MOCK_USER_ID } as Token;

    const MOCK_USER: User = {
        id: MOCK_USER_ID,
        username: MOCK_USERNAME,
        email: MOCK_USER_EMAIL,
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User',
        roles: [SystemRoles.USER],
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isEmailVerified: false,
        mfaEnabled: false,
        failedLoginAttempts: 0,
    };

    beforeAll(() => {
        // Manually set the mocked instances on the module's internal variables
        // This is a hacky way to inject mocks into module-scoped variables
        // In a real project, these services would be passed via dependency injection
        // or the module would export a factory function.
        const authControllerModule = jest.requireActual('../src/controllers/authController');
        authControllerModule.authenticationService = mockAuthenticationService;
        authControllerModule.tokenService = mockTokenService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = { body: {}, headers: {}, ip: '127.0.0.1' };
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        mockNext = jest.fn();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Default mock implementations for authenticationService
        mockAuthenticationService.register.mockResolvedValue({ user: MOCK_USER, accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN, verificationToken: MOCK_VERIFICATION_TOKEN });
        mockAuthenticationService.login.mockResolvedValue({ user: MOCK_USER, accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN });
        mockAuthenticationService.logout.mockResolvedValue(undefined);
        mockAuthenticationService.refreshToken.mockResolvedValue({ accessToken: MOCK_ACCESS_TOKEN });
        mockAuthenticationService.verifyEmail.mockResolvedValue(MOCK_USER);
        mockAuthenticationService.requestPasswordReset.mockResolvedValue(MOCK_RESET_TOKEN);
        mockAuthenticationService.resetPassword.mockResolvedValue(MOCK_USER);
        mockAuthenticationService.changePassword.mockResolvedValue(MOCK_USER);
        mockAuthenticationService.enableMfa.mockResolvedValue('MOCK_MFA_SECRET');
        mockAuthenticationService.verifyMfaSetup.mockResolvedValue(MOCK_USER);
        mockAuthenticationService.disableMfa.mockResolvedValue(MOCK_USER);
        mockAuthenticationService.verifyMfaTokenForAuth.mockResolvedValue({ user: MOCK_USER, accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN });

        // Default mock implementations for tokenService
        mockTokenService.verifyToken.mockResolvedValue({ sub: MOCK_USER_ID, jti: 'mock-jti', roles: ['user'], permissions: [] });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('register', () => {
        it('should register a user successfully', async () => {
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD, firstName: 'John', lastName: 'Doe' };
            await register(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.register).toHaveBeenCalledWith(expect.objectContaining({
                email: MOCK_USER_EMAIL,
                password: MOCK_PASSWORD,
                firstName: 'John',
                lastName: 'Doe',
            }), false);
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Registration successful',
                accessToken: MOCK_ACCESS_TOKEN.token,
                refreshToken: MOCK_REFRESH_TOKEN.token,
                user: expect.objectContaining({ email: MOCK_USER_EMAIL }),
            }));
        });

        it('should handle name field for registration', async () => {
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD, name: 'Jane Doe' };
            await register(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.register).toHaveBeenCalledWith(expect.objectContaining({
                firstName: 'Jane',
                lastName: 'Doe',
            }), false);
        });

        it('should return 400 if email or password is missing', async () => {
            mockReq.body = { email: MOCK_USER_EMAIL };
            await register(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Email and password are required' });
        });

        it('should return 400 if email is already registered', async () => {
            mockAuthenticationService.register.mockRejectedValueOnce(new Error('Email is already registered'));
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await register(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Email is already registered' });
        });

        it('should return 500 for other registration errors', async () => {
            mockAuthenticationService.register.mockRejectedValueOnce(new Error('DB error'));
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await register(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error registering user' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Registration error'), expect.any(Error));
        });
    });

    describe('login', () => {
        it('should login user successfully', async () => {
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await login(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.login).toHaveBeenCalledWith(MOCK_USER_EMAIL, MOCK_PASSWORD, expect.objectContaining({ ip: '127.0.0.1' }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Login successful',
                accessToken: MOCK_ACCESS_TOKEN.token,
                refreshToken: MOCK_REFRESH_TOKEN.token,
                user: expect.objectContaining({ email: MOCK_USER_EMAIL }),
            }));
        });

        it('should return 400 for invalid request body', async () => {
            mockReq.body = null;
            await login(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid request body' });
        });

        it('should return 400 if email or password is missing', async () => {
            mockReq.body = { email: MOCK_USER_EMAIL };
            await login(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Missing email or password' });
        });

        it('should return 401 for invalid email or password', async () => {
            mockAuthenticationService.login.mockRejectedValueOnce(new Error('Invalid email or password'));
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await login(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid email or password' });
        });

        it('should return 403 if account is locked', async () => {
            mockAuthenticationService.login.mockRejectedValueOnce(new Error('Account is locked. Try again after some date'));
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await login(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Account is locked. Try again after some date' });
        });

        it('should return 200 with MFA required if MFA is enabled', async () => {
            const userWithMfa = { ...MOCK_USER, mfaEnabled: true };
            mockAuthenticationService.login.mockResolvedValueOnce({ user: userWithMfa, accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN });
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await login(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'MFA required',
                requireMfa: true,
                userId: MOCK_USER_ID,
                tempToken: MOCK_ACCESS_TOKEN.token,
            }));
        });

        it('should return 500 for other login errors', async () => {
            mockAuthenticationService.login.mockRejectedValueOnce(new Error('DB error'));
            mockReq.body = { email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await login(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error during login' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Login error'), expect.any(Error));
        });
    });

    describe('logout', () => {
        it('should logout user successfully', async () => {
            mockReq.user = { sub: MOCK_USER_ID, jti: 'mock-jti' };
            mockReq.body = { revokeAll: false };
            await logout(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.logout).toHaveBeenCalledWith(MOCK_USER_ID, 'mock-jti', false);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Logout successful' });
        });

        it('should return 401 if user is not authenticated', async () => {
            mockReq.user = undefined;
            await logout(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 500 for logout errors', async () => {
            mockAuthenticationService.logout.mockRejectedValueOnce(new Error('Logout error'));
            mockReq.user = { sub: MOCK_USER_ID, jti: 'mock-jti' };
            await logout(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error during logout' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Logout error'), expect.any(Error));
        });
    });

    describe('refreshToken', () => {
        it('should refresh token successfully', async () => {
            mockReq.body = { refreshToken: MOCK_REFRESH_TOKEN.token };
            await refreshToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.refreshToken).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN.token, expect.objectContaining({ ip: '127.0.0.1' }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Token refreshed successfully', accessToken: MOCK_ACCESS_TOKEN.token });
        });

        it('should return 400 if refresh token is missing', async () => {
            mockReq.body = {};
            await refreshToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Refresh token is required' });
        });

        it('should return 401 for invalid or expired refresh token', async () => {
            mockAuthenticationService.refreshToken.mockRejectedValueOnce(new Error('Invalid or expired token'));
            mockReq.body = { refreshToken: 'invalid-token' };
            await refreshToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid or expired refresh token' });
        });

        it('should return 500 for other refresh token errors', async () => {
            mockAuthenticationService.refreshToken.mockRejectedValueOnce(new Error('DB error'));
            mockReq.body = { refreshToken: 'valid-token' };
            await refreshToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error refreshing token' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Token refresh error'), expect.any(Error));
        });
    });

    describe('verifyToken', () => {
        it('should verify token successfully', async () => {
            mockReq.headers = { authorization: 'Bearer valid-token' };
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockTokenService.verifyToken).toHaveBeenCalledWith('valid-token', TokenType.ACCESS);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                valid: true,
                user: { id: MOCK_USER_ID, roles: ['user'], permissions: [] },
            }));
        });

        it('should return 401 if no Authorization header', async () => {
            mockReq.headers = {};
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ valid: false, message: 'No Authorization header provided' });
        });

        it('should return 401 if no token in Authorization header', async () => {
            mockReq.headers = { authorization: 'Bearer' };
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ valid: false, message: 'No token provided in Authorization header' });
        });

        it('should return 401 if token is blacklisted or revoked', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('Token is blacklisted'));
            mockReq.headers = { authorization: 'Bearer blacklisted-token' };
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ valid: false, message: 'Token has been revoked' });
        });

        it('should return 401 if token is expired', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('jwt expired'));
            mockReq.headers = { authorization: 'Bearer expired-token' };
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ valid: false, message: 'Token has expired' });
        });

        it('should return 401 for other invalid token errors', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('Invalid signature'));
            mockReq.headers = { authorization: 'Bearer invalid-token' };
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ valid: false, message: 'Invalid token' });
        });

        it('should return 500 for internal verification errors', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('DB error'));
            mockReq.headers = { authorization: 'Bearer token' };
            await verifyToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ valid: false, message: 'Error verifying token' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Token verification error'), expect.any(Error));
        });
    });

    describe('verifyMfaToken', () => {
        it('should verify MFA token successfully', async () => {
            mockReq.body = { userId: MOCK_USER_ID, token: '123456' };
            await verifyMfaToken(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.verifyMfaTokenForAuth).toHaveBeenCalledWith(MOCK_USER_ID, '123456');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'MFA verification successful',
                accessToken: MOCK_ACCESS_TOKEN.token,
                refreshToken: MOCK_REFRESH_TOKEN.token,
                user: expect.objectContaining({ id: MOCK_USER_ID }),
            }));
        });

        it('should return 400 if userId or token is missing', async () => {
            mockReq.body = { userId: MOCK_USER_ID };
            await verifyMfaToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'User ID and MFA token are required' });
        });

        it('should return 401 for invalid MFA token', async () => {
            mockAuthenticationService.verifyMfaTokenForAuth.mockRejectedValueOnce(new Error('Invalid MFA token'));
            mockReq.body = { userId: MOCK_USER_ID, token: 'wrong' };
            await verifyMfaToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid MFA token' });
        });

        it('should return 500 for other MFA verification errors', async () => {
            mockAuthenticationService.verifyMfaTokenForAuth.mockRejectedValueOnce(new Error('DB error'));
            mockReq.body = { userId: MOCK_USER_ID, token: '123456' };
            await verifyMfaToken(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error verifying MFA token' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('MFA verification error'), expect.any(Error));
        });
    });

    describe('verifyEmail', () => {
        it('should verify email successfully', async () => {
            mockReq.body = { token: MOCK_VERIFICATION_TOKEN.token };
            await verifyEmail(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.verifyEmail).toHaveBeenCalledWith(MOCK_VERIFICATION_TOKEN.token);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Email verified successfully',
                user: expect.objectContaining({ id: MOCK_USER_ID }),
            }));
        });

        it('should return 400 if token is missing', async () => {
            mockReq.body = {};
            await verifyEmail(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Verification token is required' });
        });

        it('should return 401 for invalid or expired token', async () => {
            mockAuthenticationService.verifyEmail.mockRejectedValueOnce(new Error('Invalid or expired token'));
            mockReq.body = { token: 'invalid' };
            await verifyEmail(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid or expired verification token' });
        });

        it('should return 500 for other email verification errors', async () => {
            mockAuthenticationService.verifyEmail.mockRejectedValueOnce(new Error('DB error'));
            mockReq.body = { token: 'valid' };
            await verifyEmail(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error verifying email' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Email verification error'), expect.any(Error));
        });
    });

    describe('requestPasswordReset', () => {
        it('should request password reset successfully and always return 200', async () => {
            mockReq.body = { email: MOCK_USER_EMAIL };
            await requestPasswordReset(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.requestPasswordReset).toHaveBeenCalledWith(MOCK_USER_EMAIL);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Password reset email sent' });
        });

        it('should return 400 if email is missing', async () => {
            mockReq.body = {};
            await requestPasswordReset(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Email is required' });
        });

        it('should return 200 even if authenticationService throws an error', async () => {
            mockAuthenticationService.requestPasswordReset.mockRejectedValueOnce(new Error('User not found'));
            mockReq.body = { email: MOCK_USER_EMAIL };
            await requestPasswordReset(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Password reset email sent' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Password reset request error'), expect.any(Error));
        });
    });

    describe('resetPassword', () => {
        const MOCK_NEW_PASSWORD = 'newpassword123';

        it('should reset password successfully', async () => {
            mockReq.body = { token: MOCK_RESET_TOKEN.token, newPassword: MOCK_NEW_PASSWORD };
            await resetPassword(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.resetPassword).toHaveBeenCalledWith(MOCK_RESET_TOKEN.token, MOCK_NEW_PASSWORD);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Password reset successful' });
        });

        it('should return 400 if token or newPassword is missing', async () => {
            mockReq.body = { token: MOCK_RESET_TOKEN.token };
            await resetPassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Token and new password are required' });
        });

        it('should return 401 for invalid or expired token', async () => {
            mockAuthenticationService.resetPassword.mockRejectedValueOnce(new Error('Invalid password reset token'));
            mockReq.body = { token: 'invalid', newPassword: MOCK_NEW_PASSWORD };
            await resetPassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid or expired password reset token' });
        });

        it('should return 401 if token has expired', async () => {
            mockAuthenticationService.resetPassword.mockRejectedValueOnce(new Error('Password reset token has expired'));
            mockReq.body = { token: 'expired', newPassword: MOCK_NEW_PASSWORD };
            await resetPassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Password reset token has expired' });
        });

        it('should return 500 for other reset password errors', async () => {
            mockAuthenticationService.resetPassword.mockRejectedValueOnce(new Error('DB error'));
            mockReq.body = { token: MOCK_RESET_TOKEN.token, newPassword: MOCK_NEW_PASSWORD };
            await resetPassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error resetting password' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Password reset error'), expect.any(Error));
        });
    });

    describe('changePassword', () => {
        const MOCK_CURRENT_PASSWORD = 'oldpassword';
        const MOCK_NEW_PASSWORD = 'newpassword';

        it('should change password successfully', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { currentPassword: MOCK_CURRENT_PASSWORD, newPassword: MOCK_NEW_PASSWORD };
            await changePassword(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.changePassword).toHaveBeenCalledWith(MOCK_USER_ID, MOCK_CURRENT_PASSWORD, MOCK_NEW_PASSWORD);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Password changed successfully' });
        });

        it('should return 401 if user is not authenticated', async () => {
            mockReq.user = undefined;
            await changePassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 400 if current or new password is missing', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { currentPassword: MOCK_CURRENT_PASSWORD };
            await changePassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Current password and new password are required' });
        });

        it('should return 401 for incorrect current password', async () => {
            mockAuthenticationService.changePassword.mockRejectedValueOnce(new Error('Current password is incorrect'));
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { currentPassword: MOCK_CURRENT_PASSWORD, newPassword: MOCK_NEW_PASSWORD };
            await changePassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Current password is incorrect' });
        });

        it('should return 500 for other password change errors', async () => {
            mockAuthenticationService.changePassword.mockRejectedValueOnce(new Error('DB error'));
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { currentPassword: MOCK_CURRENT_PASSWORD, newPassword: MOCK_NEW_PASSWORD };
            await changePassword(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error changing password' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Password change error'), expect.any(Error));
        });
    });

    describe('enableMfa', () => {
        it('should enable MFA successfully', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            await enableMfa(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.enableMfa).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'MFA setup initiated',
                mfaSecret: 'MOCK_MFA_SECRET',
                qrCodeUrl: expect.any(String),
            }));
        });

        it('should return 401 if user is not authenticated', async () => {
            mockReq.user = undefined;
            await enableMfa(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 500 for MFA setup errors', async () => {
            mockAuthenticationService.enableMfa.mockRejectedValueOnce(new Error('DB error'));
            mockReq.user = { sub: MOCK_USER_ID };
            await enableMfa(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error setting up MFA' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('MFA setup error'), expect.any(Error));
        });
    });

    describe('verifyMfaSetup', () => {
        it('should verify MFA setup successfully', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { token: '123456' };
            await verifyMfaSetup(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.verifyMfaSetup).toHaveBeenCalledWith(MOCK_USER_ID, '123456');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'MFA setup verified successfully' });
        });

        it('should return 401 if user is not authenticated', async () => {
            mockReq.user = undefined;
            await verifyMfaSetup(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 400 if token is missing', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = {};
            await verifyMfaSetup(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'MFA token is required' });
        });

        it('should return 401 for invalid MFA token', async () => {
            mockAuthenticationService.verifyMfaSetup.mockRejectedValueOnce(new Error('Invalid MFA token'));
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { token: 'wrong' };
            await verifyMfaSetup(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid MFA token' });
        });

        it('should return 500 for other MFA setup verification errors', async () => {
            mockAuthenticationService.verifyMfaSetup.mockRejectedValueOnce(new Error('DB error'));
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { token: '123456' };
            await verifyMfaSetup(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error verifying MFA setup' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('MFA setup verification error'), expect.any(Error));
        });
    });

    describe('disableMfa', () => {
        it('should disable MFA successfully', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { token: '123456' };
            await disableMfa(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthenticationService.disableMfa).toHaveBeenCalledWith(MOCK_USER_ID, '123456');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'MFA disabled successfully' });
        });

        it('should return 401 if user is not authenticated', async () => {
            mockReq.user = undefined;
            await disableMfa(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
        });

        it('should return 400 if token is missing', async () => {
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = {};
            await disableMfa(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'MFA token is required' });
        });

        it('should return 401 for invalid MFA token', async () => {
            mockAuthenticationService.disableMfa.mockRejectedValueOnce(new Error('Invalid MFA token'));
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { token: 'wrong' };
            await disableMfa(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid MFA token' });
        });

        it('should return 500 for other MFA disable errors', async () => {
            mockAuthenticationService.disableMfa.mockRejectedValueOnce(new Error('DB error'));
            mockReq.user = { sub: MOCK_USER_ID };
            mockReq.body = { token: '123456' };
            await disableMfa(mockReq as Request, mockRes as Response, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Error disabling MFA' });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('MFA disable error'), expect.any(Error));
        });
    });
});
