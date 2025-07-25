import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from '../models/User';
import { TokenService } from './TokenService';
import { Token, TokenType } from '../models/Token';
import { SystemRoles } from '../models/Role';
import { emailService } from './EmailService';
import { analyzeError } from '@cktmcs/errorhandler';
import { findUserById, findUserByEmail, createUser, updateUser } from './userService';

/**
 * Authentication service
 */
export class AuthenticationService {
    private tokenService: TokenService;
    private maxLoginAttempts: number;
    private lockoutDuration: number; // In minutes

    /**
     * Constructor
     * @param tokenService Token service
     * @param maxLoginAttempts Maximum login attempts before lockout
     * @param lockoutDuration Lockout duration in minutes
     */
    constructor(
        tokenService: TokenService = new TokenService(),
        maxLoginAttempts: number = 5,
        lockoutDuration: number = 30
    ) {
        this.tokenService = tokenService;
        this.maxLoginAttempts = maxLoginAttempts;
        this.lockoutDuration = lockoutDuration;
    }

    /**
     * Register a new user
     * @param userData User data
     * @param sendVerificationEmail Whether to send verification email
     * @returns User and tokens
     */
    async register(
        userData: Partial<User>,
        sendVerificationEmail: boolean = true
    ): Promise<{ user: User; accessToken: Token; refreshToken: Token; verificationToken?: Token }> {
        try {
            // Check if email is already registered
            if (userData.email) {
                const existingUser = await findUserByEmail(userData.email);
                if (existingUser) {
                    throw new Error('Email is already registered');
                }
            }

            // Hash password
            let hashedPassword: string | undefined;
            if (userData.password) {
                hashedPassword = await bcrypt.hash(userData.password, 10);
            }

            // Create user data
            const newUserData: Partial<User> = {
                id: uuidv4(),
                username: userData.username || '',
                email: userData.email || '',
                password: hashedPassword,
                firstName: userData.firstName,
                lastName: userData.lastName,
                roles: userData.roles || [SystemRoles.USER],
                permissions: userData.permissions || [],
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true,
                isEmailVerified: !sendVerificationEmail,
                mfaEnabled: false,
                failedLoginAttempts: 0
            };

            // Save user
            const user = await createUser(newUserData);

            // Generate tokens
            const { accessToken, refreshToken } = await this.tokenService.generateTokenPair(user);

            // Generate verification token if needed
            let verificationToken: Token | undefined;
            if (sendVerificationEmail) {
                verificationToken = await this.tokenService.generateVerificationToken(user);

                // Send verification email
                if (verificationToken) {
                    await emailService.sendVerificationEmail(
                        user.email,
                        verificationToken.token,
                        user.username || user.email.split('@')[0]
                    );
                }
            }

            return { user, accessToken, refreshToken, verificationToken };
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Login a user
     * @param email Email
     * @param password Password
     * @param clientInfo Client information
     * @returns User and tokens
     */
    async login(
        email: string,
        password: string,
        clientInfo?: Token['clientInfo']
    ): Promise<{ user: User; accessToken: Token; refreshToken: Token }> {
        try {
            console.log('AuthenticationService.login called for email:', email);

            // Find user by email
            const user = await findUserByEmail(email);
            console.log('User lookup result:', user ? 'User found' : 'User not found');

            if (!user) {
                console.log('Login failed: User not found for email:', email);
                throw new Error('Invalid email or password');
            }

            // Check if user is active
            if (!user.isActive) {
                throw new Error('User account is disabled');
            }

            // Check if user is locked out
            if (user.lockoutUntil && user.lockoutUntil > new Date()) {
                throw new Error(`Account is locked. Try again after ${user.lockoutUntil.toLocaleString()}`);
            }

            // Check password
            if (!user.password) {
                throw new Error('User has no password set');
            }

            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                // Increment failed login attempts
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

                // Lock account if too many failed attempts
                if (user.failedLoginAttempts >= this.maxLoginAttempts) {
                    user.lockoutUntil = new Date(Date.now() + this.lockoutDuration * 60 * 1000);
                }

                user.updatedAt = new Date();
                await updateUser(user.id, user);

                throw new Error('Invalid email or password');
            }

            // Reset failed login attempts
            user.failedLoginAttempts = 0;
            user.lockoutUntil = undefined;
            user.lastLogin = new Date();
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            // Generate tokens
            const { accessToken, refreshToken } = await this.tokenService.generateTokenPair(user, clientInfo);

            return { user, accessToken, refreshToken };
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Logout a user
     * @param userId User ID
     * @param tokenId Token ID to revoke
     * @param revokeAll Whether to revoke all user tokens
     */
    async logout(userId: string, tokenId: string, revokeAll: boolean = false): Promise<void> {
        try {
            if (revokeAll) {
                await this.tokenService.revokeAllUserTokens(userId, 'User logout');
            } else {
                await this.tokenService.revokeToken(tokenId, 'User logout');
            }
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Refresh an access token
     * @param refreshToken Refresh token
     * @param clientInfo Client information
     * @returns New access token
     */
    async refreshToken(
        refreshToken: string,
        clientInfo?: Token['clientInfo']
    ): Promise<{ accessToken: Token }> {
        try {
            const accessToken = await this.tokenService.refreshAccessToken(refreshToken, clientInfo);
            return { accessToken };
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Verify a user's email
     * @param token Verification token
     * @returns User
     */
    async verifyEmail(token: string): Promise<User> {
        try {
            // Verify token
            const payload = await this.tokenService.verifyToken(token, TokenType.VERIFICATION);

            // Find user
            const user = await findUserById(payload.sub);
            if (!user) {
                throw new Error('User not found');
            }

            // Update user
            user.isEmailVerified = true;
            user.verificationToken = undefined;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            // Revoke token
            await this.tokenService.revokeToken(payload.jti, 'Email verified');

            return user;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Request a password reset
     * @param email Email
     * @returns Password reset token
     */
    async requestPasswordReset(email: string): Promise<Token> {
        try {
            // Find user by email
            const user = await findUserByEmail(email);
            if (!user) {
                throw new Error('User not found');
            }

            // Generate password reset token
            const resetToken = await this.tokenService.generatePasswordResetToken(user);

            // Update user
            user.resetPasswordToken = resetToken.token;
            user.resetPasswordExpires = resetToken.expiresAt;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            // Send password reset email
            await emailService.sendPasswordResetEmail(
                user.email,
                resetToken.token,
                user.username || user.email.split('@')[0]
            );

            return resetToken;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Reset a password
     * @param token Password reset token
     * @param newPassword New password
     * @returns User
     */
    async resetPassword(token: string, newPassword: string): Promise<User> {
        try {
            // Verify token
            const payload = await this.tokenService.verifyToken(token, TokenType.PASSWORD_RESET);

            // Find user
            const user = await findUserById(payload.sub);
            if (!user) {
                throw new Error('User not found');
            }

            // Check if token matches
            if (user.resetPasswordToken !== token) {
                throw new Error('Invalid password reset token');
            }

            // Check if token is expired
            if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
                throw new Error('Password reset token has expired');
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // Update user
            user.password = hashedPassword;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            // Revoke token
            await this.tokenService.revokeToken(payload.jti, 'Password reset');

            // Revoke all user tokens
            await this.tokenService.revokeAllUserTokens(user.id, 'Password reset');

            // Send welcome email after successful password reset
            await emailService.sendWelcomeEmail(
                user.email,
                user.username || user.email.split('@')[0]
            );

            return user;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Change a password
     * @param userId User ID
     * @param currentPassword Current password
     * @param newPassword New password
     * @returns User
     */
    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<User> {
        try {
            // Find user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Check current password
            if (!user.password) {
                throw new Error('User has no password set');
            }

            const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
            if (!isPasswordValid) {
                throw new Error('Current password is incorrect');
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // Update user
            user.password = hashedPassword;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            // Revoke all user tokens except current
            await this.tokenService.revokeAllUserTokens(user.id, 'Password changed');

            return user;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Enable multi-factor authentication
     * @param userId User ID
     * @returns MFA secret
     */
    async enableMfa(userId: string): Promise<string> {
        try {
            // Find user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Generate MFA secret
            const mfaSecret = this.generateMfaSecret();

            // Update user
            user.mfaSecret = mfaSecret;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            return mfaSecret;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Verify MFA setup
     * @param userId User ID
     * @param token MFA token
     * @returns User
     */
    async verifyMfaSetup(userId: string, token: string): Promise<User> {
        try {
            // Find user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Check if MFA is already enabled
            if (user.mfaEnabled) {
                throw new Error('MFA is already enabled');
            }

            // Check if user has MFA secret
            if (!user.mfaSecret) {
                throw new Error('MFA setup not initiated');
            }

            // Verify token
            const isValid = this.verifyMfaToken(user.mfaSecret, token);
            if (!isValid) {
                throw new Error('Invalid MFA token');
            }

            // Update user
            user.mfaEnabled = true;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            return user;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Disable multi-factor authentication
     * @param userId User ID
     * @param token MFA token
     * @returns User
     */
    async disableMfa(userId: string, token: string): Promise<User> {
        try {
            // Find user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Check if MFA is enabled
            if (!user.mfaEnabled) {
                throw new Error('MFA is not enabled');
            }

            // Check if user has MFA secret
            if (!user.mfaSecret) {
                throw new Error('MFA secret not found');
            }

            // Verify token
            const isValid = this.verifyMfaToken(user.mfaSecret, token);
            if (!isValid) {
                throw new Error('Invalid MFA token');
            }

            // Update user
            user.mfaEnabled = false;
            user.mfaSecret = undefined;
            user.updatedAt = new Date();
            await updateUser(user.id, user);

            // Revoke all user tokens
            await this.tokenService.revokeAllUserTokens(user.id, 'MFA disabled');

            return user;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Verify MFA token for authentication
     * @param userId User ID
     * @param token MFA token
     * @returns User and tokens
     */
    async verifyMfaTokenForAuth(
        userId: string,
        token: string
    ): Promise<{ user: User; accessToken: Token; refreshToken: Token }> {
        try {
            // Find user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Check if MFA is enabled
            if (!user.mfaEnabled) {
                throw new Error('MFA is not enabled');
            }

            // Check if user has MFA secret
            if (!user.mfaSecret) {
                throw new Error('MFA secret not found');
            }

            // Verify token
            const isValid = this.verifyMfaToken(user.mfaSecret, token);
            if (!isValid) {
                throw new Error('Invalid MFA token');
            }

            // Generate tokens
            const { accessToken, refreshToken } = await this.tokenService.generateTokenPair(user);

            return { user, accessToken, refreshToken };
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Generate MFA secret using TOTP
     * @returns MFA secret
     */
    private generateMfaSecret(): string {
        try {
            const secret = speakeasy.generateSecret({
                name: 'Stage7',
                issuer: 'Stage7 Platform',
                length: 32
            });
            return secret.base32;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error generating MFA secret:', error);
            // Fallback to a secure random secret
            return speakeasy.generateSecret({ length: 32 }).base32;
        }
    }

    /**
     * Verify MFA token using TOTP
     * @param secret MFA secret
     * @param token MFA token
     * @returns True if token is valid
     */
    private verifyMfaToken(secret: string, token: string): boolean {
        try {
            if (!secret || !token) {
                return false;
            }

            // Verify the token with a window of ±1 time step (30 seconds each)
            // This allows for slight clock drift between client and server
            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: token,
                window: 1, // Allow 1 time step before and after current time
                step: 30 // 30-second time step
            });

            return verified;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error verifying MFA token:', error);
            return false;
        }
    }

    /**
     * Generate QR code for MFA setup
     * @param userId User ID
     * @param secret MFA secret
     * @returns QR code data URL
     */
    async generateMfaQrCode(userId: string, secret: string): Promise<string> {
        try {
            const user = await findUserById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Generate TOTP URL
            const otpAuthUrl = speakeasy.otpauthURL({
                secret: secret,
                label: user.email,
                issuer: 'Stage7 Platform',
                encoding: 'base32'
            });

            // Generate QR code
            const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
            return qrCodeDataUrl;
        } catch (error) {
            analyzeError(error as Error);
            throw new Error('Failed to generate MFA QR code');
        }
    }
}
