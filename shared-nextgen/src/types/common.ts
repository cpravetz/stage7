export type EntityId = string;
export type TenantId = string;
export type OrgId = string;
export type UserId = string;
export type MissionId = string;
export type ArtifactId = string;

export interface BaseEntity {
  id: EntityId;
  tenantId: TenantId;
  orgId: OrgId;
  createdAt: Date;
  updatedAt: Date;
  version?: number;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}
