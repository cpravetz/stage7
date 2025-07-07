import { User } from '../models/User';
import { Role, SystemRoles } from '../models/Role';
import { Permission, matchesPermission } from '../models/Permission';
import { analyzeError } from '@cktmcs/errorhandler';
import { updateUser, findUserById, findUserByEmail } from '../services/userService';

/**
 * Authorization service for role-based access control
 */
export class AuthorizationService {
    private roleRepository: any; // Replace with actual repository type
    private permissionRepository: any; // Replace with actual repository type
    private userRepository: any; // Replace with actual repository type

    /**
     * Constructor
     * @param roleRepository Role repository
     * @param permissionRepository Permission repository
     * @param userRepository User repository
     */
    constructor(
        roleRepository: any = null,
        permissionRepository: any = null,
        userRepository: any = null
    ) {
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.userRepository = userRepository;
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

            // Check permission conditions
            if (this.permissionRepository) {
                const permissions = await this.permissionRepository.findByName(requiredPermission);
                for (const permission of permissions) {
                    if (this.evaluatePermissionConditions(permission, context, userId)) {
                        return true;
                    }
                }
            }

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
            if (!this.userRepository) {
                throw new Error('User repository is not available');
            }

            // Get user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error(`User not found: ${userId}`);
            }

            // Check if role exists
            const role = await this.getRoleById(roleId);
            if (!role) {
                throw new Error(`Role not found: ${roleId}`);
            }

            // Check if user already has the role
            if (user.roles.includes(roleId)) {
                return;
            }

            // Add role to user
            user.roles.push(roleId);
            user.updatedAt = new Date();

            // Save user
            await this.userRepository.save(user);
        } catch (error) {
            analyzeError(error as Error);
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
            if (!this.userRepository) {
                throw new Error('User repository is not available');
            }

            // Get user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error(`User not found: ${userId}`);
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
            await this.userRepository.save(user);
        } catch (error) {
            analyzeError(error as Error);
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
            if (!this.userRepository) {
                throw new Error('User repository is not available');
            }

            // Get user
            const user = await findUserById(userId);
            if (!user) {
                throw new Error(`User not found: ${userId}`);
            }

            // Check if permission exists
            const permission = await this.getPermissionByName(permissionName);
            if (!permission) {
                throw new Error(`Permission not found: ${permissionName}`);
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
            await this.userRepository.save(user);
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
            if (!this.userRepository) {
                throw new Error('User repository is not available');
            }

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
            await this.userRepository.save(user);
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
     * Get role by ID (placeholder - implement in actual service)
     * @param roleId Role ID
     * @returns Role or null
     */
    private async getRoleById(roleId: string): Promise<Role | null> {
        if (this.roleRepository) {
            return this.roleRepository.findById(roleId);
        }
        return null;
    }

    /**
     * Get roles by IDs (placeholder - implement in actual service)
     * @param roleIds Role IDs
     * @returns Roles
     */
    private async getRolesByIds(roleIds: string[]): Promise<Role[]> {
        if (this.roleRepository) {
            return this.roleRepository.findByIds(roleIds);
        }
        return [];
    }

    /**
     * Get permission by name (placeholder - implement in actual service)
     * @param permissionName Permission name
     * @returns Permission or null
     */
    private async getPermissionByName(permissionName: string): Promise<Permission | null> {
        if (this.permissionRepository) {
            const permissions = await this.permissionRepository.findByName(permissionName);
            return permissions.length > 0 ? permissions[0] : null;
        }
        return null;
    }
}
