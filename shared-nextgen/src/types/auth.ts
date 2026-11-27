export interface User {
  id: string;
  tenantId: string;
  orgId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  metadata: Record<string, unknown>;
  /**
   * bcrypt hash of the user's password (bcryptjs, cost 10). Optional on the
   * type only because the admin seed creates the account without one when
   * ADMIN_PASSWORD is unset — such an account fails closed at login and is
   * remediated by re-registering. The hash is persisted but never leaves the
   * auth service: every response strips it.
   */
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceAccount {
  id: string;
  tenantId: string;
  name: string;
  serviceId: string;
  scopes: string[];
  apiKeyHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPayload {
  sub: string;
  tenantId: string;
  orgId: string;
  roles?: string[];
  permissions?: string[];
  type: 'user' | 'service';
  iat: number;
  exp: number;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  service?: ServiceAccount;
  token?: string;
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantId?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  tenantId?: string;
  orgId?: string;
}

export interface ServiceAuthRequest {
  serviceId: string;
  apiKey: string;
  scopes?: string[];
}
