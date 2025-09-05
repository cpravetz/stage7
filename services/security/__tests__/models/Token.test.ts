import { TokenType, DEFAULT_TOKEN_CONFIG, DEFAULT_TOKEN_SECRET } from '../src/models/Token';

describe('Token Model', () => {
    let originalProcessEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.resetModules(); // Clear module cache before each test
        originalProcessEnv = process.env; // Store original process.env
        process.env = { ...originalProcessEnv }; // Create a writable copy
    });

    afterEach(() => {
        process.env = originalProcessEnv; // Restore original process.env
    });

    describe('TokenType Enum', () => {
        it('should have expected values', () => {
            expect(TokenType.ACCESS).toBe('access');
            expect(TokenType.REFRESH).toBe('refresh');
            expect(TokenType.VERIFICATION).toBe('verification');
            expect(TokenType.PASSWORD_RESET).toBe('password_reset');
            expect(TokenType.API).toBe('api');
        });
    });

    describe('DEFAULT_TOKEN_CONFIG Constant', () => {
        it('should have all expected properties with default values', () => {
            const { DEFAULT_TOKEN_CONFIG: config } = require('../src/models/Token');

            expect(config.accessTokenExpiresIn).toBe(15 * 60); // 15 minutes
            expect(config.refreshTokenExpiresIn).toBe(7 * 24 * 60 * 60); // 7 days
            expect(config.verificationTokenExpiresIn).toBe(24 * 60 * 60); // 24 hours
            expect(config.passwordResetTokenExpiresIn).toBe(1 * 60 * 60); // 1 hour
            expect(config.apiTokenExpiresIn).toBe(30 * 24 * 60 * 60); // 30 days
            expect(config.issuer).toBe('stage7');
            expect(config.audience).toBe('stage7-api');
            expect(config.algorithm).toBe('RS256');
            expect(config.secret).toBe('your-secret-key');
            expect(config.refreshSecret).toBe('your-refresh-secret-key');
        });

        it('should use JWT_SECRET from process.env if available', () => {
            process.env.JWT_SECRET = 'env-secret';
            const { DEFAULT_TOKEN_CONFIG: config } = require('../src/models/Token');
            expect(config.secret).toBe('env-secret');
        });

        it('should use JWT_REFRESH_SECRET from process.env if available', () => {
            process.env.JWT_REFRESH_SECRET = 'env-refresh-secret';
            const { DEFAULT_TOKEN_CONFIG: config } = require('../src/models/Token');
            expect(config.refreshSecret).toBe('env-refresh-secret');
        });
    });

    describe('DEFAULT_TOKEN_SECRET Constant', () => {
        it('should have the correct default value', () => {
            const { DEFAULT_TOKEN_SECRET: secret } = require('../src/models/Token');
            expect(secret).toBe('your-secret-key');
        });

        it('should use JWT_SECRET from process.env if available', () => {
            process.env.JWT_SECRET = 'env-secret-for-default';
            const { DEFAULT_TOKEN_SECRET: secret } = require('../src/models/Token');
            expect(secret).toBe('env-secret-for-default');
        });
    });
});
