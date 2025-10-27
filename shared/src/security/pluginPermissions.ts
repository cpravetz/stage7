import { PluginDefinition } from '../types/Plugin';

/**
 * Permission categories
 */
export enum PermissionCategory {
  FILE_SYSTEM = 'fs',
  NETWORK = 'net',
  PROCESS = 'process',
  ENVIRONMENT = 'env',
  DATABASE = 'db',
  SYSTEM = 'system'
}

/**
 * Permission levels
 */
export enum PermissionLevel {
  NONE = 0,
  READ = 1,
  WRITE = 2,
  EXECUTE = 3,
  FULL = 4
}

/**
 * Permission definition
 */
export interface Permission {
  category: PermissionCategory;
  name: string;
  level: PermissionLevel;
  description: string;
  dangerous: boolean;
}

/**
 * Available permissions
 */
export const AVAILABLE_PERMISSIONS: Permission[] = [
  // File system permissions
  {
    category: PermissionCategory.FILE_SYSTEM,
    name: 'fs.read',
    level: PermissionLevel.READ,
    description: 'Read files from the file system',
    dangerous: false
  },
  {
    category: PermissionCategory.FILE_SYSTEM,
    name: 'fs.write',
    level: PermissionLevel.WRITE,
    description: 'Write files to the file system',
    dangerous: true
  },
  {
    category: PermissionCategory.FILE_SYSTEM,
    name: 'fs.delete',
    level: PermissionLevel.WRITE,
    description: 'Delete files from the file system',
    dangerous: true
  },
  
  // Network permissions
  {
    category: PermissionCategory.NETWORK,
    name: 'net.fetch',
    level: PermissionLevel.READ,
    description: 'Make HTTP requests to external services',
    dangerous: false
  },
  {
    category: PermissionCategory.NETWORK,
    name: 'net.listen',
    level: PermissionLevel.WRITE,
    description: 'Listen for incoming network connections',
    dangerous: true
  },
  
  // Process permissions
  {
    category: PermissionCategory.PROCESS,
    name: 'process.exec',
    level: PermissionLevel.EXECUTE,
    description: 'Execute external processes',
    dangerous: true
  },
  {
    category: PermissionCategory.PROCESS,
    name: 'process.env',
    level: PermissionLevel.READ,
    description: 'Access process environment variables',
    dangerous: false
  },
  {
    category: PermissionCategory.PROCESS,
    name: 'docker.run',
    level: PermissionLevel.EXECUTE,
    description: 'Run Docker containers',
    dangerous: true
  },
  
  // Environment permissions
  {
    category: PermissionCategory.ENVIRONMENT,
    name: 'env.read',
    level: PermissionLevel.READ,
    description: 'Read environment variables',
    dangerous: false
  },
  {
    category: PermissionCategory.ENVIRONMENT,
    name: 'env.write',
    level: PermissionLevel.WRITE,
    description: 'Write environment variables',
    dangerous: true
  },
  
  // Database permissions
  {
    category: PermissionCategory.DATABASE,
    name: 'db.read',
    level: PermissionLevel.READ,
    description: 'Read from databases',
    dangerous: false
  },
  {
    category: PermissionCategory.DATABASE,
    name: 'db.write',
    level: PermissionLevel.WRITE,
    description: 'Write to databases',
    dangerous: true
  },
  
  // System permissions
  {
    category: PermissionCategory.SYSTEM,
    name: 'system.info',
    level: PermissionLevel.READ,
    description: 'Access system information',
    dangerous: false
  },
  {
    category: PermissionCategory.SYSTEM,
    name: 'system.eval',
    level: PermissionLevel.EXECUTE,
    description: 'Evaluate code at runtime',
    dangerous: true
  }
];

/**
 * Permission map for quick lookup
 */
export const PERMISSION_MAP = new Map<string, Permission>(
  AVAILABLE_PERMISSIONS.map(permission => [permission.name, permission])
);

/**
 * Check if a plugin has a specific permission
 * @param plugin Plugin definition
 * @param permissionName Permission name
 * @returns True if the plugin has the permission
 */
export function hasPermission(plugin: PluginDefinition, permissionName: string): boolean {
  if (!plugin.security || !plugin.security.permissions) {
    return false;
  }
  
  return plugin.security.permissions.includes(permissionName);
}

/**
 * Get all permissions for a plugin
 * @param plugin Plugin definition
 * @returns Array of permissions
 */
export function getPluginPermissions(plugin: PluginDefinition): Permission[] {
  if (!plugin.security || !plugin.security.permissions) {
    return [];
  }
  
  return plugin.security.permissions
    .map(name => PERMISSION_MAP.get(name))
    .filter((permission): permission is Permission => !!permission);
}

/**
 * Check if a plugin has any dangerous permissions
 * @param plugin Plugin definition
 * @returns True if the plugin has any dangerous permissions
 */
export function hasDangerousPermissions(plugin: PluginDefinition): boolean {
  const permissions = getPluginPermissions(plugin);
  return permissions.some(permission => permission.dangerous);
}

/**
 * Get all dangerous permissions for a plugin
 * @param plugin Plugin definition
 * @returns Array of dangerous permissions
 */
export function getDangerousPermissions(plugin: PluginDefinition): Permission[] {
  const permissions = getPluginPermissions(plugin);
  return permissions.filter(permission => permission.dangerous);
}

/**
 * Validate plugin permissions
 * @param plugin Plugin definition
 * @returns Array of validation errors
 */
export function validatePluginPermissions(plugin: PluginDefinition): string[] {
  const errors: string[] = [];
  
  //console.log('validatePluginPermissions: plugin.id:', plugin.id);
  //console.log('validatePluginPermissions: plugin.security:', JSON.stringify(plugin.security, null, 2));
  //console.log('validatePluginPermissions: plugin.security.permissions:', JSON.stringify(plugin.security?.permissions, null, 2));

  if (!plugin.security || !plugin.security.permissions) {
    errors.push('Plugin security permissions are missing');
    return errors;
  }
  
  // Check if all permissions are valid
  for (const permissionName of plugin.security.permissions) {
    if (!PERMISSION_MAP.has(permissionName)) {
      errors.push(`Unknown permission: ${permissionName}`);
    }
  }
  
  return errors;
}
