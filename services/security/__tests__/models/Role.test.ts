import { SystemRoles, DEFAULT_ROLES } from '../src/models/Role';

describe('Role Model', () => {
    describe('SystemRoles Enum', () => {
        it('should have expected values', () => {
            expect(SystemRoles.SUPER_ADMIN).toBe('super_admin');
            expect(SystemRoles.ADMIN).toBe('admin');
            expect(SystemRoles.USER).toBe('user');
            expect(SystemRoles.GUEST).toBe('guest');
        });
    });

    describe('DEFAULT_ROLES Constant', () => {
        it('should contain all SystemRoles as keys', () => {
            const defaultRoleKeys = Object.keys(DEFAULT_ROLES);
            const systemRoleValues = Object.values(SystemRoles);
            expect(defaultRoleKeys.sort()).toEqual(systemRoleValues.sort());
        });

        it('should define properties for SUPER_ADMIN role correctly', () => {
            const superAdminRole = DEFAULT_ROLES[SystemRoles.SUPER_ADMIN];
            expect(superAdminRole.name).toBe('Super Admin');
            expect(superAdminRole.description).toBe('Full access to all system features and settings');
            expect(superAdminRole.permissions).toEqual(['*']);
            expect(superAdminRole.isSystem).toBe(true);
        });

        it('should define properties for ADMIN role correctly', () => {
            const adminRole = DEFAULT_ROLES[SystemRoles.ADMIN];
            expect(adminRole.name).toBe('Administrator');
            expect(adminRole.description).toBe('Administrative access to most system features');
            expect(adminRole.permissions.length).toBeGreaterThan(0);
            expect(adminRole.permissions).toEqual(expect.arrayContaining([
                'users:read', 'missions:create', 'plugins:update'
            ]));
            expect(adminRole.isSystem).toBe(true);
        });

        it('should define properties for USER role correctly', () => {
            const userRole = DEFAULT_ROLES[SystemRoles.USER];
            expect(userRole.name).toBe('User');
            expect(userRole.description).toBe('Standard user access');
            expect(userRole.permissions.length).toBeGreaterThan(0);
            expect(userRole.permissions).toEqual(expect.arrayContaining([
                'users:read:self', 'missions:read:own', 'plugins:use'
            ]));
            expect(userRole.isSystem).toBe(true);
        });

        it('should define properties for GUEST role correctly', () => {
            const guestRole = DEFAULT_ROLES[SystemRoles.GUEST];
            expect(guestRole.name).toBe('Guest');
            expect(guestRole.description).toBe('Limited access for guests');
            expect(guestRole.permissions.length).toBeGreaterThan(0);
            expect(guestRole.permissions).toEqual(expect.arrayContaining([
                'missions:read:public', 'agents:read:public', 'plugins:read:public'
            ]));
            expect(guestRole.isSystem).toBe(true);
        });

        it('all default roles should have isSystem: true', () => {
            Object.values(DEFAULT_ROLES).forEach(role => {
                expect(role.isSystem).toBe(true);
            });
        });

        it('permissions arrays should not be empty for non-guest roles', () => {
            expect(DEFAULT_ROLES[SystemRoles.SUPER_ADMIN].permissions.length).toBeGreaterThan(0);
            expect(DEFAULT_ROLES[SystemRoles.ADMIN].permissions.length).toBeGreaterThan(0);
            expect(DEFAULT_ROLES[SystemRoles.USER].permissions.length).toBeGreaterThan(0);
        });
    });
});
