/**
 * Permission interface
 */
export interface Permission {
    id: string;
    name: string;
    description: string;
    resource: string;
    action: string;
    conditions?: Record<string, any>;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Permission action types
 */
export enum PermissionAction {
    CREATE = 'create',
    READ = 'read',
    UPDATE = 'update',
    DELETE = 'delete',
    EXECUTE = 'execute',
    MANAGE = 'manage',
    USE = 'use'
}

/**
 * Permission resource types
 */
export enum PermissionResource {
    USER = 'users',
    ROLE = 'roles',
    PERMISSION = 'permissions',
    MISSION = 'missions',
    AGENT = 'agents',
    PLUGIN = 'plugins',
    SETTING = 'settings',
    SYSTEM = 'system'
}

/**
 * Format a permission string
 * @param resource Resource
 * @param action Action
 * @param scope Optional scope (e.g., 'self', 'own', 'public')
 * @returns Formatted permission string
 */
export function formatPermission(resource: string, action: string, scope?: string): string {
    return scope ? `${resource}:${action}:${scope}` : `${resource}:${action}`;
}

/**
 * Parse a permission string
 * @param permission Permission string (e.g., 'users:read:self')
 * @returns Parsed permission object
 */
export function parsePermission(permission: string): { resource: string; action: string; scope?: string } {
    const parts = permission.split(':');
    return {
        resource: parts[0],
        action: parts[1],
        scope: parts[2]
    };
}

/**
 * Check if a permission matches a required permission
 * @param userPermission User's permission
 * @param requiredPermission Required permission
 * @returns True if the permission matches
 */
export function matchesPermission(userPermission: string, requiredPermission: string): boolean {
    // Wildcard permission grants access to everything
    if (userPermission === '*') {
        return true;
    }

    const userParts = userPermission.split(':');
    const requiredParts = requiredPermission.split(':');

    // Check resource
    if (userParts[0] !== requiredParts[0] && userParts[0] !== '*') {
        return false;
    }

    // Check action
    if (userParts[1] !== requiredParts[1] && userParts[1] !== '*') {
        return false;
    }

    // Check scope if present
    if (requiredParts.length > 2) {
        if (userParts.length <= 2) {
            return false;
        }
        if (userParts[2] !== requiredParts[2] && userParts[2] !== '*') {
            return false;
        }
    }

    return true;
}

/**
 * Default system permissions
 */
export const SYSTEM_PERMISSIONS: Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>[] = [
    // User permissions
    {
        name: 'users:create',
        description: 'Create users',
        resource: PermissionResource.USER,
        action: PermissionAction.CREATE,
        isSystem: true
    },
    {
        name: 'users:read',
        description: 'Read all users',
        resource: PermissionResource.USER,
        action: PermissionAction.READ,
        isSystem: true
    },
    {
        name: 'users:read:self',
        description: 'Read own user profile',
        resource: PermissionResource.USER,
        action: PermissionAction.READ,
        conditions: { userId: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'users:update',
        description: 'Update any user',
        resource: PermissionResource.USER,
        action: PermissionAction.UPDATE,
        isSystem: true
    },
    {
        name: 'users:update:self',
        description: 'Update own user profile',
        resource: PermissionResource.USER,
        action: PermissionAction.UPDATE,
        conditions: { userId: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'users:delete',
        description: 'Delete users',
        resource: PermissionResource.USER,
        action: PermissionAction.DELETE,
        isSystem: true
    },

    // Role permissions
    {
        name: 'roles:create',
        description: 'Create roles',
        resource: PermissionResource.ROLE,
        action: PermissionAction.CREATE,
        isSystem: true
    },
    {
        name: 'roles:read',
        description: 'Read roles',
        resource: PermissionResource.ROLE,
        action: PermissionAction.READ,
        isSystem: true
    },
    {
        name: 'roles:update',
        description: 'Update roles',
        resource: PermissionResource.ROLE,
        action: PermissionAction.UPDATE,
        isSystem: true
    },
    {
        name: 'roles:delete',
        description: 'Delete roles',
        resource: PermissionResource.ROLE,
        action: PermissionAction.DELETE,
        isSystem: true
    },

    // Mission permissions
    {
        name: 'missions:create',
        description: 'Create missions',
        resource: PermissionResource.MISSION,
        action: PermissionAction.CREATE,
        isSystem: true
    },
    {
        name: 'missions:read',
        description: 'Read all missions',
        resource: PermissionResource.MISSION,
        action: PermissionAction.READ,
        isSystem: true
    },
    {
        name: 'missions:read:own',
        description: 'Read own missions',
        resource: PermissionResource.MISSION,
        action: PermissionAction.READ,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'missions:read:public',
        description: 'Read public missions',
        resource: PermissionResource.MISSION,
        action: PermissionAction.READ,
        conditions: { isPublic: true },
        isSystem: true
    },
    {
        name: 'missions:update',
        description: 'Update any mission',
        resource: PermissionResource.MISSION,
        action: PermissionAction.UPDATE,
        isSystem: true
    },
    {
        name: 'missions:update:own',
        description: 'Update own missions',
        resource: PermissionResource.MISSION,
        action: PermissionAction.UPDATE,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'missions:delete',
        description: 'Delete any mission',
        resource: PermissionResource.MISSION,
        action: PermissionAction.DELETE,
        isSystem: true
    },
    {
        name: 'missions:delete:own',
        description: 'Delete own missions',
        resource: PermissionResource.MISSION,
        action: PermissionAction.DELETE,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },

    // Agent permissions
    {
        name: 'agents:create',
        description: 'Create agents',
        resource: PermissionResource.AGENT,
        action: PermissionAction.CREATE,
        isSystem: true
    },
    {
        name: 'agents:read',
        description: 'Read all agents',
        resource: PermissionResource.AGENT,
        action: PermissionAction.READ,
        isSystem: true
    },
    {
        name: 'agents:read:own',
        description: 'Read own agents',
        resource: PermissionResource.AGENT,
        action: PermissionAction.READ,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'agents:read:public',
        description: 'Read public agents',
        resource: PermissionResource.AGENT,
        action: PermissionAction.READ,
        conditions: { isPublic: true },
        isSystem: true
    },
    {
        name: 'agents:update',
        description: 'Update any agent',
        resource: PermissionResource.AGENT,
        action: PermissionAction.UPDATE,
        isSystem: true
    },
    {
        name: 'agents:update:own',
        description: 'Update own agents',
        resource: PermissionResource.AGENT,
        action: PermissionAction.UPDATE,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'agents:delete',
        description: 'Delete any agent',
        resource: PermissionResource.AGENT,
        action: PermissionAction.DELETE,
        isSystem: true
    },
    {
        name: 'agents:delete:own',
        description: 'Delete own agents',
        resource: PermissionResource.AGENT,
        action: PermissionAction.DELETE,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },

    // Plugin permissions
    {
        name: 'plugins:create',
        description: 'Create plugins',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.CREATE,
        isSystem: true
    },
    {
        name: 'plugins:read',
        description: 'Read all plugins',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.READ,
        isSystem: true
    },
    {
        name: 'plugins:read:public',
        description: 'Read public plugins',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.READ,
        conditions: { isPublic: true },
        isSystem: true
    },
    {
        name: 'plugins:update',
        description: 'Update any plugin',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.UPDATE,
        isSystem: true
    },
    {
        name: 'plugins:update:own',
        description: 'Update own plugins',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.UPDATE,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'plugins:delete',
        description: 'Delete any plugin',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.DELETE,
        isSystem: true
    },
    {
        name: 'plugins:delete:own',
        description: 'Delete own plugins',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.DELETE,
        conditions: { createdBy: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'plugins:use',
        description: 'Use plugins',
        resource: PermissionResource.PLUGIN,
        action: PermissionAction.USE,
        isSystem: true
    },

    // Settings permissions
    {
        name: 'settings:read',
        description: 'Read all settings',
        resource: PermissionResource.SETTING,
        action: PermissionAction.READ,
        isSystem: true
    },
    {
        name: 'settings:read:self',
        description: 'Read own settings',
        resource: PermissionResource.SETTING,
        action: PermissionAction.READ,
        conditions: { userId: '{{userId}}' },
        isSystem: true
    },
    {
        name: 'settings:update',
        description: 'Update any settings',
        resource: PermissionResource.SETTING,
        action: PermissionAction.UPDATE,
        isSystem: true
    },
    {
        name: 'settings:update:self',
        description: 'Update own settings',
        resource: PermissionResource.SETTING,
        action: PermissionAction.UPDATE,
        conditions: { userId: '{{userId}}' },
        isSystem: true
    },

    // System permissions
    {
        name: 'system:manage',
        description: 'Manage system settings and operations',
        resource: PermissionResource.SYSTEM,
        action: PermissionAction.MANAGE,
        isSystem: true
    }
];
