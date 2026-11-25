import { Request } from 'express';
import { NextGenError, httpRequest, interServiceTimeoutMs } from '@stage7-nextgen/shared';

export interface AuthenticatedTenantContext {
  tenantId: string;
  source: 'bearer' | 'x-tenant-id' | 'body' | 'query';
  subject?: string;
}

interface VerifyPayload {
  sub?: string;
  tenantId?: string;
  orgId?: string;
  type?: string;
}

const SYSTEM_TENANTS = new Set(['system', 'tenant-1', 'default']);

function normalizeTenant(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function verifyBearerTenant(token: string): Promise<AuthenticatedTenantContext | undefined> {
  const authUrl = (process.env.AUTH_URL || 'http://auth:4300').replace(/\/+$/, '');
  try {
    const response = await httpRequest(`${authUrl}/api/auth/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: interServiceTimeoutMs(),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as { payload?: VerifyPayload; success?: boolean };
    const payload = data?.payload;
    const tenantId = normalizeTenant(payload?.tenantId || payload?.orgId);
    if (!tenantId) return undefined;
    return { tenantId, source: 'bearer', subject: payload?.sub };
  } catch {
    return undefined;
  }
}

export async function resolveTenantContext(req: Request): Promise<AuthenticatedTenantContext | undefined> {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const verified = await verifyBearerTenant(token);
      if (verified) return verified;
      // Fall through: invalid bearer should not grant access via spoofable headers/body.
      throw NextGenError.unauthorized('Invalid or expired authentication token');
    }
  }

  // Trusted internal/service context: gateway or internal callers may forward tenant explicitly.
  const headerTenant = normalizeTenant(req.headers['x-tenant-id']);
  if (headerTenant) {
    return { tenantId: headerTenant, source: 'x-tenant-id' };
  }

  const queryTenant = normalizeTenant(req.query?.tenantId);
  if (queryTenant) return { tenantId: queryTenant, source: 'query' };

  const bodyTenant = normalizeTenant((req.body as any)?.tenantId);
  if (bodyTenant) return { tenantId: bodyTenant, source: 'body' };

  return undefined;
}

export async function requireTenantContext(req: Request): Promise<AuthenticatedTenantContext> {
  const context = await resolveTenantContext(req);
  if (!context) {
    throw NextGenError.unauthorized('Authenticated tenant context is required');
  }
  return context;
}

export function assertTenantMatch(context: AuthenticatedTenantContext, requested: unknown): string {
  const tenantId = normalizeTenant(requested);
  if (!tenantId) return context.tenantId;
  if (tenantId !== context.tenantId) {
    throw NextGenError.forbidden('Tenant mismatch');
  }
  return context.tenantId;
}

export function defaultTenantForDiscovery(): string {
  return process.env.VAULT_DEFAULT_TENANT || 'system';
}
