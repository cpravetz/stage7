export interface User {
  id: string;
  tenantId: string;
  orgId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  metadata: Record<string, unknown>;
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

export interface ServiceAuthRequest {
  serviceId: string;
  apiKey: string;
  scopes?: string[];
}
