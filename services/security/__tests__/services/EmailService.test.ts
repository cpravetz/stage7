import { EmailService } from '../src/services/EmailService';
import nodemailer from 'nodemailer';

// Mock external dependencies
jest.mock('nodemailer');

describe('EmailService', () => {
    let emailService: EmailService;
    let mockCreateTransport: jest.Mock;
    let mockTransporter: any;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let originalProcessEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now() if used internally by nodemailer

        // Store original process.env and create a writable copy
        originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv };

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Mock nodemailer.createTransport
        mockTransporter = {
            verify: jest.fn().mockResolvedValue(true),
            sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
        };
        mockCreateTransport = nodemailer.createTransport as jest.Mock;
        mockCreateTransport.mockReturnValue(mockTransporter);

        // Set default environment variables for email config
        process.env.EMAIL_HOST = 'smtp.mock.com';
        process.env.EMAIL_PORT = '587';
        process.env.EMAIL_SECURE = 'true';
        process.env.EMAIL_USER = 'test@mock.com';
        process.env.EMAIL_PASS = 'password';
        process.env.EMAIL_FROM = 'noreply@mock.com';
        process.env.FRONTEND_URL = 'http://mock-frontend.com';

        // Re-import EmailService to get a fresh instance with mocked dependencies
        jest.resetModules();
        const { EmailService: NewEmailService } = require('../src/services/EmailService');
        emailService = new NewEmailService();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
        process.env = originalProcessEnv; // Restore original process.env
    });

    describe('constructor', () => {
        it('should create a transporter with SMTP config if env vars are present', () => {
            expect(mockCreateTransport).toHaveBeenCalledWith({
                host: 'smtp.mock.com',
                port: 587,
                secure: true,
                auth: {
                    user: 'test@mock.com',
                    pass: 'password',
                },
            });
            expect(mockTransporter.verify).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith('Email service connected successfully');
        });

        it('should use JSON transport and log warning if email config is missing', () => {
            delete process.env.EMAIL_HOST;
            jest.resetModules();
            const { EmailService: NewEmailService } = require('../src/services/EmailService');
            emailService = new NewEmailService();

            expect(mockCreateTransport).toHaveBeenCalledWith({ jsonTransport: true });
            expect(mockTransporter.verify).not.toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith('Email configuration not provided. Email sending will be disabled.');
        });

        it('should handle verifyConnection errors', async () => {
            mockTransporter.verify.mockRejectedValueOnce(new Error('Connection failed'));
            jest.resetModules();
            const { EmailService: NewEmailService } = require('../src/services/EmailService');
            emailService = new NewEmailService();

            await Promise.resolve(); // Allow async verifyConnection to run

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to connect to email server'), expect.any(Error));
        });
    });

    describe('sendVerificationEmail', () => {
        const MOCK_EMAIL = 'user@example.com';
        const MOCK_TOKEN = 'verify-token';
        const MOCK_USERNAME = 'testuser';

        it('should send verification email successfully', async () => {
            const result = await emailService.sendVerificationEmail(MOCK_EMAIL, MOCK_TOKEN, MOCK_USERNAME);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith({
                from: 'noreply@mock.com',
                to: MOCK_EMAIL,
                subject: 'Verify Your Email Address',
                html: expect.stringContaining(`http://mock-frontend.com/verify-email?token=${MOCK_TOKEN}`),
            });
            expect(result).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith('Verification email sent:', 'mock-message-id');
        });

        it('should return false and log error if sending fails', async () => {
            mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));
            const result = await emailService.sendVerificationEmail(MOCK_EMAIL, MOCK_TOKEN, MOCK_USERNAME);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send verification email'), expect.any(Error));
        });
    });

    describe('sendPasswordResetEmail', () => {
        const MOCK_EMAIL = 'user@example.com';
        const MOCK_TOKEN = 'reset-token';
        const MOCK_USERNAME = 'testuser';

        it('should send password reset email successfully', async () => {
            const result = await emailService.sendPasswordResetEmail(MOCK_EMAIL, MOCK_TOKEN, MOCK_USERNAME);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith({
                from: 'noreply@mock.com',
                to: MOCK_EMAIL,
                subject: 'Reset Your Password',
                html: expect.stringContaining(`http://mock-frontend.com/reset-password?token=${MOCK_TOKEN}`),
            });
            expect(result).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith('Password reset email sent:', 'mock-message-id');
        });

        it('should return false and log error if sending fails', async () => {
            mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));
            const result = await emailService.sendPasswordResetEmail(MOCK_EMAIL, MOCK_TOKEN, MOCK_USERNAME);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send password reset email'), expect.any(Error));
        });
    });

    describe('sendWelcomeEmail', () => {
        const MOCK_EMAIL = 'user@example.com';
        const MOCK_USERNAME = 'testuser';

        it('should send welcome email successfully', async () => {
            const result = await emailService.sendWelcomeEmail(MOCK_EMAIL, MOCK_USERNAME);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith({
                from: 'noreply@mock.com',
                to: MOCK_EMAIL,
                subject: 'Welcome to Stage7',
                html: expect.stringContaining(`http://mock-frontend.com/login`),
            });
            expect(result).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith('Welcome email sent:', 'mock-message-id');
        });

        it('should return false and log error if sending fails', async () => {
            mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));
            const result = await emailService.sendWelcomeEmail(MOCK_EMAIL, MOCK_USERNAME);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send welcome email'), expect.any(Error));
        });
    });
});
