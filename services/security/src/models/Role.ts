/**
 * Role interface
 */
export interface Role {
    id: string;
    name: string;
    description: string;
    permissions: string[];
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * System roles
 */
export enum SystemRoles {
    SUPER_ADMIN = 'super_admin',
    ADMIN = 'admin',
    USER = 'user',
    GUEST = 'guest'
}

/**
 * Default roles with their permissions
 */
export const DEFAULT_ROLES: Record<SystemRoles, Omit<Role, 'id' | 'createdAt' | 'updatedAt'>> = {
    [SystemRoles.SUPER_ADMIN]: {
        name: 'Super Admin',
        description: 'Full access to all system features and settings',
        permissions: ['*'], // Wildcard for all permissions
        isSystem: true
    },
    [SystemRoles.ADMIN]: {
        name: 'Administrator',
        description: 'Administrative access to most system features',
        permissions: [
            'users:read', 'users:create', 'users:update',
            'roles:read',
            'missions:read', 'missions:create', 'missions:update', 'missions:delete',
            'agents:read', 'agents:create', 'agents:update', 'agents:delete',
            'plugins:read', 'plugins:create', 'plugins:update', 'plugins:delete',
            'settings:read', 'settings:update'
        ],
        isSystem: true
    },
    [SystemRoles.USER]: {
        name: 'User',
        description: 'Standard user access',
        permissions: [
            'users:read:self', 'users:update:self',
            'missions:read:own', 'missions:create', 'missions:update:own', 'missions:delete:own',
            'agents:read', 'agents:create', 'agents:update:own', 'agents:delete:own',
            'plugins:read', 'plugins:use',
            'settings:read:self', 'settings:update:self'
        ],
        isSystem: true
    },
    [SystemRoles.GUEST]: {
        name: 'Guest',
        description: 'Limited access for guests',
        permissions: [
            'missions:read:public',
            'agents:read:public',
            'plugins:read:public'
        ],
        isSystem: true
    }
};
