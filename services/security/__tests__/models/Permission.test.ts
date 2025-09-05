import { formatPermission, parsePermission, matchesPermission, PermissionAction, PermissionResource, SYSTEM_PERMISSIONS } from '../src/models/Permission';

describe('Permission Model', () => {
    describe('formatPermission', () => {
        it('should format a permission string without scope', () => {
            expect(formatPermission('users', 'read')).toBe('users:read');
        });

        it('should format a permission string with scope', () => {
            expect(formatPermission('users', 'read', 'self')).toBe('users:read:self');
        });

        it('should handle empty resource or action', () => {
            expect(formatPermission('', 'read')).toBe(':read');
            expect(formatPermission('users', '')).toBe('users:');
        });
    });

    describe('parsePermission', () => {
        it('should parse a permission string without scope', () => {
            const parsed = parsePermission('users:read');
            expect(parsed).toEqual({ resource: 'users', action: 'read', scope: undefined });
        });

        it('should parse a permission string with scope', () => {
            const parsed = parsePermission('users:read:self');
            expect(parsed).toEqual({ resource: 'users', action: 'read', scope: 'self' });
        });

        it('should handle malformed strings gracefully', () => {
            const parsed = parsePermission('users');
            expect(parsed).toEqual({ resource: 'users', action: undefined, scope: undefined });

            const parsed2 = parsePermission('users:read:');
            expect(parsed2).toEqual({ resource: 'users', action: 'read', scope: '' });
        });
    });

    describe('matchesPermission', () => {
        // Exact matches
        it('should return true for exact match without scope', () => {
            expect(matchesPermission('users:read', 'users:read')).toBe(true);
        });

        it('should return true for exact match with scope', () => {
            expect(matchesPermission('users:read:self', 'users:read:self')).toBe(true);
        });

        // Wildcard matches
        it('should return true for wildcard resource', () => {
            expect(matchesPermission('*:read', 'users:read')).toBe(true);
        });

        it('should return true for wildcard action', () => {
            expect(matchesPermission('users:*', 'users:read')).toBe(true);
        });

        it('should return true for wildcard scope', () => {
            expect(matchesPermission('users:read:*', 'users:read:self')).toBe(true);
        });

        it('should return true for full wildcard', () => {
            expect(matchesPermission('*', 'users:read')).toBe(true);
            expect(matchesPermission('*', 'users:read:self')).toBe(true);
        });

        it('should return true for wildcard resource and action', () => {
            expect(matchesPermission('*:*', 'users:read')).toBe(true);
        });

        it('should return true for wildcard resource, action, and scope', () => {
            expect(matchesPermission('*:*:*', 'users:read:self')).toBe(true);
        });

        // No match cases
        it('should return false for different resource', () => {
            expect(matchesPermission('roles:read', 'users:read')).toBe(false);
        });

        it('should return false for different action', () => {
            expect(matchesPermission('users:write', 'users:read')).toBe(false);
        });

        it('should return false for different scope', () => {
            expect(matchesPermission('users:read:other', 'users:read:self')).toBe(false);
        });

        it('should return false if user permission has no scope but required has', () => {
            expect(matchesPermission('users:read', 'users:read:self')).toBe(false);
        });

        it('should return false if user permission has scope but required does not', () => {
            expect(matchesPermission('users:read:self', 'users:read')).toBe(false);
        });

        it('should handle complex wildcard scenarios', () => {
            expect(matchesPermission('users:*:self', 'users:read:self')).toBe(true);
            expect(matchesPermission('users:*:other', 'users:read:self')).toBe(false);
            expect(matchesPermission('*:read:self', 'users:read:self')).toBe(true);
            expect(matchesPermission('*:read:other', 'users:read:self')).toBe(false);
        });
    });

    describe('SYSTEM_PERMISSIONS', () => {
        it('should contain expected system permissions', () => {
            expect(SYSTEM_PERMISSIONS.length).toBeGreaterThan(0);
            expect(SYSTEM_PERMISSIONS).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'users:create', resource: PermissionResource.USER, action: PermissionAction.CREATE }),
                expect.objectContaining({ name: 'missions:read:own', resource: PermissionResource.MISSION, action: PermissionAction.READ, conditions: { createdBy: '{{userId}}' } }),
                expect.objectContaining({ name: 'system:manage', resource: PermissionResource.SYSTEM, action: PermissionAction.MANAGE }),
            ]));
        });

        it('all system permissions should have isSystem: true', () => {
            SYSTEM_PERMISSIONS.forEach(p => {
                expect(p.isSystem).toBe(true);
            });
        });
    });
});
