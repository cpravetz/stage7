/**
 * Token interface
 */
export interface Token {
    id: string;
    userId: string;
    type: TokenType;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    revokedAt?: Date;
    isRevoked: boolean;
    clientInfo?: {
        ip?: string;
        userAgent?: string;
        device?: string;
        location?: string;
    };
}

/**
 * Token type enum
 */
export enum TokenType {
    ACCESS = 'access',
    REFRESH = 'refresh',
    VERIFICATION = 'verification',
    PASSWORD_RESET = 'password_reset',
    API = 'api'
}

/**
 * Token payload interface
 */
export interface TokenPayload {
    sub: string; // Subject (user ID)
    jti: string; // JWT ID (token ID)
    iat: number; // Issued at
    exp: number; // Expiration time
    type: TokenType; // Token type
    roles: string[]; // User roles
    permissions?: string[]; // User permissions
    [key: string]: any; // Additional claims
}

/**
 * Token blacklist entry
 */
export interface TokenBlacklistEntry {
    id: string;
    token: string;
    expiresAt: Date;
    reason: string;
    createdAt: Date;
}

/**
 * Token configuration
 */
export interface TokenConfig {
    accessTokenExpiresIn: number; // Seconds
    refreshTokenExpiresIn: number; // Seconds
    verificationTokenExpiresIn: number; // Seconds
    passwordResetTokenExpiresIn: number; // Seconds
    apiTokenExpiresIn: number; // Seconds
    issuer: string;
    audience: string;
    algorithm: string;
    secret: string;
    refreshSecret: string;
}

/**
 * Default token configuration
 */
export const DEFAULT_TOKEN_CONFIG: TokenConfig = {
    accessTokenExpiresIn: 15 * 60, // 15 minutes
    refreshTokenExpiresIn: 7 * 24 * 60 * 60, // 7 days
    verificationTokenExpiresIn: 24 * 60 * 60, // 24 hours
    passwordResetTokenExpiresIn: 1 * 60 * 60, // 1 hour
    apiTokenExpiresIn: 30 * 24 * 60 * 60, // 30 days
    issuer: 'stage7',
    audience: 'stage7-api',
    algorithm: 'HS256',
    secret: process.env.JWT_SECRET || 'your-secret-key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
};

export const DEFAULT_TOKEN_SECRET = process.env.JWT_SECRET || 'your-secret-key';
