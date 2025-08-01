import { User } from '../models/User';
import { Role, SystemRoles, DEFAULT_ROLES } from '../models/Role';
import { Permission, matchesPermission } from '../models/Permission';
import { analyzeError } from '@cktmcs/errorhandler';
import { updateUser, findUserById, findUserByEmail } from '../services/userService';

/**
 * Authorization service for role-based access control
 */
export class AuthorizationService {
    /**
     * Constructor - Uses existing user service functions
     */
    constructor() {
        // No repository dependencies needed - using service functions
    }

    /**
     * Check if a user has a specific permission
     * @param userId User ID
     * @param requiredPermission Required permission
     * @param context Context for permission evaluation
     * @returns True if the user has the permission
     */
    async hasPermission(
        userId: string,
        requiredPermission: string,
        context: Record<string, any> = {}
    ): Promise<boolean> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                return false;
            }

            // Check if user has super_admin role
            if (user.roles.includes(SystemRoles.SUPER_ADMIN)) {
                return true;
            }

            // Check user permissions directly
            if (user.permissions) {
                for (const permission of user.permissions) {
                    if (matchesPermission(permission, requiredPermission)) {
                        return true;
                    }
                }
            }

            // Get user roles
            const roles = await this.getRolesByIds(user.roles);

            // Check role permissions
            for (const role of roles) {
                for (const permission of role.permissions) {
                    if (matchesPermission(permission, requiredPermission)) {
                        return true;
                    }
                }
            }

            // For now, we don't have a permission repository, so we rely on role-based permissions
            // This could be extended in the future to support more complex permission conditions

            return false;
        } catch (error) {
            analyzeError(error as Error);
            return false;
        }
    }

    /**
     * Check if a user has a specific role
     * @param userId User ID
     * @param roleName Role name
     * @returns True if the user has the role
     */
    async hasRole(userId: string, roleName: string): Promise<boolean> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                return false;
            }

            return user.roles.includes(roleName);
        } catch (error) {
            analyzeError(error as Error);
            return false;
        }
    }

    /**
     * Get user permissions
     * @param userId User ID
     * @returns User permissions
     */
    async getUserPermissions(userId: string): Promise<string[]> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                return [];
            }

            // Start with user permissions
            const permissions = new Set<string>(user.permissions || []);

            // Get user roles
            const roles = await this.getRolesByIds(user.roles);

            // Add role permissions
            for (const role of roles) {
                for (const permission of role.permissions) {
                    permissions.add(permission);
                }
            }

            return Array.from(permissions);
        } catch (error) {
            analyzeError(error as Error);
            return [];
        }
    }

    /**
     * Assign a role to a user
     * @param userId User ID
     * @param roleId Role ID
     */
    async assignRoleToUser(userId: string, roleId: string): Promise<void> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error(`User not found: ${userId}`);
            }

            // Check if role exists (validate against system roles)
            if (!Object.values(SystemRoles).includes(roleId as SystemRoles)) {
                throw new Error(`Invalid role: ${roleId}`);
            }

            // Check if user already has the role
            if (user.roles.includes(roleId)) {
                return;
            }

            // Add role to user
            user.roles.push(roleId);
            user.updatedAt = new Date();

            // Save user
            await updateUser(userId, user);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Remove a role from a user
     * @param userId User ID
     * @param roleId Role ID
     */
    async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                return;
            }

            // Check if user has the role
            const roleIndex = user.roles.indexOf(roleId);
            if (roleIndex === -1) {
                return;
            }

            // Remove role from user
            user.roles.splice(roleIndex, 1);
            user.updatedAt = new Date();

            // Save user
            await updateUser(userId, user);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Assign a permission to a user
     * @param userId User ID
     * @param permissionName Permission name
     */
    async assignPermissionToUser(userId: string, permissionName: string): Promise<void> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error(`User not found: ${userId}`);
            }

            // Validate permission format (resource:action or resource:action:scope)
            if (!this.isValidPermissionFormat(permissionName)) {
                throw new Error(`Invalid permission format: ${permissionName}`);
            }

            // Initialize permissions array if needed
            if (!user.permissions) {
                user.permissions = [];
            }

            // Check if user already has the permission
            if (user.permissions.includes(permissionName)) {
                return;
            }

            // Add permission to user
            user.permissions.push(permissionName);
            user.updatedAt = new Date();

            // Save user
            await updateUser(userId, user);
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Remove a permission from a user
     * @param userId User ID
     * @param permissionName Permission name
     */
    async removePermissionFromUser(userId: string, permissionName: string): Promise<void> {
        try {
            // Get user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error(`User not found: ${userId}`);
            }

            // Check if user has permissions
            if (!user.permissions) {
                return;
            }

            // Check if user has the permission
            const permissionIndex = user.permissions.indexOf(permissionName);
            if (permissionIndex === -1) {
                return;
            }

            // Remove permission from user
            user.permissions.splice(permissionIndex, 1);
            user.updatedAt = new Date();

            // Save user
            await updateUser(userId, user);
        } catch (error) {
            analyzeError(error as Error);
            throw error;
        }
    }

    /**
     * Evaluate permission conditions
     * @param permission Permission
     * @param context Context for permission evaluation
     * @param userId User ID
     * @returns True if conditions are met
     */
    private evaluatePermissionConditions(
        permission: Permission,
        context: Record<string, any>,
        userId: string
    ): boolean {
        // If no conditions, permission is granted
        if (!permission.conditions) {
            return true;
        }

        // Check each condition
        for (const [key, value] of Object.entries(permission.conditions)) {
            // Handle special values
            let expectedValue = value;
            if (typeof value === 'string' && value === '{{userId}}') {
                expectedValue = userId;
            }

            // Check if context has the key
            if (!(key in context)) {
                return false;
            }

            // Check if values match
            if (context[key] !== expectedValue) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get roles by IDs using system roles
     * @param roleIds Role IDs
     * @returns Roles
     */
    private async getRolesByIds(roleIds: string[]): Promise<Role[]> {
        try {
            const roles: Role[] = [];

            for (const roleId of roleIds) {
                if (Object.values(SystemRoles).includes(roleId as SystemRoles)) {
                    const defaultRole = DEFAULT_ROLES[roleId as SystemRoles];
                    if (defaultRole) {
                        roles.push({
                            id: roleId,
                            ...defaultRole,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                }
            }

            return roles;
        } catch (error) {
            analyzeError(error as Error);
            return [];
        }
    }

    /**
     * Validate permission format
     * @param permission Permission string
     * @returns True if valid format
     */
    private isValidPermissionFormat(permission: string): boolean {
        // Valid formats: resource:action or resource:action:scope
        const parts = permission.split(':');
        return parts.length >= 2 && parts.length <= 3 && parts.every(part => part.length > 0);
    }
}
