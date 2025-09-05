import { AuthenticationService } from '../src/services/AuthenticationService';
import { TokenService } from '../src/services/TokenService';
import { User } from '../src/models/User';
import { Token, TokenType } from '../src/models/Token';
import { SystemRoles } from '../src/models/Role';
import { emailService } from '../src/services/EmailService';
import { findUserById, findUserByEmail, createUser, updateUser } from '../src/services/userService';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

// Mock external and internal dependencies
jest.mock('bcrypt');
jest.mock('uuid');
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('../src/services/TokenService');
jest.mock('../src/services/EmailService');
jest.mock('../src/services/userService');

describe('AuthenticationService', () => {
    let authService: AuthenticationService;
    let mockTokenService: jest.Mocked<TokenService>;
    let consoleErrorSpy: jest.SpyInstance;

    // Cast mocked functions
    const mockBcryptHash = bcrypt.hash as jest.Mock;
    const mockBcryptCompare = bcrypt.compare as jest.Mock;
    const mockUuidv4 = uuidv4 as jest.Mock;
    const mockSpeakeasyGenerateSecret = speakeasy.generateSecret as jest.Mock;
    const mockSpeakeasyTotpVerify = speakeasy.totp.verify as jest.Mock;
    const mockSpeakeasyOtpauthURL = speakeasy.otpauthURL as jest.Mock;
    const mockQRCodeToDataURL = QRCode.toDataURL as jest.Mock;
    const mockFindUserById = findUserById as jest.Mock;
    const mockFindUserByEmail = findUserByEmail as jest.Mock;
    const mockCreateUser = createUser as jest.Mock;
    const mockUpdateUser = updateUser as jest.Mock;
    const mockEmailService = emailService as jest.Mocked<typeof emailService>;

    const MOCK_USER_ID = 'user-123';
    const MOCK_USER_EMAIL = 'test@example.com';
    const MOCK_USERNAME = 'testuser';
    const MOCK_PASSWORD = 'password123';
    const MOCK_HASHED_PASSWORD = 'hashedpassword';
    const MOCK_ACCESS_TOKEN: Token = { token: 'access-token', type: TokenType.ACCESS, expiresAt: new Date(), jti: 'jti-access' } as Token;
    const MOCK_REFRESH_TOKEN: Token = { token: 'refresh-token', type: TokenType.REFRESH, expiresAt: new Date(), jti: 'jti-refresh' } as Token;
    const MOCK_VERIFICATION_TOKEN: Token = { token: 'verify-token', type: TokenType.VERIFICATION, expiresAt: new Date(), jti: 'jti-verify' } as Token;
    const MOCK_RESET_TOKEN: Token = { token: 'reset-token', type: TokenType.PASSWORD_RESET, expiresAt: new Date(), jti: 'jti-reset' } as Token;

    const MOCK_USER: User = {
        id: MOCK_USER_ID,
        username: MOCK_USERNAME,
        email: MOCK_USER_EMAIL,
        password: MOCK_HASHED_PASSWORD,
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

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock TokenService methods
        mockTokenService = new TokenService() as jest.Mocked<TokenService>;
        mockTokenService.generateTokenPair.mockResolvedValue({ accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN });
        mockTokenService.generateVerificationToken.mockResolvedValue(MOCK_VERIFICATION_TOKEN);
        mockTokenService.generatePasswordResetToken.mockResolvedValue(MOCK_RESET_TOKEN);
        mockTokenService.verifyToken.mockResolvedValue({ sub: MOCK_USER_ID, jti: 'mock-jti' });
        mockTokenService.revokeToken.mockResolvedValue(undefined);
        mockTokenService.revokeAllUserTokens.mockResolvedValue(undefined);
        mockTokenService.refreshAccessToken.mockResolvedValue(MOCK_ACCESS_TOKEN);

        // Mock userService methods
        mockFindUserByEmail.mockResolvedValue(null);
        mockFindUserById.mockResolvedValue(MOCK_USER);
        mockCreateUser.mockResolvedValue(MOCK_USER);
        mockUpdateUser.mockResolvedValue(MOCK_USER);

        // Mock bcrypt
        mockBcryptHash.mockResolvedValue(MOCK_HASHED_PASSWORD);
        mockBcryptCompare.mockResolvedValue(true);

        // Mock uuid
        mockUuidv4.mockReturnValue(MOCK_USER_ID);

        // Mock speakeasy
        mockSpeakeasyGenerateSecret.mockReturnValue({ base32: 'MOCK_MFA_SECRET' });
        mockSpeakeasyTotpVerify.mockReturnValue(true);
        mockSpeakeasyOtpauthURL.mockReturnValue('otpauth://totp/Stage7:test@example.com?secret=MOCK_MFA_SECRET&issuer=Stage7+Platform');

        // Mock QRCode
        mockQRCodeToDataURL.mockResolvedValue('data:image/png;base64,mockqrcode');

        // Mock emailService
        mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);
        mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);
        mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined);

        // Suppress console errors
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        authService = new AuthenticationService(mockTokenService);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('register', () => {
        it('should register a new user and send verification email', async () => {
            const userData = { username: MOCK_USERNAME, email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            const result = await authService.register(userData, true);

            expect(mockFindUserByEmail).toHaveBeenCalledWith(MOCK_USER_EMAIL);
            expect(mockBcryptHash).toHaveBeenCalledWith(MOCK_PASSWORD, 10);
            expect(mockUuidv4).toHaveBeenCalledTimes(1);
            expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
                id: MOCK_USER_ID,
                username: MOCK_USERNAME,
                email: MOCK_USER_EMAIL,
                password: MOCK_HASHED_PASSWORD,
                isEmailVerified: false,
                roles: [SystemRoles.USER],
            }));
            expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(MOCK_USER);
            expect(mockTokenService.generateVerificationToken).toHaveBeenCalledWith(MOCK_USER);
            expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(MOCK_USER_EMAIL, MOCK_VERIFICATION_TOKEN.token, MOCK_USERNAME);
            expect(result).toEqual(expect.objectContaining({
                user: MOCK_USER,
                accessToken: MOCK_ACCESS_TOKEN,
                refreshToken: MOCK_REFRESH_TOKEN,
                verificationToken: MOCK_VERIFICATION_TOKEN,
            }));
        });

        it('should register a new user without sending verification email', async () => {
            const userData = { username: MOCK_USERNAME, email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            const result = await authService.register(userData, false);

            expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
                isEmailVerified: true,
            }));
            expect(mockTokenService.generateVerificationToken).not.toHaveBeenCalled();
            expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
            expect(result.verificationToken).toBeUndefined();
        });

        it('should throw error if email is already registered', async () => {
            mockFindUserByEmail.mockResolvedValueOnce(MOCK_USER);
            const userData = { username: MOCK_USERNAME, email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await expect(authService.register(userData)).rejects.toThrow('Email is already registered');
            expect(mockCreateUser).not.toHaveBeenCalled();
        });

        it('should throw error if user creation fails', async () => {
            mockCreateUser.mockRejectedValueOnce(new Error('DB error'));
            const userData = { username: MOCK_USERNAME, email: MOCK_USER_EMAIL, password: MOCK_PASSWORD };
            await expect(authService.register(userData)).rejects.toThrow('DB error');
        });
    });

    describe('login', () => {
        it('should login user successfully', async () => {
            mockFindUserByEmail.mockResolvedValueOnce(MOCK_USER);
            const result = await authService.login(MOCK_USER_EMAIL, MOCK_PASSWORD);

            expect(mockFindUserByEmail).toHaveBeenCalledWith(MOCK_USER_EMAIL);
            expect(mockBcryptCompare).toHaveBeenCalledWith(MOCK_PASSWORD, MOCK_HASHED_PASSWORD);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                failedLoginAttempts: 0,
                lockoutUntil: undefined,
            }));
            expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(MOCK_USER, undefined);
            expect(result).toEqual(expect.objectContaining({
                user: MOCK_USER,
                accessToken: MOCK_ACCESS_TOKEN,
                refreshToken: MOCK_REFRESH_TOKEN,
            }));
        });

        it('should throw error for invalid email or password', async () => {
            mockFindUserByEmail.mockResolvedValueOnce(null); // User not found
            await expect(authService.login(MOCK_USER_EMAIL, MOCK_PASSWORD)).rejects.toThrow('Invalid email or password');
            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should increment failed login attempts and lock out user', async () => {
            const userWithAttempts = { ...MOCK_USER, failedLoginAttempts: authService['maxLoginAttempts'] - 1 };
            mockFindUserByEmail.mockResolvedValueOnce(userWithAttempts);
            mockBcryptCompare.mockResolvedValueOnce(false); // Invalid password

            await expect(authService.login(MOCK_USER_EMAIL, MOCK_PASSWORD)).rejects.toThrow('Invalid email or password');

            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                failedLoginAttempts: authService['maxLoginAttempts'],
                lockoutUntil: expect.any(Date),
            }));
        });

        it('should throw error if user account is disabled', async () => {
            const disabledUser = { ...MOCK_USER, isActive: false };
            mockFindUserByEmail.mockResolvedValueOnce(disabledUser);
            await expect(authService.login(MOCK_USER_EMAIL, MOCK_PASSWORD)).rejects.toThrow('User account is disabled');
        });

        it('should throw error if account is locked', async () => {
            const lockedUser = { ...MOCK_USER, lockoutUntil: new Date(Date.now() + 100000) };
            mockFindUserByEmail.mockResolvedValueOnce(lockedUser);
            await expect(authService.login(MOCK_USER_EMAIL, MOCK_PASSWORD)).rejects.toThrow('Account is locked');
        });
    });

    describe('logout', () => {
        it('should revoke a single token', async () => {
            await authService.logout(MOCK_USER_ID, MOCK_ACCESS_TOKEN.jti, false);
            expect(mockTokenService.revokeToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN.jti, 'User logout');
            expect(mockTokenService.revokeAllUserTokens).not.toHaveBeenCalled();
        });

        it('should revoke all user tokens', async () => {
            await authService.logout(MOCK_USER_ID, MOCK_ACCESS_TOKEN.jti, true);
            expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith(MOCK_USER_ID, 'User logout');
            expect(mockTokenService.revokeToken).not.toHaveBeenCalled();
        });

        it('should handle errors during logout', async () => {
            mockTokenService.revokeToken.mockRejectedValueOnce(new Error('Revoke error'));
            await expect(authService.logout(MOCK_USER_ID, MOCK_ACCESS_TOKEN.jti)).rejects.toThrow('Revoke error');
        });
    });

    describe('refreshToken', () => {
        it('should refresh access token successfully', async () => {
            const result = await authService.refreshToken(MOCK_REFRESH_TOKEN.token);
            expect(mockTokenService.refreshAccessToken).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN.token, undefined);
            expect(result).toEqual({ accessToken: MOCK_ACCESS_TOKEN });
        });

        it('should handle errors during token refresh', async () => {
            mockTokenService.refreshAccessToken.mockRejectedValueOnce(new Error('Refresh error'));
            await expect(authService.refreshToken(MOCK_REFRESH_TOKEN.token)).rejects.toThrow('Refresh error');
        });
    });

    describe('verifyEmail', () => {
        it('should verify email successfully', async () => {
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, jti: MOCK_VERIFICATION_TOKEN.jti });
            const user = { ...MOCK_USER, isEmailVerified: false };
            mockFindUserById.mockResolvedValueOnce(user);

            const result = await authService.verifyEmail(MOCK_VERIFICATION_TOKEN.token);

            expect(mockTokenService.verifyToken).toHaveBeenCalledWith(MOCK_VERIFICATION_TOKEN.token, TokenType.VERIFICATION);
            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                isEmailVerified: true,
                verificationToken: undefined,
            }));
            expect(mockTokenService.revokeToken).toHaveBeenCalledWith(MOCK_VERIFICATION_TOKEN.jti, 'Email verified');
            expect(result.isEmailVerified).toBe(true);
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.verifyEmail(MOCK_VERIFICATION_TOKEN.token)).rejects.toThrow('User not found');
        });

        it('should handle errors during email verification', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('Verify error'));
            await expect(authService.verifyEmail(MOCK_VERIFICATION_TOKEN.token)).rejects.toThrow('Verify error');
        });
    });

    describe('requestPasswordReset', () => {
        it('should request password reset successfully', async () => {
            mockFindUserByEmail.mockResolvedValueOnce(MOCK_USER);
            const result = await authService.requestPasswordReset(MOCK_USER_EMAIL);

            expect(mockFindUserByEmail).toHaveBeenCalledWith(MOCK_USER_EMAIL);
            expect(mockTokenService.generatePasswordResetToken).toHaveBeenCalledWith(MOCK_USER);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                resetPasswordToken: MOCK_RESET_TOKEN.token,
                resetPasswordExpires: MOCK_RESET_TOKEN.expiresAt,
            }));
            expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(MOCK_USER_EMAIL, MOCK_RESET_TOKEN.token, MOCK_USERNAME);
            expect(result).toBe(MOCK_RESET_TOKEN);
        });

        it('should throw error if user not found', async () => {
            mockFindUserByEmail.mockResolvedValueOnce(null);
            await expect(authService.requestPasswordReset(MOCK_USER_EMAIL)).rejects.toThrow('User not found');
        });

        it('should handle errors during password reset request', async () => {
            mockTokenService.generatePasswordResetToken.mockRejectedValueOnce(new Error('Generate error'));
            await expect(authService.requestPasswordReset(MOCK_USER_EMAIL)).rejects.toThrow('Generate error');
        });
    });

    describe('resetPassword', () => {
        const MOCK_NEW_PASSWORD = 'newpassword123';

        it('should reset password successfully', async () => {
            const userWithResetToken = { ...MOCK_USER, resetPasswordToken: MOCK_RESET_TOKEN.token, resetPasswordExpires: new Date(Date.now() + 100000) };
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, jti: MOCK_RESET_TOKEN.jti });
            mockFindUserById.mockResolvedValueOnce(userWithResetToken);
            mockBcryptHash.mockResolvedValueOnce('newhashedpassword');

            const result = await authService.resetPassword(MOCK_RESET_TOKEN.token, MOCK_NEW_PASSWORD);

            expect(mockTokenService.verifyToken).toHaveBeenCalledWith(MOCK_RESET_TOKEN.token, TokenType.PASSWORD_RESET);
            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockBcryptHash).toHaveBeenCalledWith(MOCK_NEW_PASSWORD, 10);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                password: 'newhashedpassword',
                resetPasswordToken: undefined,
                resetPasswordExpires: undefined,
            }));
            expect(mockTokenService.revokeToken).toHaveBeenCalledWith(MOCK_RESET_TOKEN.jti, 'Password reset');
            expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith(MOCK_USER_ID, 'Password reset');
            expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(MOCK_USER_EMAIL, MOCK_USERNAME);
            expect(result.password).toBe('newhashedpassword');
        });

        it('should throw error for invalid reset token', async () => {
            const userWithResetToken = { ...MOCK_USER, resetPasswordToken: 'wrong-token', resetPasswordExpires: new Date(Date.now() + 100000) };
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, jti: MOCK_RESET_TOKEN.jti });
            mockFindUserById.mockResolvedValueOnce(userWithResetToken);

            await expect(authService.resetPassword(MOCK_RESET_TOKEN.token, MOCK_NEW_PASSWORD)).rejects.toThrow('Invalid password reset token');
        });

        it('should throw error if reset token has expired', async () => {
            const userWithExpiredToken = { ...MOCK_USER, resetPasswordToken: MOCK_RESET_TOKEN.token, resetPasswordExpires: new Date(Date.now() - 100000) };
            mockTokenService.verifyToken.mockResolvedValueOnce({ sub: MOCK_USER_ID, jti: MOCK_RESET_TOKEN.jti });
            mockFindUserById.mockResolvedValueOnce(userWithExpiredToken);

            await expect(authService.resetPassword(MOCK_RESET_TOKEN.token, MOCK_NEW_PASSWORD)).rejects.toThrow('Password reset token has expired');
        });

        it('should handle errors during password reset', async () => {
            mockTokenService.verifyToken.mockRejectedValueOnce(new Error('Verify error'));
            await expect(authService.resetPassword(MOCK_RESET_TOKEN.token, MOCK_NEW_PASSWORD)).rejects.toThrow('Verify error');
        });
    });

    describe('changePassword', () => {
        const MOCK_NEW_PASSWORD = 'newpassword123';

        it('should change password successfully', async () => {
            mockFindUserById.mockResolvedValueOnce(MOCK_USER);
            mockBcryptCompare.mockResolvedValueOnce(true);
            mockBcryptHash.mockResolvedValueOnce('newhashedpassword');

            const result = await authService.changePassword(MOCK_USER_ID, MOCK_PASSWORD, MOCK_NEW_PASSWORD);

            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockBcryptCompare).toHaveBeenCalledWith(MOCK_PASSWORD, MOCK_HASHED_PASSWORD);
            expect(mockBcryptHash).toHaveBeenCalledWith(MOCK_NEW_PASSWORD, 10);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                password: 'newhashedpassword',
            }));
            expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith(MOCK_USER_ID, 'Password changed');
            expect(result.password).toBe('newhashedpassword');
        });

        it('should throw error for incorrect current password', async () => {
            mockFindUserById.mockResolvedValueOnce(MOCK_USER);
            mockBcryptCompare.mockResolvedValueOnce(false);

            await expect(authService.changePassword(MOCK_USER_ID, 'wrong-password', MOCK_NEW_PASSWORD)).rejects.toThrow('Current password is incorrect');
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.changePassword(MOCK_USER_ID, MOCK_PASSWORD, MOCK_NEW_PASSWORD)).rejects.toThrow('User not found');
        });

        it('should handle errors during password change', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.changePassword(MOCK_USER_ID, MOCK_PASSWORD, MOCK_NEW_PASSWORD)).rejects.toThrow('DB error');
        });
    });

    describe('enableMfa', () => {
        it('should enable MFA and return secret', async () => {
            mockFindUserById.mockResolvedValueOnce(MOCK_USER);
            const result = await authService.enableMfa(MOCK_USER_ID);

            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockSpeakeasyGenerateSecret).toHaveBeenCalledTimes(1);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                mfaSecret: 'MOCK_MFA_SECRET',
            }));
            expect(result).toBe('MOCK_MFA_SECRET');
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.enableMfa(MOCK_USER_ID)).rejects.toThrow('User not found');
        });

        it('should handle errors during MFA enable', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.enableMfa(MOCK_USER_ID)).rejects.toThrow('DB error');
        });
    });

    describe('verifyMfaSetup', () => {
        const MOCK_MFA_TOKEN = '123456';

        it('should verify MFA setup successfully', async () => {
            const userWithSecret = { ...MOCK_USER, mfaSecret: 'MOCK_MFA_SECRET', mfaEnabled: false };
            mockFindUserById.mockResolvedValueOnce(userWithSecret);

            const result = await authService.verifyMfaSetup(MOCK_USER_ID, MOCK_MFA_TOKEN);

            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockSpeakeasyTotpVerify).toHaveBeenCalledWith({
                secret: 'MOCK_MFA_SECRET',
                encoding: 'base32',
                token: MOCK_MFA_TOKEN,
                window: 1,
                step: 30,
            });
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                mfaEnabled: true,
            }));
            expect(result.mfaEnabled).toBe(true);
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.verifyMfaSetup(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('User not found');
        });

        it('should throw error if MFA is already enabled', async () => {
            const userMfaEnabled = { ...MOCK_USER, mfaEnabled: true };
            mockFindUserById.mockResolvedValueOnce(userMfaEnabled);
            await expect(authService.verifyMfaSetup(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('MFA is already enabled');
        });

        it('should throw error if MFA setup not initiated', async () => {
            const userNoSecret = { ...MOCK_USER, mfaSecret: undefined };
            mockFindUserById.mockResolvedValueOnce(userNoSecret);
            await expect(authService.verifyMfaSetup(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('MFA setup not initiated');
        });

        it('should throw error for invalid MFA token', async () => {
            mockSpeakeasyTotpVerify.mockReturnValueOnce(false);
            const userWithSecret = { ...MOCK_USER, mfaSecret: 'MOCK_MFA_SECRET', mfaEnabled: false };
            mockFindUserById.mockResolvedValueOnce(userWithSecret);
            await expect(authService.verifyMfaSetup(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('Invalid MFA token');
        });

        it('should handle errors during MFA setup verification', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.verifyMfaSetup(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('DB error');
        });
    });

    describe('disableMfa', () => {
        const MOCK_MFA_TOKEN = '123456';

        it('should disable MFA successfully', async () => {
            const userMfaEnabled = { ...MOCK_USER, mfaEnabled: true, mfaSecret: 'MOCK_MFA_SECRET' };
            mockFindUserById.mockResolvedValueOnce(userMfaEnabled);

            const result = await authService.disableMfa(MOCK_USER_ID, MOCK_MFA_TOKEN);

            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockSpeakeasyTotpVerify).toHaveBeenCalledWith('MOCK_MFA_SECRET', MOCK_MFA_TOKEN);
            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                mfaEnabled: false,
                mfaSecret: undefined,
            }));
            expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith(MOCK_USER_ID, 'MFA disabled');
            expect(result.mfaEnabled).toBe(false);
        });

        it('should throw error if MFA is not enabled', async () => {
            mockFindUserById.mockResolvedValueOnce(MOCK_USER);
            await expect(authService.disableMfa(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('MFA is not enabled');
        });

        it('should throw error for invalid MFA token', async () => {
            mockSpeakeasyTotpVerify.mockReturnValueOnce(false);
            const userMfaEnabled = { ...MOCK_USER, mfaEnabled: true, mfaSecret: 'MOCK_MFA_SECRET' };
            mockFindUserById.mockResolvedValueOnce(userMfaEnabled);
            await expect(authService.disableMfa(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('Invalid MFA token');
        });
    });

    describe('verifyMfaTokenForAuth', () => {
        const MOCK_MFA_TOKEN = '123456';

        it('should verify MFA token for authentication successfully', async () => {
            const userMfaEnabled = { ...MOCK_USER, mfaEnabled: true, mfaSecret: 'MOCK_MFA_SECRET' };
            mockFindUserById.mockResolvedValueOnce(userMfaEnabled);

            const result = await authService.verifyMfaTokenForAuth(MOCK_USER_ID, MOCK_MFA_TOKEN);

            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockSpeakeasyTotpVerify).toHaveBeenCalledWith('MOCK_MFA_SECRET', MOCK_MFA_TOKEN);
            expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(userMfaEnabled);
            expect(result).toEqual(expect.objectContaining({
                user: userMfaEnabled,
                accessToken: MOCK_ACCESS_TOKEN,
                refreshToken: MOCK_REFRESH_TOKEN,
            }));
        });

        it('should throw error if MFA is not enabled', async () => {
            mockFindUserById.mockResolvedValueOnce(MOCK_USER);
            await expect(authService.verifyMfaTokenForAuth(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('MFA is not enabled');
        });

        it('should throw error for invalid MFA token', async () => {
            mockSpeakeasyTotpVerify.mockReturnValueOnce(false);
            const userMfaEnabled = { ...MOCK_USER, mfaEnabled: true, mfaSecret: 'MOCK_MFA_SECRET' };
            mockFindUserById.mockResolvedValueOnce(userMfaEnabled);
            await expect(authService.verifyMfaTokenForAuth(MOCK_USER_ID, MOCK_MFA_TOKEN)).rejects.toThrow('Invalid MFA token');
        });
    });

    describe('generateMfaSecret', () => {
        it('should generate MFA secret', () => {
            const secret = (authService as any).generateMfaSecret();
            expect(mockSpeakeasyGenerateSecret).toHaveBeenCalledWith(expect.objectContaining({ name: 'Stage7', issuer: 'Stage7 Platform' }));
            expect(secret).toBe('MOCK_MFA_SECRET');
        });

        it('should handle errors during secret generation', () => {
            mockSpeakeasyGenerateSecret.mockImplementationOnce(() => { throw new Error('Speakeasy error'); });
            const secret = (authService as any).generateMfaSecret();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error generating MFA secret'), expect.any(Error));
            expect(secret).toBe('MOCK_MFA_SECRET'); // Fallback secret
        });
    });

    describe('verifyMfaToken', () => {
        it('should verify MFA token successfully', () => {
            const isValid = (authService as any).verifyMfaToken('MOCK_MFA_SECRET', '123456');
            expect(mockSpeakeasyTotpVerify).toHaveBeenCalledWith(expect.objectContaining({
                secret: 'MOCK_MFA_SECRET',
                token: '123456',
            }));
            expect(isValid).toBe(true);
        });

        it('should return false for invalid token', () => {
            mockSpeakeasyTotpVerify.mockReturnValueOnce(false);
            const isValid = (authService as any).verifyMfaToken('MOCK_MFA_SECRET', 'wrong-token');
            expect(isValid).toBe(false);
        });

        it('should return false if secret or token is missing', () => {
            expect((authService as any).verifyMfaToken('', '123456')).toBe(false);
            expect((authService as any).verifyMfaToken('secret', '')).toBe(false);
        });

        it('should handle errors during token verification', () => {
            mockSpeakeasyTotpVerify.mockImplementationOnce(() => { throw new Error('Speakeasy error'); });
            const isValid = (authService as any).verifyMfaToken('MOCK_MFA_SECRET', '123456');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error verifying MFA token'), expect.any(Error));
            expect(isValid).toBe(false);
        });
    });

    describe('generateMfaQrCode', () => {
        it('should generate MFA QR code successfully', async () => {
            mockFindUserById.mockResolvedValueOnce(MOCK_USER);
            const qrCode = await authService.generateMfaQrCode(MOCK_USER_ID, 'MOCK_MFA_SECRET');

            expect(mockFindUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockSpeakeasyOtpauthURL).toHaveBeenCalledWith(expect.objectContaining({
                secret: 'MOCK_MFA_SECRET',
                label: MOCK_USER_EMAIL,
                issuer: 'Stage7 Platform',
            }));
            expect(mockQRCodeToDataURL).toHaveBeenCalledWith(expect.any(String));
            expect(qrCode).toBe('data:image/png;base64,mockqrcode');
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.generateMfaQrCode(MOCK_USER_ID, 'MOCK_MFA_SECRET')).rejects.toThrow('User not found');
        });

        it('should handle errors during QR code generation', async () => {
            mockQRCodeToDataURL.mockRejectedValueOnce(new Error('QR code error'));
            await expect(authService.generateMfaQrCode(MOCK_USER_ID, 'MOCK_MFA_SECRET')).rejects.toThrow('Failed to generate MFA QR code');
        });
    });
});
