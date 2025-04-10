export interface User {
    id: string;
    username: string;
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    authProvider?: string;
    providerUserId?: string;
    roles: string[];
    permissions?: string[];
    lastLogin?: Date;
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
    isEmailVerified: boolean;
    verificationToken?: string;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    mfaEnabled: boolean;
    mfaSecret?: string;
    failedLoginAttempts: number;
    lockoutUntil?: Date;
    componentRegistrations?: string[];
    preferences?: Record<string, any>;
}
