import nodemailer from 'nodemailer';
import { analyzeError } from '@cktmcs/shared';

/**
 * Email service for sending emails
 */
export class EmailService {
    private transporter: nodemailer.Transporter;
    private fromEmail: string;
    private frontendUrl: string;

    /**
     * Constructor
     */
    constructor() {
        // Get email configuration from environment variables
        const host = process.env.EMAIL_HOST;
        const port = parseInt(process.env.EMAIL_PORT || '587');
        const secure = process.env.EMAIL_SECURE === 'true';
        const user = process.env.EMAIL_USER;
        const pass = process.env.EMAIL_PASS;
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@stage7.ai';
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        // Check if email configuration is provided
        if (!host || !user || !pass) {
            console.warn('Email configuration not provided. Email sending will be disabled.');
            this.transporter = nodemailer.createTransport({
                jsonTransport: true // Use JSON transport for testing
            });
            return;
        }

        // Create transporter
        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: {
                user,
                pass
            }
        });

        // Verify connection
        this.verifyConnection();
    }

    /**
     * Verify connection to email server
     */
    private async verifyConnection(): Promise<void> {
        try {
            await this.transporter.verify();
            console.log('Email service connected successfully');
        } catch (error) {
            analyzeError(error as Error);
            console.error('Failed to connect to email server:', error);
        }
    }

    /**
     * Send verification email
     * @param email Recipient email
     * @param token Verification token
     * @param username Username
     * @returns True if email sent successfully
     */
    async sendVerificationEmail(email: string, token: string, username: string): Promise<boolean> {
        try {
            const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;
            
            const mailOptions = {
                from: this.fromEmail,
                to: email,
                subject: 'Verify Your Email Address',
                html: `
                    <h1>Email Verification</h1>
                    <p>Hello ${username},</p>
                    <p>Thank you for registering with Stage7. Please verify your email address by clicking the link below:</p>
                    <p><a href="${verificationUrl}">Verify Email</a></p>
                    <p>If you did not register for an account, please ignore this email.</p>
                    <p>This link will expire in 24 hours.</p>
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Verification email sent:', info.messageId);
            return true;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Failed to send verification email:', error);
            return false;
        }
    }

    /**
     * Send password reset email
     * @param email Recipient email
     * @param token Password reset token
     * @param username Username
     * @returns True if email sent successfully
     */
    async sendPasswordResetEmail(email: string, token: string, username: string): Promise<boolean> {
        try {
            const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;
            
            const mailOptions = {
                from: this.fromEmail,
                to: email,
                subject: 'Reset Your Password',
                html: `
                    <h1>Password Reset</h1>
                    <p>Hello ${username},</p>
                    <p>You have requested to reset your password. Please click the link below to reset your password:</p>
                    <p><a href="${resetUrl}">Reset Password</a></p>
                    <p>If you did not request a password reset, please ignore this email.</p>
                    <p>This link will expire in 1 hour.</p>
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Password reset email sent:', info.messageId);
            return true;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Failed to send password reset email:', error);
            return false;
        }
    }

    /**
     * Send welcome email
     * @param email Recipient email
     * @param username Username
     * @returns True if email sent successfully
     */
    async sendWelcomeEmail(email: string, username: string): Promise<boolean> {
        try {
            const loginUrl = `${this.frontendUrl}/login`;
            
            const mailOptions = {
                from: this.fromEmail,
                to: email,
                subject: 'Welcome to Stage7',
                html: `
                    <h1>Welcome to Stage7</h1>
                    <p>Hello ${username},</p>
                    <p>Thank you for joining Stage7. We're excited to have you on board!</p>
                    <p>You can now <a href="${loginUrl}">log in to your account</a> and start using our services.</p>
                    <p>If you have any questions, please don't hesitate to contact us.</p>
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Welcome email sent:', info.messageId);
            return true;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Failed to send welcome email:', error);
            return false;
        }
    }
}

// Export singleton instance
export const emailService = new EmailService();
