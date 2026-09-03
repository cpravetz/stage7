const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['read', 'write', 'delete', 'manage'],
  editor: ['read', 'write'],
  viewer: ['read'],
};

export class RBACService {
  private roles: Map<string, string[]> = new Map();
  private userRoles: Map<string, string[]> = new Map();

  constructor() {
    Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([role, permissions]) => {
      this.roles.set(role, permissions);
    });
  }

  assignRole(userId: string, role: string): void {
    const current = this.userRoles.get(userId) || [];
    if (!current.includes(role)) {
      current.push(role);
      this.userRoles.set(userId, current);
    }

    if (!this.roles.has(role)) {
      this.roles.set(role, []);
    }
  }

  revokeRole(userId: string, role: string): void {
    const current = this.userRoles.get(userId) || [];
    const updated = current.filter((r) => r !== role);
    this.userRoles.set(userId, updated);
  }

  hasPermission(userId: string, permission: string): boolean {
    const roles = this.userRoles.get(userId) || [];
    for (const role of roles) {
      const permissions = this.roles.get(role) || [];
      if (permissions.includes(permission)) {
        return true;
      }
    }
    return false;
  }

  getRoles(userId: string): string[] {
    return this.userRoles.get(userId) || [];
  }
}
