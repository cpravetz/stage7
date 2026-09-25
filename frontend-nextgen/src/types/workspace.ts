import { EntityTool } from  '../stores/entityStore';
export interface ToolBinding {
  name: string;
  displayName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  config?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
}

export interface EntityToolWithManifest extends EntityTool {
  manifest?: Record<string, unknown>;
}

export interface AgentArtifact {
  id?: string;
  name?: string;
  type?: string;
  content?: string;
  url?: string;
}

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
  isSkill?: boolean;
  triggers?: Array<{ kind: string; [key: string]: unknown }>;
  inputSchema?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
}

export interface HITLApproval {
  id: string;
  missionId: string;
  phaseId: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  assistantId?: string;
  workflowId?: string;
}
