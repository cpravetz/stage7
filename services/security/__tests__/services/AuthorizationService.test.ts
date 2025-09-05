import { AuthorizationService } from '../src/services/AuthorizationService';
import { User } from '../src/models/User';
import { Role, SystemRoles, DEFAULT_ROLES } from '../src/models/Role';
import { Permission, matchesPermission } from '../src/models/Permission';
import { updateUser, findUserById } from '../src/services/userService';

// Mock external dependencies
jest.mock('../src/services/userService');
jest.mock('../src/models/Permission');

describe('AuthorizationService', () => {
    let authService: AuthorizationService;
    let consoleErrorSpy: jest.SpyInstance;

    // Cast mocked functions
    const mockFindUserById = findUserById as jest.Mock;
    const mockUpdateUser = updateUser as jest.Mock;
    const mockMatchesPermission = matchesPermission as jest.Mock;

    const MOCK_USER_ID = 'user-123';
    const MOCK_USER: User = {
        id: MOCK_USER_ID,
        username: 'testuser',
        email: 'test@example.com',
        roles: [SystemRoles.USER],
        permissions: ['users:read:self'],
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isEmailVerified: true,
        failedLoginAttempts: 0,
        mfaEnabled: false,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now()

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockFindUserById.mockResolvedValue(MOCK_USER);
        mockUpdateUser.mockResolvedValue(MOCK_USER);
        mockMatchesPermission.mockReturnValue(false); // Default to no match

        authService = new AuthorizationService();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('hasPermission', () => {
        it('should return true if user has SUPER_ADMIN role', async () => {
            const superAdminUser = { ...MOCK_USER, roles: [SystemRoles.SUPER_ADMIN] };
            mockFindUserById.mockResolvedValueOnce(superAdminUser);
            expect(await authService.hasPermission(MOCK_USER_ID, 'any:permission')).toBe(true);
        });

        it('should return true if user has direct permission', async () => {
            mockMatchesPermission.mockReturnValueOnce(true);
            expect(await authService.hasPermission(MOCK_USER_ID, 'users:read:self')).toBe(true);
            expect(mockMatchesPermission).toHaveBeenCalledWith('users:read:self', 'users:read:self');
        });

        it('should return true if user's role grants permission', async () => {
            mockMatchesPermission.mockReturnValueOnce(false); // No direct match
            mockMatchesPermission.mockReturnValueOnce(true); // Role match
            expect(await authService.hasPermission(MOCK_USER_ID, 'missions:create')).toBe(true);
            expect(mockMatchesPermission).toHaveBeenCalledWith('missions:create', 'missions:create');
        });

        it('should return false if user does not have permission', async () => {
            expect(await authService.hasPermission(MOCK_USER_ID, 'nonexistent:permission')).toBe(false);
        });

        it('should return false if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            expect(await authService.hasPermission(MOCK_USER_ID, 'any:permission')).toBe(false);
        });

        it('should handle errors and return false', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            expect(await authService.hasPermission(MOCK_USER_ID, 'any:permission')).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('analyzeError'), expect.any(Error));
        });

        it('should evaluate conditions correctly', async () => {
            const permissionWithCondition: Permission = { name: 'users:read:self', resource: 'users', action: 'read', isSystem: true, conditions: { userId: '{{userId}}' } } as any;
            const userWithCustomPermission = { ...MOCK_USER, permissions: ['users:read:self'] };
            mockFindUserById.mockResolvedValueOnce(userWithCustomPermission);
            mockMatchesPermission.mockImplementation((userPerm: string, reqPerm: string) => userPerm === reqPerm);

            // Mock getRolesByIds to return a role with the permission
            jest.spyOn(authService as any, 'getRolesByIds').mockResolvedValueOnce([
                { name: 'User', permissions: ['users:read:self'] } as Role
            ]);

            // Test with matching context
            expect(await authService.hasPermission(MOCK_USER_ID, 'users:read:self', { userId: MOCK_USER_ID })).toBe(true);

            // Test with non-matching context
            expect(await authService.hasPermission(MOCK_USER_ID, 'users:read:self', { userId: 'other-user' })).toBe(false);
        });
    });

    describe('hasRole', () => {
        it('should return true if user has the role', async () => {
            expect(await authService.hasRole(MOCK_USER_ID, SystemRoles.USER)).toBe(true);
        });

        it('should return false if user does not have the role', async () => {
            expect(await authService.hasRole(MOCK_USER_ID, SystemRoles.ADMIN)).toBe(false);
        });

        it('should return false if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            expect(await authService.hasRole(MOCK_USER_ID, SystemRoles.USER)).toBe(false);
        });

        it('should handle errors and return false', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            expect(await authService.hasRole(MOCK_USER_ID, SystemRoles.USER)).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('analyzeError'), expect.any(Error));
        });
    });

    describe('getUserPermissions', () => {
        it('should return all user and role permissions', async () => {
            const userWithCustomPerms = { ...MOCK_USER, permissions: ['custom:permission'] };
            mockFindUserById.mockResolvedValueOnce(userWithCustomPerms);

            const permissions = await authService.getUserPermissions(MOCK_USER_ID);

            expect(permissions).toEqual(expect.arrayContaining([
                'custom:permission',
                'users:read:self', // From default user role
                'users:update:self',
                'missions:read:own',
            ]));
            expect(permissions.length).toBeGreaterThan(3); // Ensure role permissions are added
        });

        it('should return empty array if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            expect(await authService.getUserPermissions(MOCK_USER_ID)).toEqual([]);
        });

        it('should handle errors and return empty array', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            expect(await authService.getUserPermissions(MOCK_USER_ID)).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('analyzeError'), expect.any(Error));
        });
    });

    describe('assignRoleToUser', () => {
        it('should assign a role to a user successfully', async () => {
            const userWithoutAdminRole = { ...MOCK_USER, roles: [SystemRoles.USER] };
            mockFindUserById.mockResolvedValueOnce(userWithoutAdminRole);

            await authService.assignRoleToUser(MOCK_USER_ID, SystemRoles.ADMIN);

            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                roles: [SystemRoles.USER, SystemRoles.ADMIN],
            }));
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.assignRoleToUser(MOCK_USER_ID, SystemRoles.ADMIN)).rejects.toThrow(`User not found: ${MOCK_USER_ID}`);
        });

        it('should throw error for invalid role', async () => {
            await expect(authService.assignRoleToUser(MOCK_USER_ID, 'nonexistent-role')).rejects.toThrow('Invalid role: nonexistent-role');
        });

        it('should not assign if user already has the role', async () => {
            const userWithAdminRole = { ...MOCK_USER, roles: [SystemRoles.USER, SystemRoles.ADMIN] };
            mockFindUserById.mockResolvedValueOnce(userWithAdminRole);

            await authService.assignRoleToUser(MOCK_USER_ID, SystemRoles.ADMIN);

            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.assignRoleToUser(MOCK_USER_ID, SystemRoles.ADMIN)).rejects.toThrow('DB error');
        });
    });

    describe('removeRoleFromUser', () => {
        it('should remove a role from a user successfully', async () => {
            const userWithAdminRole = { ...MOCK_USER, roles: [SystemRoles.USER, SystemRoles.ADMIN] };
            mockFindUserById.mockResolvedValueOnce(userWithAdminRole);

            await authService.removeRoleFromUser(MOCK_USER_ID, SystemRoles.ADMIN);

            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                roles: [SystemRoles.USER],
            }));
        });

        it('should do nothing if user does not have the role', async () => {
            await authService.removeRoleFromUser(MOCK_USER_ID, SystemRoles.ADMIN);
            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should do nothing if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await authService.removeRoleFromUser(MOCK_USER_ID, SystemRoles.ADMIN);
            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.removeRoleFromUser(MOCK_USER_ID, SystemRoles.ADMIN)).rejects.toThrow('DB error');
        });
    });

    describe('assignPermissionToUser', () => {
        const MOCK_PERMISSION = 'missions:create';

        it('should assign a permission to a user successfully', async () => {
            const userWithoutPermission = { ...MOCK_USER, permissions: [] };
            mockFindUserById.mockResolvedValueOnce(userWithoutPermission);
            mockMatchesPermission.mockReturnValue(true); // Ensure isValidPermissionFormat passes

            await authService.assignPermissionToUser(MOCK_USER_ID, MOCK_PERMISSION);

            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                permissions: [MOCK_PERMISSION],
            }));
        });

        it('should throw error if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await expect(authService.assignPermissionToUser(MOCK_USER_ID, MOCK_PERMISSION)).rejects.toThrow(`User not found: ${MOCK_USER_ID}`);
        });

        it('should throw error for invalid permission format', async () => {
            jest.spyOn(authService as any, 'isValidPermissionFormat').mockReturnValueOnce(false);
            await expect(authService.assignPermissionToUser(MOCK_USER_ID, 'invalid-format')).rejects.toThrow('Invalid permission format: invalid-format');
        });

        it('should not assign if user already has the permission', async () => {
            const userWithPermission = { ...MOCK_USER, permissions: [MOCK_PERMISSION] };
            mockFindUserById.mockResolvedValueOnce(userWithPermission);

            await authService.assignPermissionToUser(MOCK_USER_ID, MOCK_PERMISSION);

            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.assignPermissionToUser(MOCK_USER_ID, MOCK_PERMISSION)).rejects.toThrow('DB error');
        });
    });

    describe('removePermissionFromUser', () => {
        const MOCK_PERMISSION = 'missions:create';

        it('should remove a permission from a user successfully', async () => {
            const userWithPermission = { ...MOCK_USER, permissions: [MOCK_PERMISSION, 'other:perm'] };
            mockFindUserById.mockResolvedValueOnce(userWithPermission);

            await authService.removePermissionFromUser(MOCK_USER_ID, MOCK_PERMISSION);

            expect(mockUpdateUser).toHaveBeenCalledWith(MOCK_USER_ID, expect.objectContaining({
                permissions: ['other:perm'],
            }));
        });

        it('should do nothing if user does not have the permission', async () => {
            await authService.removePermissionFromUser(MOCK_USER_ID, MOCK_PERMISSION);
            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should do nothing if user not found', async () => {
            mockFindUserById.mockResolvedValueOnce(null);
            await authService.removePermissionFromUser(MOCK_USER_ID, MOCK_PERMISSION);
            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            mockFindUserById.mockRejectedValueOnce(new Error('DB error'));
            await expect(authService.removePermissionFromUser(MOCK_USER_ID, MOCK_PERMISSION)).rejects.toThrow('DB error');
        });
    });

    describe('evaluatePermissionConditions (private)', () => {
        const permission: Permission = { name: '', resource: '', action: '', isSystem: true, conditions: { key: 'value', userId: '{{userId}}' } } as any;

        it('should return true if no conditions', () => {
            const permNoConditions: Permission = { name: '', resource: '', action: '', isSystem: true } as any;
            expect((authService as any).evaluatePermissionConditions(permNoConditions, {}, MOCK_USER_ID)).toBe(true);
        });

        it('should return true if conditions are met', () => {
            const context = { key: 'value' };
            expect((authService as any).evaluatePermissionConditions(permission, context, MOCK_USER_ID)).toBe(true);
        });

        it('should return false if conditions are not met', () => {
            const context = { key: 'wrong-value' };
            expect((authService as any).evaluatePermissionConditions(permission, context, MOCK_USER_ID)).toBe(false);
        });

        it('should handle {{userId}} in conditions', () => {
            const context = { userId: MOCK_USER_ID };
            expect((authService as any).evaluatePermissionConditions(permission, context, MOCK_USER_ID)).toBe(true);

            const contextWrongUser = { userId: 'other-user' };
            expect((authService as any).evaluatePermissionConditions(permission, contextWrongUser, MOCK_USER_ID)).toBe(false);
        });

        it('should return false if context key is missing', () => {
            const permissionWithMissingKey: Permission = { name: '', resource: '', action: '', isSystem: true, conditions: { missingKey: 'value' } } as any;
            expect((authService as any).evaluatePermissionConditions(permissionWithMissingKey, {}, MOCK_USER_ID)).toBe(false);
        });
    });

    describe('getRolesByIds (private)', () => {
        it('should return Role objects for valid system role IDs', async () => {
            const roles = await (authService as any).getRolesByIds([SystemRoles.USER, SystemRoles.ADMIN]);
            expect(roles.length).toBe(2);
            expect(roles[0].name).toBe('User');
            expect(roles[1].name).toBe('Administrator');
        });

        it('should filter out invalid role IDs', async () => {
            const roles = await (authService as any).getRolesByIds([SystemRoles.USER, 'nonexistent-role']);
            expect(roles.length).toBe(1);
            expect(roles[0].name).toBe('User');
        });

        it('should handle errors and return empty array', async () => {
            jest.spyOn(Object, 'values').mockImplementationOnce(() => { throw new Error('Error getting system roles'); });
            const roles = await (authService as any).getRolesByIds([SystemRoles.USER]);
            expect(roles).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('analyzeError'), expect.any(Error));
        });
    });

    describe('isValidPermissionFormat (private)', () => {
        it('should return true for valid formats', () => {
            expect((authService as any).isValidPermissionFormat('resource:action')).toBe(true);
            expect((authService as any).isValidPermissionFormat('resource:action:scope')).toBe(true);
        });

        it('should return false for invalid formats', () => {
            expect((authService as any).isValidPermissionFormat('resource')).toBe(false);
            expect((authService as any).isValidPermissionFormat('resource:action:scope:extra')).toBe(false);
            expect((authService as any).isValidPermissionFormat(':action')).toBe(false);
            expect((authService as any).isValidPermissionFormat('resource:')).toBe(false);
        });
    });
});
