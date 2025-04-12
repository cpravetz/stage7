import { Request, Response, NextFunction } from 'express';
import { AsyncRequestHandler } from '../types/express';
import { AuthenticationService } from '../services/AuthenticationService';
import { TokenService } from '../services/TokenService';
import { AuthorizationService } from '../services/AuthorizationService';
import { User } from '../models/User';
import { TokenType } from '../models/Token';
import { analyzeError } from '@cktmcs/errorhandler';

// Initialize services
const tokenService = new TokenService();
const authenticationService = new AuthenticationService(null, tokenService);
const authorizationService = new AuthorizationService();

export const register: AsyncRequestHandler = async (req, res, next) => {
    try {
        const { email, password, firstName, lastName, username } = req.body;

        // Get client info for token
        const clientInfo = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        };

        // Register user
        const result = await authenticationService.register({
            email,
            password,
            firstName,
            lastName,
            username: username || email.split('@')[0], // Use email username as default
            roles: ['user'], // Default role
            isActive: true,
            isEmailVerified: false, // Require email verification
            mfaEnabled: false,
            failedLoginAttempts: 0
        }, true); // Send verification email

        // Return tokens and user info
        res.status(201).json({
            message: 'Registration successful',
            accessToken: result.accessToken.token,
            refreshToken: result.refreshToken.token,
            user: {
                id: result.user.id,
                email: result.user.email,
                username: result.user.username,
                firstName: result.user.firstName,
                lastName: result.user.lastName,
                isEmailVerified: result.user.isEmailVerified,
                roles: result.user.roles
            }
        });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Email is already registered') {
            return res.status(400).json({ message: 'Email is already registered' });
        }

        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error registering user' });
    }
};

export const login: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Validate request
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({ message: 'Invalid request body' });
        }

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Missing email or password' });
        }

        // Get client info for token
        const clientInfo = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        };

        // Login user
        const result = await authenticationService.login(email, password, clientInfo);

        // Check if MFA is enabled
        if (result.user.mfaEnabled) {
            return res.status(200).json({
                message: 'MFA required',
                requireMfa: true,
                userId: result.user.id,
                tempToken: result.accessToken.token, // Temporary token for MFA verification
            });
        }

        // Return tokens and user info
        res.status(200).json({
            message: 'Login successful',
            accessToken: result.accessToken.token,
            refreshToken: result.refreshToken.token,
            user: {
                id: result.user.id,
                email: result.user.email,
                username: result.user.username,
                firstName: result.user.firstName,
                lastName: result.user.lastName,
                isEmailVerified: result.user.isEmailVerified,
                roles: result.user.roles
            }
        });

        console.log('Login successful for user:', result.user.email);
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Invalid email or password') {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if ((error as Error).message.includes('Account is locked')) {
            return res.status(403).json({ message: (error as Error).message });
        }

        console.error('Login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
};

export const logout: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Get token ID from request
        const tokenId = req.user.jti;
        const userId = req.user.sub;

        // Get logout options
        const { revokeAll = false } = req.body;

        // Logout user
        await authenticationService.logout(userId, tokenId, revokeAll);

        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        analyzeError(error as Error);
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Error during logout' });
    }
};

export const refreshToken: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Get refresh token from request
        const { refreshToken: token } = req.body;

        if (!token) {
            return res.status(400).json({ message: 'Refresh token is required' });
        }

        // Get client info for token
        const clientInfo = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        };

        // Refresh token
        const result = await authenticationService.refreshToken(token, clientInfo);

        // Return new access token
        res.status(200).json({
            message: 'Token refreshed successfully',
            accessToken: result.accessToken.token
        });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Invalid or expired token') {
            return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }

        console.error('Token refresh error:', error);
        res.status(500).json({ message: 'Error refreshing token' });
    }
};


export const verifyToken: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ valid: false, message: 'No Authorization header provided' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ valid: false, message: 'No token provided in Authorization header' });
        }

        // Verify token
        try {
            const payload = await tokenService.verifyToken(token, TokenType.ACCESS);

            // Return user info
            res.status(200).json({
                valid: true,
                user: {
                    id: payload.sub,
                    roles: payload.roles,
                    permissions: payload.permissions
                }
            });
        } catch (error) {
            analyzeError(error as Error);

            if ((error as Error).message === 'Token is blacklisted') {
                return res.status(401).json({ valid: false, message: 'Token has been revoked' });
            }

            if ((error as Error).message === 'Token is revoked') {
                return res.status(401).json({ valid: false, message: 'Token has been revoked' });
            }

            if ((error as Error).message.includes('jwt expired')) {
                return res.status(401).json({ valid: false, message: 'Token has expired' });
            }

            return res.status(401).json({ valid: false, message: 'Invalid token' });
        }
    } catch (error) {
        analyzeError(error as Error);
        console.error('Token verification error:', error);
        res.status(500).json({ valid: false, message: 'Error verifying token' });
    }
};

