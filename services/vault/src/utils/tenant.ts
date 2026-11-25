import { Request } from 'express';
import { NextGenError, verifyTokenWithAuthService } from '@stage7-nextgen/shared';

export interface AuthenticatedTenantContext {
  tenantId: string;
  source: 'bearer' | 'body' | 'query';
  subject?: string;
}

const SYSTEM_TENANTS = new Set(['system', 'tenant-1', 'default']);

function normalizeTenant(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function verifyBearerTenant(token: string): Promise<AuthenticatedTenantContext | undefined> {
  const payload = await verifyTokenWithAuthService(token);
  const tenantId = normalizeTenant(payload?.tenantId || payload?.orgId);
  if (!tenantId) return undefined;
  return { tenantId, source: 'bearer', subject: payload?.sub };
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
