import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/User';
import { Token, TokenType, TokenPayload, TokenConfig, DEFAULT_TOKEN_CONFIG } from '../models/Token';
import { analyzeError } from '@cktmcs/errorhandler';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Token service for managing JWT tokens
 */
export class TokenService {
    private config: TokenConfig;
    private tokenRepository: any; // Replace with actual repository type
    private tokenBlacklistRepository: any; // Replace with actual repository type
    private userRepository: any; // Replace with actual repository type
    private privateKey: string;
    private publicKey: string;

    /**
     * Constructor
     * @param config Token configuration
     * @param tokenRepository Token repository
     * @param tokenBlacklistRepository Token blacklist repository
     * @param userRepository User repository
     */
    constructor(
        config: Partial<TokenConfig> = {},
        tokenRepository: any = null,
        tokenBlacklistRepository: any = null,
        userRepository: any = null
    ) {
        this.config = { ...DEFAULT_TOKEN_CONFIG, ...config };
        this.tokenRepository = tokenRepository;
        this.tokenBlacklistRepository = tokenBlacklistRepository;
        this.userRepository = userRepository;

        // Load RSA keys
        try {
            const keysDir = path.join(__dirname, '../../keys');
            const privateKeyPath = path.join(keysDir, 'private.key');
            const publicKeyPath = path.join(keysDir, 'public.key');

            if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
                this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
                this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
                console.log('RSA key pair loaded from', keysDir);
            } else {
                console.error('RSA key files not found at', keysDir);
                // Fall back to symmetric key for development
                this.privateKey = this.config.secret;
                this.publicKey = this.config.secret;
                console.warn('Using symmetric key as fallback - NOT SECURE FOR PRODUCTION');
            }
        } catch (error) {
            console.error('Error loading RSA keys:', error);
            // Fall back to symmetric key for development
            this.privateKey = this.config.secret;
            this.publicKey = this.config.secret;
            console.warn('Using symmetric key as fallback - NOT SECURE FOR PRODUCTION');
        }
    }

    /**
     * Generate a JWT token
     * @param user User
     * @param type Token type
     * @param clientInfo Client information
     * @returns Token
     */
    async generateToken(
        user: User,
        type: TokenType,
        clientInfo?: Token['clientInfo']
    ): Promise<Token> {
        try {
            // Determine expiration time based on token type
            let expiresIn: number;
            let secret: string;

            switch (type) {
                case TokenType.ACCESS:
                    expiresIn = this.config.accessTokenExpiresIn;
                    secret = this.config.secret;
                    break;
                case TokenType.REFRESH:
                    expiresIn = this.config.refreshTokenExpiresIn;
                    secret = this.config.refreshSecret;
                    break;
                case TokenType.VERIFICATION:
                    expiresIn = this.config.verificationTokenExpiresIn;
                    secret = this.config.secret;
                    break;
                case TokenType.PASSWORD_RESET:
                    expiresIn = this.config.passwordResetTokenExpiresIn;
                    secret = this.config.secret;
                    break;
                case TokenType.API:
                    expiresIn = this.config.apiTokenExpiresIn;
                    secret = this.config.secret;
                    break;
                default:
                    throw new Error(`Invalid token type: ${type}`);
            }

            // Calculate expiration date
            const expiresAt = new Date(Date.now() + expiresIn * 1000);

            // Create token ID
            const tokenId = uuidv4();

            // Create token payload
            const payload: TokenPayload = {
                sub: user.id,
                jti: tokenId,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(expiresAt.getTime() / 1000),
                type,
                roles: user.roles,
                permissions: user.permissions
            };

            // Sign token
            const token = jwt.sign(payload, this.privateKey, {
                algorithm: this.config.algorithm as jwt.Algorithm,
                issuer: this.config.issuer,
                audience: this.config.audience
            });

            // Create token record
            const tokenRecord: Token = {
                id: tokenId,
                userId: user.id,
                type,
                token,
                expiresAt,
                createdAt: new Date(),
                updatedAt: new Date(),
                isRevoked: false,
                clientInfo
            };

            // Save token to repository if available
            if (this.tokenRepository) {
                await this.tokenRepository.save(tokenRecord);
            }

            return tokenRecord;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Verify a JWT token
     * @param token Token string
     * @param type Token type
     * @returns Token payload
     */
    async verifyToken(token: string, type: TokenType): Promise<TokenPayload> {
        try {
            // Determine secret based on token type
            const secret = type === TokenType.REFRESH ? this.config.refreshSecret : this.config.secret;

            // Check if token is blacklisted
            if (this.tokenBlacklistRepository) {
                const isBlacklisted = await this.tokenBlacklistRepository.exists(token);
                if (isBlacklisted) {
                    throw new Error('Token is blacklisted');
                }
            }

            // Verify token
            const payload = jwt.verify(token, this.publicKey, {
                algorithms: [this.config.algorithm as jwt.Algorithm],
                issuer: this.config.issuer,
                audience: this.config.audience
            }) as TokenPayload;

            // Check token type
            if (payload.type !== type) {
                throw new Error(`Invalid token type: expected ${type}, got ${payload.type}`);
            }

            // Check if token is revoked
            if (this.tokenRepository) {
                const tokenRecord = await this.tokenRepository.findById(payload.jti);
                if (tokenRecord && tokenRecord.isRevoked) {
                    throw new Error('Token is revoked');
                }
            }

            return payload;
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Revoke a token
     * @param tokenId Token ID
     * @param reason Revocation reason
     */
    async revokeToken(tokenId: string, reason: string = 'User initiated'): Promise<void> {
        try {
            if (!this.tokenRepository) {
                throw new Error('Token repository is not available');
            }

            // Find token
            const token = await this.tokenRepository.findById(tokenId);
            if (!token) {
                throw new Error(`Token not found: ${tokenId}`);
            }

            // Update token
            token.isRevoked = true;
            token.revokedAt = new Date();
            token.updatedAt = new Date();

            // Save token
            await this.tokenRepository.save(token);

            // Add to blacklist if available
            if (this.tokenBlacklistRepository) {
                await this.tokenBlacklistRepository.add({
                    id: uuidv4(),
                    token: token.token,
                    expiresAt: token.expiresAt,
                    reason,
                    createdAt: new Date()
                });
            }
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Revoke all tokens for a user
     * @param userId User ID
     * @param reason Revocation reason
     * @param exceptTokenId Token ID to exclude
     */
    async revokeAllUserTokens(
        userId: string,
        reason: string = 'User initiated',
        exceptTokenId?: string
    ): Promise<void> {
        try {
            if (!this.tokenRepository) {
                throw new Error('Token repository is not available');
            }

            // Find all user tokens
            const tokens = await this.tokenRepository.findByUserId(userId);

            // Revoke each token
            for (const token of tokens) {
                if (exceptTokenId && token.id === exceptTokenId) {
                    continue;
                }

                await this.revokeToken(token.id, reason);
            }
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Refresh an access token using a refresh token
     * @param refreshToken Refresh token
     * @param clientInfo Client information
     * @returns New access token
     */
    async refreshAccessToken(refreshToken: string, clientInfo?: Token['clientInfo']): Promise<Token> {
        let payload;
        try {
            // Verify refresh token
            payload = await this.verifyToken(refreshToken, TokenType.REFRESH);
        } catch (error) {
            console.error('[TokenService] Refresh token verification failed:', error);
            throw new Error('Invalid or expired refresh token');
        }

        // Find user
        const user = await this.getUserById(payload.sub);
        if (!user) {
            console.error(`[TokenService] User not found for ID: ${payload.sub}`);
            throw new Error(`User not found: ${payload.sub}`);
        }

        // Generate new access token
        return this.generateToken(user, TokenType.ACCESS, clientInfo);
    }

    /**
     * Get user by ID
     * @param userId User ID
     * @returns User or null
     */
    private async getUserById(userId: string): Promise<User | null> {
        try {
            if (!this.userRepository) {
                throw new Error('User repository is not available');
            }
            return await this.userRepository.findById(userId);
        } catch (error) {
            console.error('Error getting user by ID:', error);
            throw error;
        }
    }

    /**
     * Decode a JWT token without verification
     * @param token Token string
     * @returns Token payload
     */
    decodeToken(token: string): TokenPayload | null {
        try {
            return jwt.decode(token) as TokenPayload;
        } catch (error) {
            analyzeError(error as Error);
            return null;
        }
    }

    /**
     * Generate an access token and refresh token pair
     * @param user User
     * @param clientInfo Client information
     * @returns Access token and refresh token
     */
    async generateTokenPair(
        user: User,
        clientInfo?: Token['clientInfo']
    ): Promise<{ accessToken: Token; refreshToken: Token }> {
        try {
            // Generate access token
            const accessToken = await this.generateToken(user, TokenType.ACCESS, clientInfo);

            // Generate refresh token
            const refreshToken = await this.generateToken(user, TokenType.REFRESH, clientInfo);

            return { accessToken, refreshToken };
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Generate a verification token
     * @param user User
     * @returns Verification token
     */
    async generateVerificationToken(user: User): Promise<Token> {
        try {
            return this.generateToken(user, TokenType.VERIFICATION);
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Generate a password reset token
     * @param user User
     * @returns Password reset token
     */
    async generatePasswordResetToken(user: User): Promise<Token> {
        try {
            return this.generateToken(user, TokenType.PASSWORD_RESET);
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Generate an API token
     * @param user User
     * @param clientInfo Client information
     * @returns API token
     */
    async generateApiToken(user: User, clientInfo?: Token['clientInfo']): Promise<Token> {
        try {
            return this.generateToken(user, TokenType.API, clientInfo);
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }
}