/**
 * Verify MFA token
 */
export const verifyMfaToken: AsyncRequestHandler = async (req, res, next) => {
    try {
        const { userId, token } = req.body;

        if (!userId || !token) {
            return res.status(400).json({ message: 'User ID and MFA token are required' });
        }

        // Get client info for token
        const clientInfo = {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        };

        // Verify MFA token
        const result = await authenticationService.verifyMfaTokenForAuth(userId, token);

        // Return tokens and user info
        res.status(200).json({
            message: 'MFA verification successful',
            accessToken: result.accessToken.token,
            refreshToken: result.refreshToken.token,
            user: {
                id: result.user.id,
                email: result.user.email,
                username: result.user.username,
                firstName: result.user.firstName,
                lastName: result.user.lastName,
                isEmailVerified: result.user.isEmailVerified,
                roles: result.user.roles
            }
        });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Invalid MFA token') {
            return res.status(401).json({ message: 'Invalid MFA token' });
        }

        console.error('MFA verification error:', error);
        res.status(500).json({ message: 'Error verifying MFA token' });
    }
};

/**
 * Request password reset
 */
export const requestPasswordReset: AsyncRequestHandler = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Request password reset
        await authenticationService.requestPasswordReset(email);

        // Always return success to prevent email enumeration
        res.status(200).json({ message: 'Password reset email sent' });
    } catch (error) {
        analyzeError(error as Error);
        console.error('Password reset request error:', error);

        // Always return success to prevent email enumeration
        res.status(200).json({ message: 'Password reset email sent' });
    }
};

/**
 * Reset password
 */
export const resetPassword: AsyncRequestHandler = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        // Reset password
        await authenticationService.resetPassword(token, newPassword);

        res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Invalid password reset token') {
            return res.status(401).json({ message: 'Invalid or expired password reset token' });
        }

        if ((error as Error).message === 'Password reset token has expired') {
            return res.status(401).json({ message: 'Password reset token has expired' });
        }

        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Error resetting password' });
    }
};

/**
 * Change password
 */
export const changePassword: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }

        // Change password
        await authenticationService.changePassword(req.user.sub, currentPassword, newPassword);

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Current password is incorrect') {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        console.error('Password change error:', error);
        res.status(500).json({ message: 'Error changing password' });
    }
};

/**
 * Enable MFA
 */
export const enableMfa: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Enable MFA
        const mfaSecret = await authenticationService.enableMfa(req.user.sub);

        // Generate QR code URL (this would typically be done with a library like qrcode)
        const qrCodeUrl = `otpauth://totp/Stage7:${req.user.sub}?secret=${mfaSecret}&issuer=Stage7`;

        res.status(200).json({
            message: 'MFA setup initiated',
            mfaSecret,
            qrCodeUrl
        });
    } catch (error) {
        analyzeError(error as Error);
        console.error('MFA setup error:', error);
        res.status(500).json({ message: 'Error setting up MFA' });
    }
};

/**
 * Verify MFA setup
 */
export const verifyMfaSetup: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ message: 'MFA token is required' });
        }

        // Verify MFA setup
        await authenticationService.verifyMfaSetup(req.user.sub, token);

        res.status(200).json({ message: 'MFA setup verified successfully' });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Invalid MFA token') {
            return res.status(401).json({ message: 'Invalid MFA token' });
        }

        console.error('MFA setup verification error:', error);
        res.status(500).json({ message: 'Error verifying MFA setup' });
    }
};

/**
 * Disable MFA
 */
export const disableMfa: AsyncRequestHandler = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ message: 'MFA token is required' });
        }

        // Disable MFA
        await authenticationService.disableMfa(req.user.sub, token);

        res.status(200).json({ message: 'MFA disabled successfully' });
    } catch (error) {
        analyzeError(error as Error);

        if ((error as Error).message === 'Invalid MFA token') {
            return res.status(401).json({ message: 'Invalid MFA token' });
        }

        console.error('MFA disable error:', error);
        res.status(500).json({ message: 'Error disabling MFA' });
    }
};
