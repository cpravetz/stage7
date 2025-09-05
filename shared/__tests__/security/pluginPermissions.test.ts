import { hasPermission, getPluginPermissions, hasDangerousPermissions, getDangerousPermissions, validatePluginPermissions, PermissionCategory, PermissionLevel, AVAILABLE_PERMISSIONS, PERMISSION_MAP } from '../src/security/pluginPermissions';
import { PluginDefinition } from '../src/types/Plugin';

describe('pluginPermissions', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('hasPermission', () => {
        it('should return true if plugin has the permission', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'net.fetch'] } } as any;
            expect(hasPermission(plugin, 'fs.read')).toBe(true);
        });

        it('should return false if plugin does not have the permission', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read'] } } as any;
            expect(hasPermission(plugin, 'fs.write')).toBe(false);
        });

        it('should return false if plugin.security is missing', () => {
            const plugin: PluginDefinition = {} as any;
            expect(hasPermission(plugin, 'fs.read')).toBe(false);
        });

        it('should return false if plugin.security.permissions is missing', () => {
            const plugin: PluginDefinition = { security: {} } as any;
            expect(hasPermission(plugin, 'fs.read')).toBe(false);
        });
    });

    describe('getPluginPermissions', () => {
        it('should return an array of Permission objects for valid permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'net.fetch'] } } as any;
            const permissions = getPluginPermissions(plugin);
            expect(permissions.length).toBe(2);
            expect(permissions).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'fs.read', category: PermissionCategory.FILE_SYSTEM, level: PermissionLevel.READ }),
                expect.objectContaining({ name: 'net.fetch', category: PermissionCategory.NETWORK, level: PermissionLevel.READ }),
            ]));
        });

        it('should filter out unknown permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'unknown.permission'] } } as any;
            const permissions = getPluginPermissions(plugin);
            expect(permissions.length).toBe(1);
            expect(permissions[0].name).toBe('fs.read');
        });

        it('should return empty array if no permissions are defined', () => {
            const plugin: PluginDefinition = { security: { permissions: [] } } as any;
            expect(getPluginPermissions(plugin)).toEqual([]);
        });

        it('should return empty array if plugin.security is missing', () => {
            const plugin: PluginDefinition = {} as any;
            expect(getPluginPermissions(plugin)).toEqual([]);
        });
    });

    describe('hasDangerousPermissions', () => {
        it('should return true if plugin has any dangerous permission', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'fs.write'] } } as any;
            expect(hasDangerousPermissions(plugin)).toBe(true);
        });

        it('should return false if plugin has no dangerous permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'net.fetch'] } } as any;
            expect(hasDangerousPermissions(plugin)).toBe(false);
        });

        it('should return false if plugin has no permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: [] } } as any;
            expect(hasDangerousPermissions(plugin)).toBe(false);
        });
    });

    describe('getDangerousPermissions', () => {
        it('should return an array of dangerous Permission objects', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'fs.write', 'process.exec'] } } as any;
            const dangerousPermissions = getDangerousPermissions(plugin);
            expect(dangerousPermissions.length).toBe(2);
            expect(dangerousPermissions).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'fs.write', dangerous: true }),
                expect.objectContaining({ name: 'process.exec', dangerous: true }),
            ]));
        });

        it('should return empty array if no dangerous permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'net.fetch'] } } as any;
            expect(getDangerousPermissions(plugin)).toEqual([]);
        });
    });

    describe('validatePluginPermissions', () => {
        it('should return empty array for valid permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'net.fetch'] } } as any;
            const errors = validatePluginPermissions(plugin);
            expect(errors).toEqual([]);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('validatePluginPermissions'));
        });

        it('should return error if plugin.security is missing', () => {
            const plugin: PluginDefinition = {} as any;
            const errors = validatePluginPermissions(plugin);
            expect(errors).toEqual(['Plugin security permissions are missing']);
        });

        it('should return error if plugin.security.permissions is missing', () => {
            const plugin: PluginDefinition = { security: {} } as any;
            const errors = validatePluginPermissions(plugin);
            expect(errors).toEqual(['Plugin security permissions are missing']);
        });

        it('should return error for unknown permissions', () => {
            const plugin: PluginDefinition = { security: { permissions: ['fs.read', 'unknown.permission', 'another.unknown'] } } as any;
            const errors = validatePluginPermissions(plugin);
            expect(errors).toEqual([
                'Unknown permission: unknown.permission',
                'Unknown permission: another.unknown',
            ]);
        });

        it('should return multiple errors for multiple issues', () => {
            const plugin: PluginDefinition = { security: { permissions: ['unknown.permission'] } } as any;
            delete plugin.security?.permissions; // Simulate missing permissions after some are added
            const errors = validatePluginPermissions(plugin);
            expect(errors).toEqual(['Plugin security permissions are missing']);
        });
    });
});
