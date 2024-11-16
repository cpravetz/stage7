export interface User {
    id: string;
    username: string;
    email: string;
    password?: string;
    authProvider?: string;
    providerUserId?: string;
    role: string;
    lastLogin: Date;
    componentRegistrations?: string[];
}
